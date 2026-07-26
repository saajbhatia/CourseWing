const express = require('express');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  isCourseWingEnabled: jest.fn(() => true),
}));
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) =>
    req.user ? next() : res.status(401).json({ message: 'Unauthorized' }),
  createFeedbackLimiters: () => ({
    feedbackIpLimiter: (_req, _res, next) => next(),
    feedbackUserLimiter: (_req, _res, next) => next(),
  }),
}));
jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
}));
jest.mock('~/server/services/CourseWing', () => ({
  serviceFetch: jest.fn(),
  getCourseWingTenantId: jest.fn(),
  getCourseWingCanvasIdentity: jest.fn(),
  getOwnedChatSnapshot: jest.fn(),
  clearCourseWingCanvasIdentityCache: jest.fn(),
  COURSEWING_PLUGIN_KEY: 'coursewing',
  CANVAS_TOKEN_FIELD: 'canvas-token',
  CANVAS_TENANT_FIELD: 'canvas-tenant',
  CANVAS_PENDING_REVOCATION_FIELD: 'canvas-pending-revocation',
  LEGACY_CANVAS_TOKEN_FIELD: 'legacy-canvas-token',
  LEGACY_CANVAS_TENANT_FIELD: 'legacy-canvas-tenant',
}));

const {
  serviceFetch,
  getCourseWingTenantId,
  getCourseWingCanvasIdentity,
  getOwnedChatSnapshot,
} = require('~/server/services/CourseWing');
const {
  getUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth,
} = require('~/server/services/PluginService');
const { isCourseWingEnabled } = require('@librechat/api');

const chatSnapshot = {
  version: 1,
  conversationId: 'conversation-1',
  targetMessageId: 'message-visible',
  messages: [{ role: 'user', text: 'Please fix this' }],
};
const TENANT_ONE = 'aaaaaaaaaaaaaaaa';
const TENANT_TWO = 'bbbbbbbbbbbbbbbb';
const CANVAS_ACCOUNT_KEY = 'cccccccccccccccccccccccc';

describe('CourseWing authenticated proxy routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.get('X-Test-Anonymous') !== 'true') {
        req.user = {
          id: 'user-1',
          name: 'Trusted Name',
          email: 'trusted@example.test',
        };
      }
      next();
    });
    app.use('/api/coursewing', require('../coursewing'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    isCourseWingEnabled.mockReturnValue(true);
    getCourseWingTenantId.mockResolvedValue(TENANT_ONE);
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: TENANT_ONE,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    getOwnedChatSnapshot.mockResolvedValue(chatSnapshot);
    getUserPluginAuthValue.mockResolvedValue(null);
    updateUserPluginAuth.mockResolvedValue({});
    deleteUserPluginAuth.mockResolvedValue({ deletedCount: 1 });
  });

  it('fails closed and reports the feature as disabled when CourseWing is off', async () => {
    isCourseWingEnabled.mockReturnValue(false);

    const status = await request(app).get('/api/coursewing/canvas');
    const courses = await request(app).get('/api/coursewing/courses');

    expect(status.status).toBe(200);
    expect(status.body).toEqual({ enabled: false, connected: false });
    expect(courses.status).toBe(404);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('maps course data to the authenticated user tenant server-side', async () => {
    serviceFetch.mockResolvedValue({ ok: true, status: 200, body: [{ canvasCourseId: 42 }] });

    const response = await request(app)
      .get('/api/coursewing/courses/current')
      .set('X-Tenant-Id', 'attacker-controlled');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenCalledWith('/api/coursewing/courses/current', {
      headers: { 'X-Tenant-Id': TENANT_ONE },
    });
  });

  it('does not expose the unused unbounded bulk-course proxy', async () => {
    const response = await request(app).get('/api/coursewing/courses');

    expect(response.status).toBe(404);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('fails the course request cleanly when the service response exceeds its byte cap', async () => {
    serviceFetch.mockRejectedValueOnce(
      Object.assign(new Error('Canvas service response exceeds the 2097152-byte safety limit'), {
        code: 'CANVAS_SERVICE_RESPONSE_TOO_LARGE',
      }),
    );

    const response = await request(app).get('/api/coursewing/courses/42');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ message: 'Canvas data unavailable' });
  });

  it('returns an allowlisted Canvas status without exposing the internal service tenant id', async () => {
    serviceFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        tenantId: TENANT_ONE,
        canvasAccountKey: CANVAS_ACCOUNT_KEY,
        userName: 'Canvas User',
        baseUrl: 'https://canvas.example.test',
        lastSyncAt: '2026-07-15T12:00:00.000Z',
        syncing: false,
        courseCount: 4,
        token: 'must-not-leak',
        unexpected: 'must-not-leak',
      },
    });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      connected: true,
      isDefault: false,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
      userName: 'Canvas User',
      baseUrl: 'https://canvas.example.test',
      lastSyncAt: '2026-07-15T12:00:00.000Z',
      syncing: false,
      courseCount: 4,
    });
    expect(response.body).not.toHaveProperty('tenantId');
    expect(response.body).not.toHaveProperty('token');
  });

  it('serves the server-owned default account when the signed-in user has no override', async () => {
    getCourseWingTenantId.mockResolvedValue(null);
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: TENANT_TWO,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    serviceFetch.mockResolvedValue({ ok: true, status: 200, body: [{ canvasCourseId: 42 }] });

    const response = await request(app).get('/api/coursewing/courses/current');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenCalledWith('/api/coursewing/courses/current', {
      headers: { 'X-Tenant-Id': TENANT_TWO },
    });
  });

  it.each([
    ['get', '/api/coursewing/canvas'],
    ['get', '/api/coursewing/courses/current'],
    ['get', '/api/coursewing/courses/42'],
    ['put', '/api/coursewing/canvas'],
    ['delete', '/api/coursewing/canvas'],
    ['post', '/api/coursewing/feedback'],
  ])('keeps %s %s authenticated', async (method, path) => {
    const response = await request(app)[method](path).set('X-Test-Anonymous', 'true').send({
      token: 'not-used',
      message: 'not-used',
    });

    expect(response.status).toBe(401);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('deletes the service tenant before removing the local connection', async () => {
    serviceFetch.mockResolvedValue({ ok: true, status: 200, body: { deleted: true } });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).toHaveBeenCalledTimes(5);
    expect(serviceFetch.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUserPluginAuth.mock.invocationCallOrder[0],
    );
  });

  it('can detach a user mapping from the environment-backed default tenant', async () => {
    serviceFetch.mockResolvedValue({
      ok: false,
      status: 409,
      body: { error: 'default tenant cannot be deleted' },
    });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(deleteUserPluginAuth).toHaveBeenCalledTimes(5);
  });

  it('revokes a replaced tenant and removes legacy local token fields', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          tenantId: TENANT_TWO,
          canvasAccountKey: CANVAS_ACCOUNT_KEY,
          userName: 'Canvas User',
          token: 'must-not-leak',
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        body: { error: 'default tenant cannot be deleted' },
      });

    const response = await request(app)
      .put('/api/coursewing/canvas')
      .send({ token: 'new-token', baseUrl: 'https://canvas.example.test' });

    expect(response.status).toBe(200);
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-tenant',
      'coursewing',
      TENANT_TWO,
    );
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(response.body).not.toHaveProperty('tenantId');
    expect(response.body).not.toHaveProperty('token');
    expect(response.body.canvasAccountKey).toBe(CANVAS_ACCOUNT_KEY);
    expect(deleteUserPluginAuth.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        'canvas-token',
        'legacy-canvas-token',
        'legacy-canvas-tenant',
        'canvas-pending-revocation',
      ]),
    );
  });

  it('removes a newly registered tenant when the user mapping cannot be saved', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User' },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } });
    updateUserPluginAuth
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
  });

  it('rejects a malformed tenant id returned during connection before storing or using it', async () => {
    serviceFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { tenantId: '../admin/delete', userName: 'Canvas User' },
    });

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(updateUserPluginAuth).not.toHaveBeenCalled();
    expect(serviceFetch).toHaveBeenCalledTimes(1);
  });

  it('clears malformed pending tenant ids and still serves the safe default account', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        tenantId: '../../admin',
        replacementTenantId: TENANT_TWO,
      }),
    );
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { tenantId: TENANT_ONE, canvasAccountKey: CANVAS_ACCOUNT_KEY },
    });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      connected: true,
      isDefault: true,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    expect(serviceFetch).toHaveBeenCalledWith('/api/coursewing/tenant', {
      headers: { 'X-Tenant-Id': TENANT_ONE },
    });
    expect(getUserPluginAuthValue).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      false,
      'coursewing',
    );
    expect(deleteUserPluginAuth).toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('verifies chat ownership and asserts explicit consent before sharing feedback', async () => {
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 201, body: { feedback: { id: 4 } } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { updated: 1 } });

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Please fix this',
      category: 'bug',
      shareChat: true,
      conversationId: 'conversation-1',
      targetMessageId: 'message-visible',
      userName: 'Spoofed Name',
      userEmail: 'spoofed@example.test',
    });

    expect(response.status).toBe(201);
    expect(getOwnedChatSnapshot).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      'message-visible',
    );
    const createBody = JSON.parse(serviceFetch.mock.calls[0][1].body);
    expect(createBody.userName).toBe('Trusted Name');
    expect(createBody.userEmail).toBe('trusted@example.test');
    expect(serviceFetch.mock.calls[1]).toEqual([
      '/api/coursewing/feedback',
      {
        method: 'POST',
        headers: {
          'X-Tenant-Id': TENANT_ONE,
          'X-CourseWing-Chat-Share-Consent': 'explicit',
        },
        body: JSON.stringify({
          feedbackId: 4,
          conversationId: 'conversation-1',
          targetMessageId: 'message-visible',
          shareChat: true,
          chatSnapshot,
        }),
      },
    ]);
  });

  it('reports a successful feedback send without inviting a duplicate retry if sharing fails', async () => {
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 201, body: { feedback: { id: 4 } } })
      .mockResolvedValueOnce({ ok: false, status: 502, body: { error: 'unavailable' } });

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Please fix this',
      shareChat: true,
      conversationId: 'conversation-1',
      targetMessageId: 'message-visible',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      feedback: { id: 4 },
      warning: 'chat_share_failed',
      chatShared: false,
    });
  });

  it('does not share a conversation the authenticated user does not own', async () => {
    getOwnedChatSnapshot.mockResolvedValue(null);

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Please fix this',
      shareChat: true,
      conversationId: 'not-owned',
      targetMessageId: 'message-visible',
    });

    expect(response.status).toBe(404);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported feedback categories before calling the internal service', async () => {
    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Please classify this safely',
      category: 'arbitrary-unbounded-category',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/category must be one of/i);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('rejects oversized feedback references before looking up a chat', async () => {
    const response = await request(app)
      .post('/api/coursewing/feedback')
      .send({
        message: 'Please fix this',
        shareChat: true,
        conversationId: 'c'.repeat(257),
        targetMessageId: 'message-visible',
      });

    expect(response.status).toBe(413);
    expect(getOwnedChatSnapshot).not.toHaveBeenCalled();
    expect(serviceFetch).not.toHaveBeenCalled();
  });
});
