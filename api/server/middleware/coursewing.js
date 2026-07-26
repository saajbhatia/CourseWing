const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  extractPersona,
  stripCourseWingBlocks,
  extractAssistanceLevel,
} = require('librechat-data-provider');
const {
  buildCourseCard,
  isCourseWingEnabled,
  buildPersonaPrompt,
  buildAssignmentCard,
  buildLearningDefault,
  getCourseContextSafe,
  extractCanvasCourseId,
  buildAssistancePolicy,
  getAssignmentDetailSafe,
  extractCanvasAssignmentId,
} = require('@librechat/api');
const { getCourseWingCanvasIdentity } = require('~/server/services/CourseWing');
const {
  isTeacherUser,
  buildCourseRules,
  getTeacherCourseIds,
  getCourseAssistance,
  buildClassReceiptsCard,
  isTeacherAssistantPrefix,
  buildTeacherAssistantPrompt,
} = require('~/server/services/CourseWingTeacher');
const db = require('~/models');

/**
 * Rebuilds the CourseWing sections of the request's promptPrefix each turn:
 * - the assistance policy matching the `CourseWing assistance level: <level>` marker line
 *   (the tutor-shaped learning default when no marker is present),
 * - the persona voice matching the `CourseWing persona: <persona>` marker line,
 * - a compact Canvas course card when the conversation carries a `Canvas course ID: <id>`
 *   marker (rebuilt from the local sync service so due dates and announcements stay current),
 * - an assignment card (instructions, the student's own submission, teacher feedback) when
 *   the conversation also carries a `Canvas assignment ID: <id>` marker.
 * Blocks appended on previous turns are stripped first to keep the prefix idempotent.
 */
async function courseWingContext(req, res, next) {
  if (!isCourseWingEnabled()) {
    return next();
  }

  const promptPrefix = req.body?.promptPrefix;
  const requestedCanvasCourseId = extractCanvasCourseId(promptPrefix);
  const markedLevel = extractAssistanceLevel(promptPrefix);
  const persona = extractPersona(promptPrefix);

  const teacherAssistant = isTeacherAssistantPrefix(promptPrefix);
  if (teacherAssistant && !(await isTeacherUser(req.user))) {
    return res.status(403).json({ message: 'Teacher access required' });
  }

  const sections = teacherAssistant
    ? [stripCourseWingBlocks(promptPrefix ?? ''), buildTeacherAssistantPrompt()]
    : [
        stripCourseWingBlocks(promptPrefix ?? ''),
        markedLevel == null ? buildLearningDefault() : buildAssistancePolicy(markedLevel),
      ];

  if (!teacherAssistant && persona != null) {
    sections.push(buildPersonaPrompt(persona));
  }

  try {
    const conversationId = req.body?.conversationId;
    const isNewConversation = !conversationId || conversationId === Constants.NEW_CONVO;
    let existingConversation = null;

    if (!isNewConversation) {
      const hasResolvedConversation = Object.prototype.hasOwnProperty.call(
        req,
        'resolvedConversation',
      );
      existingConversation = hasResolvedConversation
        ? req.resolvedConversation
        : await db.getConvo(req.user?.id, conversationId);
      if (!hasResolvedConversation) {
        // The agent request controller and BaseClient both consume this trusted
        // lookup later. Keeping the hidden account key out of this object avoids
        // exposing it through normal conversation serialization.
        req.resolvedConversation = existingConversation;
      }
    }

    const storedCanvasCourseId =
      existingConversation != null &&
      Number.isSafeInteger(existingConversation.canvasCourseId) &&
      existingConversation.canvasCourseId > 0
        ? existingConversation.canvasCourseId
        : null;

    if (existingConversation != null) {
      if (storedCanvasCourseId != null && requestedCanvasCourseId == null) {
        return res.status(409).json({
          message: 'This course chat request is missing its Canvas course marker',
        });
      }
      if (storedCanvasCourseId != null && requestedCanvasCourseId !== storedCanvasCourseId) {
        return res.status(409).json({
          message: 'This course chat is linked to a different Canvas course',
        });
      }
      if (storedCanvasCourseId == null && requestedCanvasCourseId != null) {
        return res.status(409).json({
          message: 'Start a new course chat instead of changing an existing conversation',
        });
      }
    }

    // A persisted conversation's database field is canonical. The request marker
    // is trusted only while creating a genuinely new conversation.
    const canvasCourseId =
      existingConversation != null ? storedCanvasCourseId : requestedCanvasCourseId;

    if (canvasCourseId != null) {
      const identity = await getCourseWingCanvasIdentity(req.user?.id);
      if (!identity) {
        return res
          .status(409)
          .json({ message: 'Connect a Canvas account to use this course chat' });
      }
      const existingCanvasAccountKey = existingConversation
        ? await db.getConvoCanvasAccountKey(req.user?.id, conversationId)
        : null;
      if (existingConversation && existingCanvasAccountKey == null) {
        return res.status(409).json({
          message:
            'This older course chat is not linked to a verified Canvas account; start a new course chat',
        });
      }
      if (existingConversation && existingCanvasAccountKey !== identity.canvasAccountKey) {
        return res.status(409).json({
          message: 'This course chat belongs to a different Canvas account',
        });
      }
      // Pin both parts of the verified Canvas identity for the rest of this
      // request. In particular, CourseWing tool construction must not resolve
      // the user's mutable tenant mapping again after this scope check.
      req.courseWingCanvasTenantId = identity.tenantId;
      req.courseWingCanvasAccountKey = identity.canvasAccountKey;
      if (teacherAssistant) {
        const teacherCourseIds = await getTeacherCourseIds(req.user?.id);
        if (!teacherCourseIds.has(canvasCourseId)) {
          return res.status(403).json({ message: 'This course is not on your Canvas account' });
        }
        const context = await getCourseContextSafe(canvasCourseId, {
          tenantId: identity.tenantId,
        });
        if (context) {
          sections.push(buildCourseCard(context));
        }
        sections.push(await buildClassReceiptsCard(canvasCourseId));
      } else {
        const canvasAssignmentId = extractCanvasAssignmentId(promptPrefix);
        const assistance = await getCourseAssistance(canvasCourseId, canvasAssignmentId);
        if (markedLevel == null && assistance.policyLevel != null) {
          sections[1] = buildAssistancePolicy(assistance.policyLevel);
        }
        const courseRules = buildCourseRules(assistance.blockedRules);
        if (courseRules != null) {
          sections.push(courseRules);
        }
        const [context, assignmentDetail] = await Promise.all([
          getCourseContextSafe(canvasCourseId, { tenantId: identity.tenantId }),
          canvasAssignmentId != null
            ? getAssignmentDetailSafe(canvasCourseId, canvasAssignmentId, {
                tenantId: identity.tenantId,
              })
            : Promise.resolve(null),
        ]);
        if (context) {
          sections.push(buildCourseCard(context));
        }
        if (assignmentDetail) {
          sections.push(buildAssignmentCard(assignmentDetail.assignment));
        }
      }
    }
  } catch (error) {
    logger.error('[courseWingContext] Failed to verify Canvas course scope', error);
    return res.status(502).json({ message: 'Canvas account verification is unavailable' });
  }

  req.body.promptPrefix = sections.filter(Boolean).join('\n\n');

  if (req.body.endpoint === 'bedrock') {
    req.body.thinking = false;
  }

  next();
}

module.exports = courseWingContext;
