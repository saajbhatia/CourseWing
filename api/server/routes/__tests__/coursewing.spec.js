const express = require('express');
const jwt = require('jsonwebtoken');
const { createHmac } = require('crypto');
const request = require('supertest');

let mockActiveTenantContext;

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  applyTenantIsolation: jest.fn(),
  tenantStorage: {
    run: jest.fn(async (context, fn) => {
      const previous = mockActiveTenantContext;
      mockActiveTenantContext = context;
      try {
        return await fn();
      } finally {
        mockActiveTenantContext = previous;
      }
    }),
  },
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
  getOptionalUserPluginAuthValue: jest.fn(),
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
}));
jest.mock('~/server/services/CourseWing', () => ({
  serviceFetch: jest.fn(),
  getCourseWingTenantId: jest.fn(),
  acquireCourseWingMutationLease: jest.fn(),
  getCourseWingTenantReferenceStatus: jest.fn(),
  getCourseWingCanvasIdentity: jest.fn(),
  assertNoPendingCourseWingDisconnect: jest.fn(),
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
  acquireCourseWingMutationLease,
  getCourseWingTenantReferenceStatus,
  getCourseWingCanvasIdentity,
  assertNoPendingCourseWingDisconnect,
  getOwnedChatSnapshot,
} = require('~/server/services/CourseWing');
const {
  getOptionalUserPluginAuthValue: getUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth,
} = require('~/server/services/PluginService');
const { isCourseWingEnabled } = require('@librechat/api');
const { tenantStorage } = require('@librechat/data-schemas');

const chatSnapshot = {
  version: 1,
  conversationId: 'conversation-1',
  targetMessageId: 'message-visible',
  messages: [{ role: 'user', text: 'Please fix this' }],
};
const TENANT_ONE = 'aaaaaaaaaaaaaaaa';
const TENANT_TWO = 'bbbbbbbbbbbbbbbb';
const CANVAS_ACCOUNT_KEY = 'cccccccccccccccccccccccc';
const GOOGLE_OAUTH_NONCE_COOKIE = 'coursewing_google_oauth_nonce';
const originalDomainClient = process.env.DOMAIN_CLIENT;
const originalDomainServer = process.env.DOMAIN_SERVER;
const originalJwtSecret = process.env.JWT_SECRET;
const originalDemoTenantId = process.env.COURSEWING_DEMO_TENANT_ID;

function expectedBindingId(userId = 'user-1', appTenantId = 'tenant-a') {
  return createHmac('sha256', process.env.JWT_SECRET)
    .update(
      JSON.stringify({
        version: 1,
        appTenantId,
        userId,
      }),
    )
    .digest('hex');
}

describe('CourseWing authenticated proxy routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.get('X-Test-Anonymous') !== 'true') {
        const requestedTenant = req.get('X-Test-Tenant');
        req.user = {
          id: 'user-1',
          name: 'Trusted Name',
          email: 'trusted@example.test',
          ...(requestedTenant !== 'default' ? { tenantId: requestedTenant ?? 'tenant-a' } : {}),
        };
      }
      next();
    });
    app.use('/api/coursewing', require('../coursewing'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveTenantContext = undefined;
    tenantStorage.run.mockImplementation(async (context, fn) => {
      const previous = mockActiveTenantContext;
      mockActiveTenantContext = context;
      try {
        return await fn();
      } finally {
        mockActiveTenantContext = previous;
      }
    });
    isCourseWingEnabled.mockReturnValue(true);
    getCourseWingTenantId.mockResolvedValue(TENANT_ONE);
    acquireCourseWingMutationLease.mockResolvedValue(jest.fn().mockResolvedValue(undefined));
    getCourseWingTenantReferenceStatus.mockResolvedValue('unreferenced');
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: TENANT_ONE,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    getOwnedChatSnapshot.mockResolvedValue(chatSnapshot);
    getUserPluginAuthValue.mockResolvedValue(null);
    updateUserPluginAuth.mockResolvedValue({});
    deleteUserPluginAuth.mockResolvedValue({ deletedCount: 1 });
    process.env.DOMAIN_CLIENT = 'https://coursewing.example.test';
    process.env.DOMAIN_SERVER = 'https://api.coursewing.example.test';
    process.env.JWT_SECRET = 'coursewing-route-test-secret';
    if (originalDemoTenantId === undefined) {
      delete process.env.COURSEWING_DEMO_TENANT_ID;
    } else {
      process.env.COURSEWING_DEMO_TENANT_ID = originalDemoTenantId;
    }
  });

  afterAll(() => {
    if (originalDomainClient === undefined) {
      delete process.env.DOMAIN_CLIENT;
    } else {
      process.env.DOMAIN_CLIENT = originalDomainClient;
    }
    if (originalDomainServer === undefined) {
      delete process.env.DOMAIN_SERVER;
    } else {
      process.env.DOMAIN_SERVER = originalDomainServer;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    if (originalDemoTenantId === undefined) {
      delete process.env.COURSEWING_DEMO_TENANT_ID;
    } else {
      process.env.COURSEWING_DEMO_TENANT_ID = originalDemoTenantId;
    }
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

  it.each([
    '/api/coursewing/canvas',
    '/api/coursewing/courses/current',
    '/api/coursewing/courses/42',
  ])('keeps %s authenticated when CourseWing is disabled', async (path) => {
    isCourseWingEnabled.mockReturnValue(false);

    const response = await request(app).get(path).set('X-Test-Anonymous', 'true');

    expect(response.status).toBe(401);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it.each([
    '/api/coursewing/canvas',
    '/api/coursewing/courses/current',
    '/api/coursewing/courses/42',
  ])('keeps HEAD %s authenticated when CourseWing is disabled', async (path) => {
    isCourseWingEnabled.mockReturnValue(false);

    const response = await request(app).head(path).set('X-Test-Anonymous', 'true');

    expect(response.status).toBe(401);
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

  it('reports a failed mutation-lease release before committing a successful response', async () => {
    const release = jest.fn().mockRejectedValue(new Error('CourseWing mutation lease was lost'));
    acquireCourseWingMutationLease.mockResolvedValueOnce(release);
    serviceFetch.mockResolvedValue({ ok: true, status: 200, body: [{ canvasCourseId: 42 }] });

    const response = await request(app).get('/api/coursewing/courses/current');

    expect(release).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ message: 'Canvas data unavailable' });
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
    '/api/coursewing/canvas',
    '/api/coursewing/canvas/',
    '/api/coursewing/courses/current',
    '/api/coursewing/COURSES/CURRENT',
    '/api/coursewing/courses/42',
    '/api/coursewing/courses/42/',
  ])('rejects anonymous reads from %s', async (path) => {
    const response = await request(app)
      .get(path)
      .set('X-Test-Anonymous', 'true')
      .set('X-Tenant-Id', TENANT_ONE);

    expect(response.status).toBe(401);
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it.each([
    '/api/coursewing/canvas',
    '/api/coursewing/courses/current',
    '/api/coursewing/courses/42',
  ])('rejects anonymous HEAD reads from %s', async (path) => {
    const response = await request(app)
      .head(path)
      .set('X-Test-Anonymous', 'true')
      .set('X-Tenant-Id', TENANT_ONE);

    expect(response.status).toBe(401);
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('ignores hostile browser origins when creating the Google OAuth state', async () => {
    process.env.DOMAIN_CLIENT = 'https://coursewing.example.test/apps/coursewing/';
    serviceFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { url: 'https://accounts.google.test/authorize' },
    });

    const response = await request(app)
      .get('/api/coursewing/google/auth-url')
      .set('Origin', 'https://attacker.example')
      .set('Referer', 'https://attacker.example/phishing');

    expect(response.status).toBe(200);
    const serviceUrl = new URL(serviceFetch.mock.calls[0][0], 'https://internal.example');
    expect(serviceUrl.searchParams.get('redirectUri')).toBe(
      'https://coursewing.example.test/apps/coursewing/api/coursewing/google/callback',
    );
    const state = jwt.verify(serviceUrl.searchParams.get('state'), process.env.JWT_SECRET);
    expect(state).toMatchObject({
      sub: 'user-1',
      purpose: 'coursewing_google_oauth',
      tenantId: 'tenant-a',
    });
    expect(typeof state.nonce).toBe('string');
    expect(state.nonce).toHaveLength(43);
    expect(state).not.toHaveProperty('origin');
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining(`${GOOGLE_OAUTH_NONCE_COOKIE}=${state.nonce}`),
    ]);
    expect(response.headers['set-cookie'][0]).toContain(
      'Path=/apps/coursewing/api/coursewing/google',
    );
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('Secure');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
  });

  it('returns from Google OAuth to the configured client subpath, not request headers', async () => {
    process.env.DOMAIN_CLIENT = 'https://coursewing.example.test/apps/coursewing/';
    const nonce = 'callback-browser-nonce';
    serviceFetch.mockImplementation(async () => {
      expect(mockActiveTenantContext).toEqual({
        tenantId: 'tenant-a',
        userId: 'user-1',
      });
      return {
        ok: true,
        status: 200,
        body: { tenantId: TENANT_ONE },
      };
    });
    const state = jwt.sign(
      {
        sub: 'user-1',
        purpose: 'coursewing_google_oauth',
        nonce,
        tenantId: 'tenant-a',
        origin: 'https://attacker.example',
      },
      process.env.JWT_SECRET,
    );

    const response = await request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state })
      .set('Cookie', `${GOOGLE_OAUTH_NONCE_COOKIE}=${nonce}`)
      .set('X-Test-Tenant', 'tenant-b')
      .set('Origin', 'https://attacker.example')
      .set('Referer', 'https://attacker.example/phishing');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://coursewing.example.test/apps/coursewing/c/new?classroom=connected',
    );
    expect(JSON.parse(serviceFetch.mock.calls[0][1].body)).toMatchObject({
      code: 'google-code',
      redirectUri: 'https://coursewing.example.test/apps/coursewing/api/coursewing/google/callback',
      bindingId: expectedBindingId(),
    });
    expect(response.headers['set-cookie'][0]).toContain(`${GOOGLE_OAUTH_NONCE_COOKIE}=;`);
    expect(tenantStorage.run).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', userId: 'user-1' },
      expect.any(Function),
    );
  });

  it('reports an OAuth error when the mutation lease is lost before redirecting', async () => {
    const nonce = 'callback-browser-nonce';
    acquireCourseWingMutationLease.mockResolvedValueOnce(
      jest.fn().mockRejectedValue(new Error('CourseWing mutation lease was lost')),
    );
    serviceFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { tenantId: TENANT_ONE },
    });
    const state = jwt.sign(
      {
        sub: 'user-1',
        purpose: 'coursewing_google_oauth',
        nonce,
        tenantId: 'tenant-a',
      },
      process.env.JWT_SECRET,
    );

    const response = await request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state })
      .set('Cookie', `${GOOGLE_OAUTH_NONCE_COOKIE}=${nonce}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://coursewing.example.test/c/new?classroom=error');
  });

  it.each([
    ['without a nonce cookie', null],
    ['with a mismatched nonce cookie', 'different-browser-nonce'],
  ])('rejects a signed OAuth state %s before tenant work', async (_label, cookieNonce) => {
    const state = jwt.sign(
      {
        sub: 'user-1',
        purpose: 'coursewing_google_oauth',
        nonce: 'expected-browser-nonce',
        tenantId: 'tenant-a',
      },
      process.env.JWT_SECRET,
    );
    const callback = request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state });
    if (cookieNonce) {
      callback.set('Cookie', `${GOOGLE_OAUTH_NONCE_COOKIE}=${cookieNonce}`);
    }

    const response = await callback;

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://coursewing.example.test/c/new?classroom=invalid',
    );
    expect(response.headers['set-cookie'][0]).toContain(`${GOOGLE_OAUTH_NONCE_COOKIE}=;`);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getUserPluginAuthValue).not.toHaveBeenCalled();
    expect(getCourseWingTenantId).not.toHaveBeenCalled();
    expect(tenantStorage.run).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing tenant claim', {}],
    ['a malformed tenant claim', { tenantId: '../../tenant-b' }],
  ])('rejects OAuth state with %s before entering tenant context', async (_label, tenantState) => {
    const nonce = 'expected-browser-nonce';
    const state = jwt.sign(
      {
        sub: 'user-1',
        purpose: 'coursewing_google_oauth',
        nonce,
        ...tenantState,
      },
      process.env.JWT_SECRET,
    );

    const response = await request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state })
      .set('Cookie', `${GOOGLE_OAUTH_NONCE_COOKIE}=${nonce}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://coursewing.example.test/c/new?classroom=invalid',
    );
    expect(tenantStorage.run).not.toHaveBeenCalled();
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getUserPluginAuthValue).not.toHaveBeenCalled();
  });

  it('preserves explicit default tenancy across the OAuth redirect', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { url: 'https://accounts.google.test/authorize' },
      })
      .mockImplementationOnce(async () => {
        expect(mockActiveTenantContext).toEqual({
          tenantId: undefined,
          userId: 'user-1',
        });
        return { ok: true, status: 200, body: { tenantId: TENANT_ONE } };
      });

    const authResponse = await request(app)
      .get('/api/coursewing/google/auth-url')
      .set('X-Test-Tenant', 'default');
    const serviceUrl = new URL(serviceFetch.mock.calls[0][0], 'https://internal.example');
    const state = serviceUrl.searchParams.get('state');
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    const cookie = authResponse.headers['set-cookie'][0].split(';', 1)[0];

    expect(payload.tenantId).toBeNull();

    const callback = await request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state })
      .set('Cookie', cookie)
      .set('X-Test-Tenant', 'tenant-b');

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(
      'https://coursewing.example.test/c/new?classroom=connected',
    );
    expect(tenantStorage.run).toHaveBeenCalledWith(
      { tenantId: undefined, userId: 'user-1' },
      expect.any(Function),
    );
  });

  it('rejects a malformed authenticated tenant before issuing an OAuth state', async () => {
    const response = await request(app)
      .get('/api/coursewing/google/auth-url')
      .set('X-Test-Tenant', '../../tenant-b');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid tenant context' });
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('retains the browser nonce for a normal dev flow and rejects a replay after consuming it', async () => {
    process.env.DOMAIN_CLIENT = 'http://localhost:3080';
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { url: 'https://accounts.google.test/authorize' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_ONE },
      });
    const browser = request.agent(app);

    const authResponse = await browser.get('/api/coursewing/google/auth-url');
    const serviceUrl = new URL(serviceFetch.mock.calls[0][0], 'https://internal.example');
    const state = serviceUrl.searchParams.get('state');

    expect(authResponse.status).toBe(200);
    expect(authResponse.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(authResponse.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(authResponse.headers['set-cookie'][0]).not.toContain('Secure');

    const callback = await browser
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('http://localhost:3080/c/new?classroom=connected');
    expect(serviceFetch).toHaveBeenCalledTimes(2);

    const replay = await browser
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state });

    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe('http://localhost:3080/c/new?classroom=invalid');
    expect(serviceFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the configured server origin when DOMAIN_CLIENT is invalid', async () => {
    process.env.DOMAIN_CLIENT = 'javascript:alert(1)';
    process.env.DOMAIN_SERVER = 'https://server.example.test/backend';
    serviceFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { url: 'https://accounts.google.test/authorize' },
    });

    const response = await request(app)
      .get('/api/coursewing/google/auth-url')
      .set('Origin', 'https://attacker.example')
      .set('Referer', 'https://attacker.example/phishing');

    expect(response.status).toBe(200);
    const serviceUrl = new URL(serviceFetch.mock.calls[0][0], 'https://internal.example');
    expect(serviceUrl.searchParams.get('redirectUri')).toBe(
      'https://server.example.test/api/coursewing/google/callback',
    );
  });

  it('fails OAuth initiation closed instead of trusting Host when no app base is configured', async () => {
    delete process.env.DOMAIN_CLIENT;
    delete process.env.DOMAIN_SERVER;

    const response = await request(app)
      .get('/api/coursewing/google/auth-url')
      .set('Host', 'attacker.example')
      .set('Origin', 'https://attacker.example');

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/DOMAIN_CLIENT or DOMAIN_SERVER/);
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('uses a relative callback redirect instead of trusting Host when no app base is configured', async () => {
    delete process.env.DOMAIN_CLIENT;
    delete process.env.DOMAIN_SERVER;
    const nonce = 'callback-browser-nonce';
    const state = jwt.sign(
      { sub: 'user-1', purpose: 'coursewing_google_oauth', nonce, tenantId: 'tenant-a' },
      process.env.JWT_SECRET,
    );

    const response = await request(app)
      .get('/api/coursewing/google/callback')
      .query({ code: 'google-code', state })
      .set('Cookie', `${GOOGLE_OAUTH_NONCE_COOKIE}=${nonce}`)
      .set('Host', 'attacker.example')
      .set('Origin', 'https://attacker.example')
      .set('Referer', 'https://attacker.example/phishing');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/c/new?classroom=error');
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getUserPluginAuthValue).not.toHaveBeenCalled();
    expect(getCourseWingTenantId).not.toHaveBeenCalled();
  });

  it.each([
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
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_ONE] }),
    );
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).toHaveBeenCalledTimes(5);
    expect(updateUserPluginAuth.mock.invocationCallOrder[0]).toBeLessThan(
      serviceFetch.mock.invocationCallOrder[0],
    );
    expect(serviceFetch.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUserPluginAuth.mock.invocationCallOrder[0],
    );
    expect(deleteUserPluginAuth.mock.calls.at(-1)[1]).toBe('canvas-pending-revocation');
  });

  it('does not revoke remotely when the durable disconnect intent cannot be saved', async () => {
    updateUserPluginAuth.mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(500);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('retains the disconnect intent when independent local credential cleanup fails', async () => {
    serviceFetch.mockResolvedValue({ ok: true, status: 200, body: { deleted: true } });
    deleteUserPluginAuth.mockImplementation(async (_userId, authField) =>
      authField === 'canvas-tenant' ? new Error('database unavailable') : { deletedCount: 1 },
    );

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(500);
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_ONE] }),
    );
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('automatically completes a durable disconnect before serving Canvas status', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_ONE] }),
    );
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, canvasAccountKey: CANVAS_ACCOUNT_KEY },
      });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      connected: true,
      isDefault: true,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    expect(serviceFetch).toHaveBeenNthCalledWith(1, `/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).toHaveBeenCalledTimes(5);
    expect(deleteUserPluginAuth.mock.calls.at(-1)[1]).toBe('canvas-pending-revocation');
  });

  it('fails status closed while a durable disconnect cannot be completed', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_ONE] }),
    );
    serviceFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      body: { error: 'temporarily unavailable' },
    });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/still being cleaned up/);
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('retains a malformed durable disconnect marker and fails status closed', async () => {
    getUserPluginAuthValue.mockResolvedValue(
      JSON.stringify({ type: 'disconnect', tenantIds: ['../../admin'] }),
    );

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/still being cleaned up/);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('retains a malformed unlinked-tenant marker and fails status closed', async () => {
    getUserPluginAuthValue.mockResolvedValue(
      JSON.stringify({ type: 'unlinked', tenantId: '../../admin', bindingScoped: true }),
    );

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('retains a typed malformed replacement marker and fails status closed', async () => {
    getUserPluginAuthValue.mockResolvedValue(
      JSON.stringify({
        type: 'replacement',
        tenantId: '../../admin',
        replacementTenantId: TENANT_TWO,
        bindingScoped: true,
      }),
    );

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('does not overwrite a malformed durable disconnect marker during disconnect', async () => {
    getUserPluginAuthValue.mockResolvedValue(JSON.stringify({ type: 'disconnect', tenantIds: [] }));

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(updateUserPluginAuth).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('does not overwrite an unlinked-tenant intent when its DELETE retry fails', async () => {
    getUserPluginAuthValue.mockResolvedValue(
      JSON.stringify({ type: 'unlinked', tenantId: TENANT_TWO, bindingScoped: true }),
    );
    serviceFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      body: { error: 'temporarily unavailable' },
    });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(updateUserPluginAuth).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('re-reads a referenced unlinked mapping before explicit disconnect cleanup', async () => {
    getCourseWingTenantId.mockResolvedValueOnce(null).mockResolvedValueOnce(TENANT_TWO);
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'unlinked', tenantId: TENANT_TWO, bindingScoped: true }),
    );
    getCourseWingTenantReferenceStatus.mockImplementation(async (_tenantId, excludedUserId) =>
      excludedUserId == null ? 'referenced' : 'unreferenced',
    );
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({ ok: false, status: 404, body: { error: 'no default tenant' } });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(getCourseWingTenantId).toHaveBeenCalledTimes(2);
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_TWO] }),
    );
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
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

  it('detaches locally without deleting a service tenant referenced by another user', async () => {
    getCourseWingTenantReferenceStatus.mockResolvedValue('referenced');
    serviceFetch.mockResolvedValue({
      ok: false,
      status: 404,
      body: { error: 'no default tenant' },
    });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(getCourseWingTenantReferenceStatus).toHaveBeenCalledWith(TENANT_ONE, 'user-1');
    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(serviceFetch).toHaveBeenCalledWith('/api/coursewing/tenant');
    expect(deleteUserPluginAuth).toHaveBeenCalledTimes(5);
  });

  it('revokes a stale pending tenant before touching the active tenant during disconnect', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        tenantId: TENANT_TWO,
        replacementTenantId: TENANT_ONE,
      }),
    );
    serviceFetch.mockImplementation(async (path) => {
      if (path === `/api/coursewing/tenants/${TENANT_TWO}`) {
        return { ok: false, status: 503, body: { error: 'temporarily unavailable' } };
      }
      if (path === `/api/coursewing/tenants/${TENANT_ONE}`) {
        return { ok: true, status: 200, body: { deleted: true } };
      }
      throw new Error(`Unexpected service path: ${path}`);
    });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(502);
    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(serviceFetch).not.toHaveBeenCalledWith(
      `/api/coursewing/tenants/${TENANT_ONE}`,
      expect.anything(),
    );
    expect(deleteUserPluginAuth).not.toHaveBeenCalled();
  });

  it('disconnect retains both sides of an uncommitted replacement intent', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        type: 'replacement',
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
        replacementTenantWasCreated: true,
        bindingScoped: true,
      }),
    );
    serviceFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      body: { error: 'temporarily unavailable' },
    });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(502);
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({
        type: 'disconnect',
        tenantIds: [TENANT_TWO, TENANT_ONE],
      }),
    );
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(serviceFetch).not.toHaveBeenCalledWith(
      `/api/coursewing/tenants/${TENANT_ONE}`,
      expect.anything(),
    );
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
    expect(JSON.parse(serviceFetch.mock.calls[0][1].body).bindingId).toBe(expectedBindingId());
    expect(deleteUserPluginAuth.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        'canvas-token',
        'legacy-canvas-token',
        'legacy-canvas-tenant',
        'canvas-pending-revocation',
      ]),
    );
  });

  it('cleans up a newly created replacement after a crash before mapping adoption', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        type: 'replacement',
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
        replacementTenantWasCreated: true,
        bindingScoped: true,
      }),
    );
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_ONE, canvasAccountKey: CANVAS_ACCOUNT_KEY },
      });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenNthCalledWith(1, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
    expect(serviceFetch.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUserPluginAuth.mock.invocationCallOrder[0],
    );
  });

  it('finishes local credential cleanup after a crash with the replacement mapping committed', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        type: 'replacement',
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
        replacementTenantWasCreated: true,
      }),
    );
    getCourseWingTenantId.mockResolvedValue(TENANT_TWO);
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: TENANT_TWO,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, canvasAccountKey: CANVAS_ACCOUNT_KEY },
      });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenNthCalledWith(1, `/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth.mock.calls.map((call) => call[1])).toEqual([
      'canvas-token',
      'legacy-canvas-token',
      'legacy-canvas-tenant',
      'canvas-pending-revocation',
    ]);
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-tenant');
  });

  it('retains replacement intent when crash recovery cannot revoke the unlinked tenant', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        type: 'replacement',
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
        replacementTenantWasCreated: true,
      }),
    );
    serviceFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      body: { error: 'temporarily unavailable' },
    });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
  });

  it('removes a newly registered tenant when the user mapping cannot be saved', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: true },
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

  it('removes a binding-scoped retry tenant when its first mapping cannot be saved', async () => {
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: false },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } });
    updateUserPluginAuth.mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
  });

  it('persists an unlinked-tenant retry when first mapping and rollback deletion fail', async () => {
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: { error: 'temporarily unavailable' },
      });
    updateUserPluginAuth
      .mockResolvedValueOnce(new Error('mapping database unavailable'))
      .mockResolvedValueOnce({});

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(updateUserPluginAuth).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({
        type: 'unlinked',
        tenantId: TENANT_TWO,
        bindingScoped: true,
      }),
    );
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('removes a binding-scoped retry tenant when replacement intent cannot be saved', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: false },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } });
    updateUserPluginAuth.mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(updateUserPluginAuth).not.toHaveBeenCalledWith(
      'user-1',
      'canvas-tenant',
      'coursewing',
      TENANT_TWO,
    );
  });

  it('re-persists replacement intent when its marker and rollback deletion initially fail', async () => {
    const replacementIntent = JSON.stringify({
      type: 'replacement',
      tenantId: TENANT_ONE,
      replacementTenantId: TENANT_TWO,
      replacementTenantWasCreated: false,
      bindingScoped: true,
    });
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: { error: 'temporarily unavailable' },
      });
    updateUserPluginAuth
      .mockResolvedValueOnce(new Error('marker database unavailable'))
      .mockResolvedValueOnce({});

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(updateUserPluginAuth).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      replacementIntent,
    );
    expect(updateUserPluginAuth).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      replacementIntent,
    );
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('clears an unlinked-tenant retry only after deletion succeeds', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'unlinked', tenantId: TENANT_TWO, bindingScoped: true }),
    );
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_ONE, canvasAccountKey: CANVAS_ACCOUNT_KEY },
      });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenNthCalledWith(1, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
    expect(serviceFetch.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUserPluginAuth.mock.invocationCallOrder[0],
    );
  });

  it('preserves a tenant referenced by an uncertain mapping before clearing its retry', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'unlinked', tenantId: TENANT_TWO, bindingScoped: true }),
    );
    getCourseWingTenantId.mockResolvedValue(TENANT_TWO);
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: TENANT_TWO,
      canvasAccountKey: CANVAS_ACCOUNT_KEY,
    });
    getCourseWingTenantReferenceStatus.mockResolvedValue('referenced');
    serviceFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { tenantId: TENANT_TWO, canvasAccountKey: CANVAS_ACCOUNT_KEY },
    });

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(getCourseWingTenantReferenceStatus).toHaveBeenCalledWith(TENANT_TWO, undefined);
    expect(serviceFetch).not.toHaveBeenCalledWith(
      `/api/coursewing/tenants/${TENANT_TWO}`,
      expect.anything(),
    );
    expect(deleteUserPluginAuth).toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('retains unlinked cleanup when the cross-tenant reference scan is indeterminate', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'unlinked', tenantId: TENANT_TWO, bindingScoped: true }),
    );
    getCourseWingTenantReferenceStatus.mockResolvedValue('indeterminate');

    const response = await request(app).get('/api/coursewing/canvas');

    expect(response.status).toBe(503);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
  });

  it('does not delete the shared demo tenant when its mapping cannot be saved', async () => {
    process.env.COURSEWING_DEMO_TENANT_ID = TENANT_TWO;
    getCourseWingTenantId.mockResolvedValue(null);
    serviceFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { tenantId: TENANT_TWO, frozenNow: '2026-07-15T12:00:00.000Z' },
    });
    updateUserPluginAuth.mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).post('/api/coursewing/demo');

    expect(response.status).toBe(502);
    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_TWO}`);
  });

  it('retains replacement intent when mapping storage and orphan cleanup both fail', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: true },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: { error: 'temporarily unavailable' },
      });
    updateUserPluginAuth
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(new Error('database unavailable'));

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(502);
    expect(updateUserPluginAuth).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({
        type: 'replacement',
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
        replacementTenantWasCreated: true,
        bindingScoped: true,
      }),
    );
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_TWO}`, {
      method: 'DELETE',
    });
    expect(deleteUserPluginAuth).not.toHaveBeenCalledWith('user-1', 'canvas-pending-revocation');
  });

  it('cleans up a binding-scoped existing tenant when saving its mapping fails', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { tenantId: TENANT_TWO, userName: 'Canvas User', isNew: false },
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

  it('treats an uncertain mapping write as committed when its reread observes the new tenant', async () => {
    getCourseWingTenantId.mockResolvedValueOnce(TENANT_ONE).mockResolvedValueOnce(TENANT_TWO);
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          tenantId: TENANT_TWO,
          canvasAccountKey: CANVAS_ACCOUNT_KEY,
          userName: 'Canvas User',
          isNew: true,
        },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } });
    updateUserPluginAuth
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(new Error('write acknowledgement timed out'));

    const response = await request(app).put('/api/coursewing/canvas').send({ token: 'new-token' });

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenNthCalledWith(2, `/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(serviceFetch).not.toHaveBeenCalledWith(
      `/api/coursewing/tenants/${TENANT_TWO}`,
      expect.anything(),
    );
    expect(deleteUserPluginAuth.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        'canvas-token',
        'legacy-canvas-token',
        'legacy-canvas-tenant',
        'canvas-pending-revocation',
      ]),
    );
  });

  it('does not add an uncommitted replacement from a legacy marker to disconnect cleanup', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        tenantId: TENANT_ONE,
        replacementTenantId: TENANT_TWO,
      }),
    );
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: { deleted: true } })
      .mockResolvedValueOnce({ ok: false, status: 404, body: { error: 'no default tenant' } });

    const response = await request(app).delete('/api/coursewing/canvas');

    expect(response.status).toBe(200);
    expect(updateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'canvas-pending-revocation',
      'coursewing',
      JSON.stringify({ type: 'disconnect', tenantIds: [TENANT_ONE] }),
    );
    expect(serviceFetch).toHaveBeenCalledWith(`/api/coursewing/tenants/${TENANT_ONE}`, {
      method: 'DELETE',
    });
    expect(serviceFetch).not.toHaveBeenCalledWith(
      `/api/coursewing/tenants/${TENANT_TWO}`,
      expect.anything(),
    );
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

  it('does not invite duplicate feedback when lease release fails after commit', async () => {
    const release = jest.fn().mockRejectedValue(new Error('lease lost after commit'));
    acquireCourseWingMutationLease.mockResolvedValueOnce(release);
    serviceFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      body: { feedback: { id: 9 } },
    });

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Committed exactly once',
      category: 'bug',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ feedback: { id: 9 } });
    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails feedback closed while a durable disconnect is pending', async () => {
    assertNoPendingCourseWingDisconnect.mockRejectedValueOnce(
      Object.assign(new Error('Canvas disconnect cleanup is still pending'), {
        code: 'COURSEWING_DISCONNECT_PENDING',
      }),
    );

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Connection state feedback',
      category: 'bug',
    });

    expect(response.status).toBe(502);
    expect(serviceFetch).not.toHaveBeenCalled();
    expect(getCourseWingTenantId).not.toHaveBeenCalled();
  });

  it('does not send feedback if a disconnect begins after tenant selection', async () => {
    assertNoPendingCourseWingDisconnect.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      Object.assign(new Error('Canvas disconnect cleanup is still pending'), {
        code: 'COURSEWING_DISCONNECT_PENDING',
      }),
    );

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Connection race feedback',
      category: 'bug',
    });

    expect(response.status).toBe(502);
    expect(assertNoPendingCourseWingDisconnect).toHaveBeenCalledTimes(2);
    expect(getCourseWingTenantId).toHaveBeenCalledWith('user-1');
    expect(serviceFetch).not.toHaveBeenCalled();
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

  it('reports committed feedback as successful when chat sharing throws', async () => {
    serviceFetch
      .mockResolvedValueOnce({ ok: true, status: 201, body: { feedback: { id: 4 } } })
      .mockRejectedValueOnce(new Error('chat-share response lost'));

    const response = await request(app).post('/api/coursewing/feedback').send({
      message: 'Please keep the committed feedback',
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
    expect(serviceFetch).toHaveBeenCalledTimes(2);
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
