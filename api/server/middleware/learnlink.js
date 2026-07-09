const { logger } = require('@librechat/data-schemas');
const {
  stripLearnLinkBlocks,
  extractAssistanceLevel,
  defaultAssistanceLevel,
} = require('librechat-data-provider');
const {
  buildCourseCard,
  isLearnLinkEnabled,
  getCourseContextSafe,
  extractCanvasCourseId,
  buildAssistancePolicy,
} = require('@librechat/api');
const { getLearnLinkTenantId } = require('~/server/services/LearnLink');

/**
 * Rebuilds the LearnLink sections of the request's promptPrefix each turn:
 * - the assistance policy matching the `LearnLink assistance level: <level>` marker line,
 * - a compact Canvas course card when the conversation carries a `Canvas course ID: <id>`
 *   marker (rebuilt from the local sync service so due dates and announcements stay current).
 * Blocks appended on previous turns are stripped first to keep the prefix idempotent.
 */
async function learnLinkContext(req, res, next) {
  if (!isLearnLinkEnabled()) {
    return next();
  }

  const promptPrefix = req.body?.promptPrefix;
  const canvasCourseId = extractCanvasCourseId(promptPrefix);
  const markedLevel = extractAssistanceLevel(promptPrefix);
  if (canvasCourseId == null && markedLevel == null) {
    return next();
  }

  const assistanceLevel = markedLevel ?? defaultAssistanceLevel;
  const sections = [stripLearnLinkBlocks(promptPrefix), buildAssistancePolicy(assistanceLevel)];

  if (canvasCourseId != null) {
    try {
      const tenantId = await getLearnLinkTenantId(req.user?.id);
      const context = await getCourseContextSafe(canvasCourseId, { tenantId });
      if (context) {
        sections.push(buildCourseCard(context));
      }
    } catch (error) {
      logger.warn('[learnLinkContext] Failed to build course card', error);
    }
  }

  req.body.promptPrefix = sections.filter(Boolean).join('\n\n');

  next();
}

module.exports = learnLinkContext;
