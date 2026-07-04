const { logger } = require('@librechat/data-schemas');
const {
  buildCourseCard,
  isLearnLinkEnabled,
  getCourseContextSafe,
  extractCanvasCourseId,
} = require('@librechat/api');

const CARD_MARKER = '[LearnLink course context';

/**
 * Appends a fresh, compact Canvas course card to the request's promptPrefix when the
 * conversation carries a LearnLink course marker (`Canvas course ID: <id>`). The card is
 * rebuilt every turn from the local sync service so due dates and announcements stay
 * current; any card from a previous turn is stripped first to keep the prefix idempotent.
 */
async function learnLinkContext(req, res, next) {
  if (!isLearnLinkEnabled()) {
    return next();
  }

  const promptPrefix = req.body?.promptPrefix;
  const canvasCourseId = extractCanvasCourseId(promptPrefix);
  if (canvasCourseId == null) {
    return next();
  }

  try {
    const context = await getCourseContextSafe(canvasCourseId);
    if (!context) {
      return next();
    }

    const markerIndex = promptPrefix.indexOf(CARD_MARKER);
    const basePrefix = (
      markerIndex === -1 ? promptPrefix : promptPrefix.slice(0, markerIndex)
    ).trimEnd();
    req.body.promptPrefix = `${basePrefix}\n\n${buildCourseCard(context)}`;
  } catch (error) {
    logger.warn('[learnLinkContext] Failed to build course card', error);
  }

  next();
}

module.exports = learnLinkContext;
