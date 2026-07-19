const {
  COURSE_INVITE_TOKEN_TYPE,
  COURSE_SHARE_TOKEN_TYPE,
  getCourseInviteToken,
  getCourseShareToken,
  getInvite: getInviteFn,
} = require('@librechat/api');
const { createToken, findToken, deleteTokens } = require('~/models');
const { isCourseInvitationAvailable } = require('~/server/services/NativeCourseInvitations');

const getInvite = (encodedToken, email) =>
  getInviteFn(encodedToken, email, { createToken, findToken });

async function checkInviteUser(req, res, next) {
  const token = req.body.token;

  if (!token || token === 'undefined') {
    next();
    return;
  }

  try {
    const courseShare = await getCourseShareToken(token, { findToken });
    if (courseShare?.type === COURSE_SHARE_TOKEN_TYPE) {
      if (!(await isCourseInvitationAvailable(courseShare))) {
        return res.status(400).json({ message: 'This course join link is no longer available' });
      }
      req.courseInvite = courseShare;
      next();
      return;
    }

    const invite = await getInvite(token, req.body.email);

    if (!invite || invite.error === true) {
      return res.status(400).json({ message: 'Invalid invite token' });
    }

    if (invite.type === COURSE_INVITE_TOKEN_TYPE) {
      const courseInvite = await getCourseInviteToken(token, req.body.email, { findToken });
      if (!courseInvite) {
        return res.status(400).json({ message: 'Invalid or expired course invitation' });
      }
      if (!(await isCourseInvitationAvailable(courseInvite))) {
        return res.status(400).json({ message: 'This course invitation is no longer available' });
      }
      req.courseInvite = courseInvite;
      next();
      return;
    }

    await deleteTokens({ token: invite.token });
    req.invite = invite;
    next();
  } catch (error) {
    return res.status(429).json({ message: error.message });
  }
}

module.exports = checkInviteUser;
