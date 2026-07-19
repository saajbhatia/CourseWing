const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

const { CourseMember } = createModels(mongoose);

/**
 * Runtime capability check for native-course chat tools.
 * The course service remains the authorization boundary for every operation.
 */
async function hasNativeCourseAccess(userId, _email) {
  if (!userId) {
    return false;
  }
  const membership = await CourseMember.exists({ userId, state: 'active' });
  return Boolean(membership);
}

module.exports = { hasNativeCourseAccess };
