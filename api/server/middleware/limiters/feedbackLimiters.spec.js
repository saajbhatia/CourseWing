const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn(() => undefined),
  removePorts: (request_) => request_['ip'],
}));

const { createFeedbackLimiters } = require('./feedbackLimiters');

function appWith(middleware) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: req.get('X-Test-User') ?? 'user-1' };
    next();
  });
  app.post('/feedback', middleware, (_req, res) => res.status(204).end());
  return app;
}

describe('LearnLight feedback rate limits', () => {
  it('enforces the independent IP write budget', async () => {
    const { feedbackIpLimiter } = createFeedbackLimiters({ ipMax: 2, ipWindowMinutes: 1 });
    const app = appWith(feedbackIpLimiter);

    expect((await request(app).post('/feedback')).status).toBe(204);
    expect((await request(app).post('/feedback')).status).toBe(204);
    const limited = await request(app).post('/feedback');

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ message: 'Too many feedback requests. Try again later' });
  });

  it('enforces the independent authenticated-user write budget', async () => {
    const { feedbackUserLimiter } = createFeedbackLimiters({
      userMax: 2,
      userWindowMinutes: 1,
    });
    const app = appWith(feedbackUserLimiter);

    expect((await request(app).post('/feedback').set('X-Test-User', 'same-user')).status).toBe(204);
    expect((await request(app).post('/feedback').set('X-Test-User', 'same-user')).status).toBe(204);
    const limited = await request(app).post('/feedback').set('X-Test-User', 'same-user');

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ message: 'Too many feedback requests. Try again later' });
  });
});
