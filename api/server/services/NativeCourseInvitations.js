const mongoose = require('mongoose');
const {
  COURSE_INVITE_TOKEN_TYPE,
  COURSE_SHARE_TOKEN_TYPE,
  getCourseInviteToken,
  getCourseShareToken,
} = require('@librechat/api');
const { createModels } = require('@librechat/data-schemas');
const { deleteTokens, findToken } = require('~/models');

const { Course, CourseMember } = createModels(mongoose);

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function isCourseInvitationAvailable(invite) {
  const courseId = typeof invite?.identifier === 'string' ? invite.identifier : '';
  const email = normalizeEmail(invite?.email);
  if (!courseId) {
    return false;
  }
  if (invite?.type === COURSE_SHARE_TOKEN_TYPE) {
    return Boolean(await Course.exists({ _id: courseId, status: 'active' }));
  }
  if (!email || invite?.type !== COURSE_INVITE_TOKEN_TYPE) {
    return false;
  }
  const [course, membership] = await Promise.all([
    Course.exists({ _id: courseId, status: 'active' }),
    CourseMember.exists({
      courseId,
      normalizedEmail: email,
      role: 'student',
      state: { $in: ['pending', 'active'] },
    }),
  ]);
  return Boolean(course && membership);
}

/**
 * Activates the one pending membership addressed by a validated course invite,
 * then consumes the token. Re-running after a transient response failure is
 * safe when the same user already owns the active membership.
 */
async function completeCourseInvitation(invite, userId, submittedEmail) {
  const courseId = typeof invite?.identifier === 'string' ? invite.identifier : '';
  const shareInvite = invite?.type === COURSE_SHARE_TOKEN_TYPE;
  const email = normalizeEmail(shareInvite ? submittedEmail : invite?.email);
  if (
    !courseId ||
    !email ||
    !userId ||
    (invite?.type !== COURSE_INVITE_TOKEN_TYPE && !shareInvite) ||
    !invite?.token
  ) {
    throw new Error('Invalid course invitation');
  }

  const course = await Course.exists({ _id: courseId, status: 'active' });
  if (!course) {
    throw new Error('The invited course is no longer available');
  }

  if (shareInvite) {
    const existingMembership = await CourseMember.findOne({
      courseId,
      normalizedEmail: email,
      state: { $in: ['pending', 'active'] },
    });
    if (existingMembership?.role === 'teacher') {
      return existingMembership;
    }
    if (
      existingMembership?.state === 'active' &&
      existingMembership.userId &&
      existingMembership.userId.toString() !== userId.toString()
    ) {
      throw new Error('This email is already connected to another course member');
    }
    return await CourseMember.findOneAndUpdate(
      { courseId, normalizedEmail: email },
      {
        $set: {
          userId: userId.toString(),
          email,
          role: 'student',
          state: 'active',
          invitedBy: invite.userId.toString(),
          joinedAt: existingMembership?.joinedAt || new Date(),
        },
        $setOnInsert: { courseId, normalizedEmail: email },
      },
      { new: true, upsert: true },
    );
  }

  const membership = await CourseMember.findOne({
    courseId,
    normalizedEmail: email,
    role: 'student',
    state: { $in: ['pending', 'active'] },
  });
  if (!membership) {
    throw new Error('The course invitation is no longer available');
  }
  if (
    membership.state === 'active' &&
    membership.userId &&
    membership.userId.toString() !== userId.toString()
  ) {
    throw new Error('The course invitation has already been claimed');
  }

  if (membership.state !== 'active' || !membership.userId) {
    membership.userId = userId.toString();
    membership.state = 'active';
    membership.joinedAt = new Date();
    await membership.save();
  }

  await deleteTokens({
    token: invite.token,
    email,
    type: COURSE_INVITE_TOKEN_TYPE,
    identifier: courseId,
  });
  return membership;
}

/**
 * Claims either a reusable course share link or an email-bound course invite
 * for an already-authenticated user. The token record remains authoritative
 * for the course id, so query-string course ids cannot redirect membership.
 */
async function claimCourseInvitation(encodedToken, userId, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!encodedToken || !userId || !normalizedEmail) {
    throw new Error('A valid course invitation and signed-in account are required');
  }

  const shareInvite = await getCourseShareToken(encodedToken, { findToken });
  const invite =
    shareInvite ?? (await getCourseInviteToken(encodedToken, normalizedEmail, { findToken }));
  if (!invite) {
    throw new Error('This course invitation is invalid or has expired');
  }
  if (!(await isCourseInvitationAvailable(invite))) {
    throw new Error('This course invitation is no longer available');
  }

  await completeCourseInvitation(invite, userId, normalizedEmail);
  return { courseId: invite.identifier };
}

module.exports = {
  claimCourseInvitation,
  completeCourseInvitation,
  isCourseInvitationAvailable,
};
