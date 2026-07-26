jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('librechat-data-provider', () => ({
  Constants: { NEW_CONVO: 'new' },
  extractPersona: jest.fn(() => null),
  stripCourseWingBlocks: jest.fn((prefix) => prefix),
  extractAssistanceLevel: jest.fn(() => null),
}));

jest.mock('@librechat/api', () => ({
  buildCourseCard: jest.fn((context) => `COURSE:${context.canvasCourseId}`),
  isCourseWingEnabled: jest.fn(() => true),
  buildPersonaPrompt: jest.fn(() => ''),
  buildAssignmentCard: jest.fn(() => ''),
  buildLearningDefault: jest.fn(() => 'LEARNING_DEFAULT'),
  getCourseContextSafe: jest.fn(),
  extractCanvasCourseId: jest.fn((prefix) => {
    const matches = [...String(prefix ?? '').matchAll(/^Canvas course ID:\s*(\d+)\s*$/gim)];
    return matches.length === 1 ? Number(matches[0][1]) : null;
  }),
  buildAssistancePolicy: jest.fn(() => ''),
  getAssignmentDetailSafe: jest.fn(() => null),
  extractCanvasAssignmentId: jest.fn(() => null),
}));

jest.mock('~/server/services/CourseWing', () => ({
  getCourseWingCanvasIdentity: jest.fn(),
}));

jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  getConvoCanvasAccountKey: jest.fn(),
}));

const { getCourseContextSafe, extractCanvasCourseId } = require('@librechat/api');
const { getCourseWingCanvasIdentity } = require('~/server/services/CourseWing');
const db = require('~/models');
const courseWingContext = require('./coursewing');

const CURRENT_ACCOUNT_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function createRequest(overrides = {}) {
  return {
    user: { id: 'user-1' },
    body: {
      conversationId: 'conversation-1',
      endpoint: 'agents',
      promptPrefix: 'Canvas course ID: 42',
    },
    ...overrides,
  };
}

describe('courseWingContext persisted Canvas scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: 'tenant-1',
      canvasAccountKey: CURRENT_ACCOUNT_KEY,
    });
    getCourseContextSafe.mockResolvedValue({ canvasCourseId: 42 });
    db.getConvo.mockResolvedValue({
      conversationId: 'conversation-1',
      canvasCourseId: 42,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    db.getConvoCanvasAccountKey.mockResolvedValue(CURRENT_ACCOUNT_KEY);
  });

  test('uses the persisted course id and hidden matching account key for an existing chat', async () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(db.getConvo).toHaveBeenCalledWith('user-1', 'conversation-1');
    expect(db.getConvoCanvasAccountKey).toHaveBeenCalledWith('user-1', 'conversation-1');
    expect(getCourseContextSafe).toHaveBeenCalledWith(42, { tenantId: 'tenant-1' });
    expect(req.courseWingCanvasTenantId).toBe('tenant-1');
    expect(req.courseWingCanvasAccountKey).toBe(CURRENT_ACCOUNT_KEY);
    expect(req.resolvedConversation).toEqual(
      expect.objectContaining({ conversationId: 'conversation-1', canvasCourseId: 42 }),
    );
  });

  test('rejects an omitted canonical marker on a persisted course chat', async () => {
    const req = createRequest({
      body: { conversationId: 'conversation-1', endpoint: 'agents', promptPrefix: 'General' },
    });
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'This course chat request is missing its Canvas course marker',
    });
    expect(next).not.toHaveBeenCalled();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
  });

  test('rejects a mismatched canonical marker before reading another course', async () => {
    const req = createRequest({
      body: {
        conversationId: 'conversation-1',
        endpoint: 'agents',
        promptPrefix: 'Canvas course ID: 99',
      },
    });
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(getCourseContextSafe).not.toHaveBeenCalled();
  });

  test('does not let a persisted general conversation become a course conversation', async () => {
    db.getConvo.mockResolvedValue({ conversationId: 'conversation-1' });
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Start a new course chat instead of changing an existing conversation',
    });
    expect(next).not.toHaveBeenCalled();
    expect(db.getConvoCanvasAccountKey).not.toHaveBeenCalled();
  });

  test('rejects a course chat whose hidden account key is not the current Canvas account', async () => {
    db.getConvoCanvasAccountKey.mockResolvedValue('bbbbbbbbbbbbbbbbbbbbbbbb');
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'This course chat belongs to a different Canvas account',
    });
    expect(next).not.toHaveBeenCalled();
    expect(getCourseContextSafe).not.toHaveBeenCalled();
  });

  test('preserves new course-conversation behavior without querying persisted scope', async () => {
    const req = createRequest({
      body: {
        conversationId: 'new',
        endpoint: 'agents',
        promptPrefix: 'Canvas course ID: 42',
      },
    });
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(db.getConvo).not.toHaveBeenCalled();
    expect(db.getConvoCanvasAccountKey).not.toHaveBeenCalled();
    expect(getCourseContextSafe).toHaveBeenCalledWith(42, { tenantId: 'tenant-1' });
    expect(req.courseWingCanvasTenantId).toBe('tenant-1');
    expect(req.courseWingCanvasAccountKey).toBe(CURRENT_ACCOUNT_KEY);
  });

  test('reuses a trusted conversation already resolved on the request', async () => {
    const resolvedConversation = {
      conversationId: 'conversation-1',
      canvasCourseId: 42,
    };
    const req = createRequest({ resolvedConversation });
    const res = createResponse();
    const next = jest.fn();

    await courseWingContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(db.getConvo).not.toHaveBeenCalled();
    expect(req.resolvedConversation).toBe(resolvedConversation);
  });

  test('treats duplicate course markers as non-canonical and rejects the persisted course request', async () => {
    const req = createRequest({
      body: {
        conversationId: 'conversation-1',
        endpoint: 'agents',
        promptPrefix: 'Canvas course ID: 42\nCanvas course ID: 42',
      },
    });
    const res = createResponse();

    await courseWingContext(req, res, jest.fn());

    expect(extractCanvasCourseId).toHaveReturnedWith(null);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(getCourseContextSafe).not.toHaveBeenCalled();
  });
});
