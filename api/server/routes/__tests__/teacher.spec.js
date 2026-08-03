const express = require('express');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) =>
    req.user ? next() : res.status(401).json({ message: 'Unauthorized' }),
}));

jest.mock('~/server/services/CourseWing', () => ({
  getCourseWingCanvasContext: jest.fn(),
}));

jest.mock('~/server/services/CourseWingTeacher', () => ({
  CourseWingReceipt: {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
  CourseWingCourseSetting: {
    updateOne: jest.fn(),
  },
  CourseWingActivity: {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    create: jest.fn(),
  },
  CONSOLE_LEVELS: ['open', 'guided', 'socratic'],
  isTeacherUser: jest.fn(),
  getCanvasCourseScope: jest.fn(),
  getCourseSetting: jest.fn(),
  clearCourseSettingCache: jest.fn(),
  refreshReceipts: jest.fn(),
  isActivityVisibleToUser: jest.fn((activity, user) => {
    if (!(activity.audience ?? []).length) {
      return true;
    }
    return activity.audience.some(
      (email) => email.toLowerCase() === (user.email ?? '').toLowerCase(),
    );
  }),
  getConversationMessages: jest.fn(),
  buildTranscript: jest.fn(),
  getUsersById: jest.fn(),
  displayName: jest.fn((user) => user?.name ?? 'Unknown student'),
  initials: jest.fn(() => 'US'),
  studentStatus: jest.fn(() => 'On track'),
  getPulse: jest.fn(),
  getStudentProfile: jest.fn(),
  answerAssistant: jest.fn(),
}));

const {
  CourseWingReceipt,
  CourseWingCourseSetting,
  CourseWingActivity,
  isTeacherUser,
  getCanvasCourseScope,
  getCourseSetting,
  clearCourseSettingCache,
  isActivityVisibleToUser,
  getConversationMessages,
  buildTranscript,
  getUsersById,
  getPulse,
} = require('~/server/services/CourseWingTeacher');
const { getCourseWingCanvasContext } = require('~/server/services/CourseWing');

const CANVAS_ACCOUNT_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_ACCOUNT_KEY = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CANVAS_COURSE_KEY = 'c'.repeat(64);
const ACTIVITY_ID = 'abcdef0123456789abcdef01';

function queryResult(result, steps = ['sort', 'limit']) {
  const query = {};
  for (const step of steps) {
    query[step] = jest.fn(() => query);
  }
  query.lean = jest.fn(async () => result);
  return query;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 'user-1',
      email: 'student@example.test',
      role: 'USER',
    };
    next();
  });
  app.use('/api/coursewing', require('../teacher'));
  return app;
}

describe('CourseWing teacher and student activity scoping', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    isTeacherUser.mockResolvedValue(true);
    getCanvasCourseScope.mockResolvedValue({
      tenantId: 'tenant-1',
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
      courseIds: new Set([42]),
      courses: new Map([[42, { courseKey: CANVAS_COURSE_KEY, isInstructor: true }]]),
    });
    getCourseWingCanvasContext.mockResolvedValue({
      identity: {
        tenantId: 'tenant-1',
        canvasAccountKey: CANVAS_ACCOUNT_KEY,
      },
      frozenNow: null,
    });
    getCourseSetting.mockResolvedValue(null);
    CourseWingCourseSetting.updateOne.mockResolvedValue({ matchedCount: 1 });
    getUsersById.mockResolvedValue(new Map());
    getPulse.mockResolvedValue(null);
  });

  it('pins the shared course key into settings reads and writes', async () => {
    const readResponse = await request(app).get('/api/coursewing/teacher/courses/42/settings');
    const writeResponse = await request(app)
      .put('/api/coursewing/teacher/courses/42/settings')
      .send({ helpLevel: 'socratic' });

    expect(readResponse.status).toBe(200);
    expect(writeResponse.status).toBe(200);
    expect(getCourseSetting).toHaveBeenCalledWith(CANVAS_COURSE_KEY, 42);
    expect(CourseWingCourseSetting.updateOne).toHaveBeenCalledWith(
      { canvasCourseKey: CANVAS_COURSE_KEY, canvasCourseId: 42 },
      { $set: { helpLevel: 'socratic' } },
      { upsert: true },
    );
    expect(clearCourseSettingCache).toHaveBeenCalledWith(CANVAS_COURSE_KEY);
  });

  it('queries teacher receipts only within the pinned shared course', async () => {
    CourseWingReceipt.find.mockReturnValue(queryResult([], ['sort']));

    const response = await request(app).get(
      '/api/coursewing/teacher/courses/42/overview?refresh=0',
    );

    expect(response.status).toBe(200);
    expect(CourseWingReceipt.find).toHaveBeenCalledWith({
      canvasCourseKey: CANVAS_COURSE_KEY,
      canvasCourseId: 42,
    });
    expect(getPulse).toHaveBeenCalledWith(CANVAS_COURSE_KEY, 42, [], expect.any(Map));
  });

  it('requires Canvas instructor membership even when the user has a teacher role', async () => {
    getCanvasCourseScope.mockResolvedValue({
      tenantId: 'tenant-1',
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
      courseIds: new Set([42]),
      courses: new Map([[42, { courseKey: CANVAS_COURSE_KEY, isInstructor: false }]]),
    });

    const response = await request(app).get('/api/coursewing/teacher/courses/42/settings');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Canvas instructor access is required' });
    expect(getCourseSetting).not.toHaveBeenCalled();
  });

  it('shares visible activities with a student account that has the same course key', async () => {
    getCanvasCourseScope.mockResolvedValue({
      tenantId: 'student-tenant',
      canvasAccountKey: OTHER_ACCOUNT_KEY,
      courseIds: new Set([42]),
      courses: new Map([[42, { courseKey: CANVAS_COURSE_KEY, isInstructor: false }]]),
    });
    CourseWingActivity.find.mockReturnValue(
      queryResult([
        {
          _id: ACTIVITY_ID,
          title: 'Whole class',
          type: 'Warm-up',
          level: 'guided',
          audience: [],
          startedBy: [],
        },
        {
          _id: '1234567890abcdef12345678',
          title: 'Someone else',
          type: 'Review session',
          level: 'socratic',
          audience: ['other@example.test'],
          startedBy: [],
        },
      ]),
    );

    const response = await request(app).get('/api/coursewing/activities?courseId=42');

    expect(response.status).toBe(200);
    expect(CourseWingActivity.find).toHaveBeenCalledWith({
      canvasCourseKey: CANVAS_COURSE_KEY,
      canvasCourseId: 42,
    });
    expect(response.body.activities).toHaveLength(1);
    expect(response.body.activities[0].title).toBe('Whole class');
    expect(response.body.activities[0]).not.toHaveProperty('audience');
    expect(response.body.activities[0]).not.toHaveProperty('startedCount');
  });

  it('does not query activities for a course outside the current Canvas membership', async () => {
    const response = await request(app).get('/api/coursewing/activities?courseId=99');

    expect(response.status).toBe(403);
    expect(CourseWingActivity.find).not.toHaveBeenCalled();
  });

  it('marks a visible activity started only inside its shared course scope', async () => {
    const activity = {
      _id: ACTIVITY_ID,
      canvasCourseKey: CANVAS_COURSE_KEY,
      canvasCourseId: 42,
      audience: ['student@example.test'],
    };
    CourseWingActivity.findOne.mockReturnValue({ lean: jest.fn(async () => activity) });
    CourseWingActivity.updateOne.mockResolvedValue({ matchedCount: 1 });

    const response = await request(app).post(`/api/coursewing/activities/${ACTIVITY_ID}/started`);

    expect(response.status).toBe(200);
    expect(CourseWingActivity.findOne).toHaveBeenCalledWith({
      _id: ACTIVITY_ID,
      $or: [{ canvasCourseId: 42, canvasCourseKey: CANVAS_COURSE_KEY }],
    });
    expect(CourseWingActivity.updateOne).toHaveBeenCalledWith(
      {
        _id: ACTIVITY_ID,
        canvasCourseKey: CANVAS_COURSE_KEY,
        canvasCourseId: 42,
      },
      { $addToSet: { startedBy: 'user-1' } },
    );
  });

  it('uses the frozen CourseWing clock for teacher stats and excludes future receipts', async () => {
    const frozenNow = new Date('2026-07-20T12:00:00.000Z');
    const now = frozenNow.getTime();
    getCourseWingCanvasContext.mockResolvedValue({
      identity: {
        tenantId: 'tenant-1',
        canvasAccountKey: CANVAS_ACCOUNT_KEY,
      },
      frozenNow,
    });
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2030-01-01T00:00:00.000Z').getTime());
    CourseWingReceipt.find.mockReturnValue(
      queryResult(
        [
          {
            userId: 'student-1',
            lastMessageAt: new Date(now - 24 * 60 * 60 * 1000),
            durationMinutes: 5,
          },
          {
            userId: 'student-2',
            lastMessageAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
            durationMinutes: 7,
          },
          {
            userId: 'student-3',
            lastMessageAt: new Date(now + 24 * 60 * 60 * 1000),
            durationMinutes: 10,
          },
        ],
        ['sort'],
      ),
    );

    try {
      const response = await request(app).get(
        '/api/coursewing/teacher/courses/42/overview?refresh=0',
      );

      expect(response.status).toBe(200);
      expect(response.body.stats.sessionsThisWeek).toBe(1);
      expect(response.body.stats.sessionsPriorWeek).toBe(1);
      expect(getCourseWingCanvasContext).toHaveBeenCalledWith('user-1');
      expect(getCanvasCourseScope).toHaveBeenCalledWith(
        'user-1',
        {
          tenantId: 'tenant-1',
          canvasAccountKey: CANVAS_ACCOUNT_KEY,
        },
        { forceRefresh: true },
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('cannot start an activity outside its audience', async () => {
    CourseWingActivity.findOne.mockReturnValue({
      lean: jest.fn(async () => ({
        _id: ACTIVITY_ID,
        canvasCourseKey: CANVAS_COURSE_KEY,
        canvasCourseId: 42,
        audience: ['other@example.test'],
      })),
    });

    const response = await request(app).post(`/api/coursewing/activities/${ACTIVITY_ID}/started`);

    expect(response.status).toBe(404);
    expect(isActivityVisibleToUser).toHaveBeenCalled();
    expect(CourseWingActivity.updateOne).not.toHaveBeenCalled();
  });

  it('unlocks only the selected receipt owner messages when conversation ids collide', async () => {
    CourseWingReceipt.findOne.mockReturnValue({
      lean: jest.fn(async () => ({
        _id: 'receipt-1',
        userId: 'student-2',
        flagType: 'answer_seeking',
      })),
    });
    CourseWingReceipt.updateOne.mockResolvedValue({ matchedCount: 1 });
    getConversationMessages.mockResolvedValue([{ text: 'Scoped message' }]);
    buildTranscript.mockReturnValue('Scoped transcript');

    const response = await request(app)
      .post('/api/coursewing/teacher/courses/42/receipts/shared-id/unlock')
      .send({ userId: 'student-2' });

    expect(response.status).toBe(200);
    expect(CourseWingReceipt.findOne).toHaveBeenCalledWith({
      canvasCourseKey: CANVAS_COURSE_KEY,
      canvasCourseId: 42,
      conversationId: 'shared-id',
      userId: 'student-2',
    });
    expect(getConversationMessages).toHaveBeenCalledWith('shared-id', 'student-2');
  });
});
