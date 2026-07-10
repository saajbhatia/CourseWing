const { logger } = require('@librechat/data-schemas');
const {
  extractPersona,
  stripLearnLightBlocks,
  extractAssistanceLevel,
} = require('librechat-data-provider');
const {
  buildCourseCard,
  isLearnLightEnabled,
  buildPersonaPrompt,
  buildLearningDefault,
  getCourseContextSafe,
  extractCanvasCourseId,
  buildAssistancePolicy,
} = require('@librechat/api');
const { getLearnLightTenantId } = require('~/server/services/LearnLight');

/**
 * Rebuilds the LearnLight sections of the request's promptPrefix each turn:
 * - the assistance policy matching the `LearnLight assistance level: <level>` marker line
 *   (the tutor-shaped learning default when no marker is present),
 * - the persona voice matching the `LearnLight persona: <persona>` marker line,
 * - a compact Canvas course card when the conversation carries a `Canvas course ID: <id>`
 *   marker (rebuilt from the local sync service so due dates and announcements stay current).
 * Blocks appended on previous turns are stripped first to keep the prefix idempotent.
 */
async function learnLightContext(req, res, next) {
  if (!isLearnLightEnabled()) {
    return next();
  }

  const promptPrefix = req.body?.promptPrefix;
  const canvasCourseId = extractCanvasCourseId(promptPrefix);
  const markedLevel = extractAssistanceLevel(promptPrefix);
  const persona = extractPersona(promptPrefix);

  const sections = [
    stripLearnLightBlocks(promptPrefix ?? ''),
    markedLevel == null ? buildLearningDefault() : buildAssistancePolicy(markedLevel),
  ];

  if (persona != null) {
    sections.push(buildPersonaPrompt(persona));
  }

  if (canvasCourseId != null) {
    try {
      const tenantId = await getLearnLightTenantId(req.user?.id);
      const context = await getCourseContextSafe(canvasCourseId, { tenantId });
      if (context) {
        sections.push(buildCourseCard(context));
      }
    } catch (error) {
      logger.warn('[learnLightContext] Failed to build course card', error);
    }
  }

  req.body.promptPrefix = sections.filter(Boolean).join('\n\n');

  next();
}

module.exports = learnLightContext;
