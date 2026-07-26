const rateLimit = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');

const DEFAULTS = Object.freeze({
  ipMax: 60,
  ipWindowMinutes: 15,
  userMax: 20,
  userWindowMinutes: 15,
});

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getFeedbackLimitConfig(overrides = {}) {
  return {
    ipMax: positiveInteger(overrides.ipMax ?? process.env.FEEDBACK_IP_MAX, DEFAULTS.ipMax),
    ipWindowMinutes: positiveInteger(
      overrides.ipWindowMinutes ?? process.env.FEEDBACK_IP_WINDOW,
      DEFAULTS.ipWindowMinutes,
    ),
    userMax: positiveInteger(overrides.userMax ?? process.env.FEEDBACK_USER_MAX, DEFAULTS.userMax),
    userWindowMinutes: positiveInteger(
      overrides.userWindowMinutes ?? process.env.FEEDBACK_USER_WINDOW,
      DEFAULTS.userWindowMinutes,
    ),
  };
}

function feedbackLimitHandler(_req, res) {
  return res.status(429).json({ message: 'Too many feedback requests. Try again later' });
}

/**
 * Feedback has its own small write budget so it cannot consume the much larger chat-message
 * allowance. The factory keeps tests and multi-process Redis prefixes isolated by limiter kind.
 */
function createFeedbackLimiters(overrides) {
  const { ipMax, ipWindowMinutes, userMax, userWindowMinutes } = getFeedbackLimitConfig(overrides);

  const feedbackIpLimiter = rateLimit({
    windowMs: ipWindowMinutes * 60 * 1000,
    max: ipMax,
    handler: feedbackLimitHandler,
    keyGenerator: removePorts,
    store: limiterCache('coursewing_feedback_ip_limiter'),
  });
  const feedbackUserLimiter = rateLimit({
    windowMs: userWindowMinutes * 60 * 1000,
    max: userMax,
    handler: feedbackLimitHandler,
    keyGenerator(req) {
      return req.user?.id;
    },
    store: limiterCache('coursewing_feedback_user_limiter'),
  });

  return { feedbackIpLimiter, feedbackUserLimiter };
}

module.exports = { createFeedbackLimiters };
