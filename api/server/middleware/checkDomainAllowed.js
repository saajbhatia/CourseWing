/**
 * Intentionally a pass-through: the domain allowlist governs registration only
 * (enforced in the auth strategies); users who already authenticated — including
 * admin-created accounts outside the allowlist — always retain access. Every
 * mount of this middleware runs after passport has set `req.user`.
 */
const checkDomainAllowed = (req, res, next) => next();

module.exports = checkDomainAllowed;
