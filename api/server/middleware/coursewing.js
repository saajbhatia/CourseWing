const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  extractPersona,
  stripCourseWingBlocks,
  extractCanvasActivityId,
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
const { getCourseWingCanvasContext } = require('~/server/services/CourseWing');
const {
  isTeacherUser,
  buildCourseRules,
  getCanvasCourseScope,
  getCourseAssistance,
  getVisibleCourseActivity,
  buildClassReceiptsCard,
  isTeacherAssistantPrefix,
  buildTeacherAssistantPrompt,
} = require('~/server/services/CourseWingTeacher');
const db = require('~/models');

function buildStudentPolicy(level, now) {
  return level == null ? buildLearningDefault(now) : buildAssistancePolicy(level, now);
}

function getActivityPolicyLevel(activity) {
  if (activity?.level === 'open') {
    return 'full';
  }
  if (activity?.level === 'socratic') {
    return 'hints';
  }
  if (activity?.level === 'guided') {
    return null;
  }
  return undefined;
}

/**
 * Rebuilds the CourseWing sections of the request's promptPrefix each turn:
 * - the assistance policy from account-scoped course settings or a verified
 *   teacher-created activity (client assistance-level markers are ignored),
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
  const requestedCanvasAssignmentId = extractCanvasAssignmentId(promptPrefix);
  const activityId = extractCanvasActivityId(promptPrefix);
  const hasActivityMarker =
    typeof promptPrefix === 'string' && /^CourseWing activity ID:/im.test(promptPrefix);
  const hasAssignmentMarker =
    typeof promptPrefix === 'string' && /^Canvas assignment ID:/im.test(promptPrefix);
  const hasLegacyActivityContext =
    typeof promptPrefix === 'string' &&
    /^\s*(?:The teacher assigned this activity:|Activity details from the teacher:)/im.test(
      promptPrefix,
    );
  const persona = extractPersona(promptPrefix);

  const teacherAssistant = isTeacherAssistantPrefix(promptPrefix);
  if (teacherAssistant && !(await isTeacherUser(req.user))) {
    return res.status(403).json({ message: 'Teacher access required' });
  }
  if (!teacherAssistant && hasActivityMarker && activityId == null) {
    return res.status(400).json({ message: 'Invalid CourseWing activity marker' });
  }
  if (!teacherAssistant && activityId != null && requestedCanvasCourseId == null) {
    return res.status(400).json({ message: 'CourseWing activities require a Canvas course' });
  }
  if (!teacherAssistant && hasLegacyActivityContext && activityId == null) {
    return res.status(400).json({
      message: 'Start a new activity chat from the course page to verify the activity',
    });
  }
  if (!teacherAssistant && hasAssignmentMarker && requestedCanvasAssignmentId == null) {
    return res.status(400).json({ message: 'Invalid Canvas assignment marker' });
  }

  // Demo tenants live on a frozen clock; proceeding with the host date when
  // that tenant metadata cannot be verified would leak the real clock.
  let canvasContext;
  try {
    canvasContext = await getCourseWingCanvasContext(req.user?.id);
  } catch (error) {
    logger.error('[courseWingContext] Failed to verify the Canvas tenant clock', error);
    return res.status(502).json({ message: 'Canvas tenant clock is unavailable' });
  }
  const { identity: canvasIdentity, frozenNow } = canvasContext;
  req.courseWingFrozenNow = frozenNow?.toISOString() ?? null;
  // Pin the same account snapshot used to derive the clock, including an
  // explicit null when no account exists. CourseWing tools must not re-resolve
  // a mutable mapping later in this request.
  req.courseWingCanvasTenantId = canvasIdentity?.tenantId ?? null;
  req.courseWingCanvasAccountKey = canvasIdentity?.canvasAccountKey ?? null;

  const strippedPrefix = stripCourseWingBlocks(promptPrefix ?? '');
  const untrustedControlsRemoved = strippedPrefix
    .split('\n')
    .filter((line) => !/^(?:CourseWing|LearnLi(?:ght|nk)) assistance level:/i.test(line.trim()))
    .join('\n')
    .trimEnd();
  const sections = teacherAssistant
    ? [untrustedControlsRemoved, buildTeacherAssistantPrompt()]
    : [untrustedControlsRemoved, buildStudentPolicy(null, frozenNow)];

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
    const storedCanvasActivityId =
      existingConversation != null
        ? extractCanvasActivityId(existingConversation.promptPrefix)
        : null;
    const storedCanvasAssignmentId =
      existingConversation != null
        ? extractCanvasAssignmentId(existingConversation.promptPrefix)
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
      if (storedCanvasActivityId != null && activityId == null) {
        return res.status(409).json({
          message: 'This activity chat request is missing its CourseWing activity marker',
        });
      }
      if (storedCanvasActivityId != null && activityId !== storedCanvasActivityId) {
        return res.status(409).json({
          message: 'This course chat is linked to a different CourseWing activity',
        });
      }
      if (storedCanvasActivityId == null && activityId != null) {
        return res.status(409).json({
          message: 'Start a new activity chat instead of changing an existing conversation',
        });
      }
      if (storedCanvasAssignmentId != null && requestedCanvasAssignmentId == null) {
        return res.status(409).json({
          message: 'This assignment chat request is missing its Canvas assignment marker',
        });
      }
      if (
        storedCanvasAssignmentId != null &&
        requestedCanvasAssignmentId !== storedCanvasAssignmentId
      ) {
        return res.status(409).json({
          message: 'This course chat is linked to a different Canvas assignment',
        });
      }
      if (storedCanvasAssignmentId == null && requestedCanvasAssignmentId != null) {
        return res.status(409).json({
          message: 'Start a new assignment chat instead of changing an existing conversation',
        });
      }
    }

    // A persisted conversation's database field is canonical. The request marker
    // is trusted only while creating a genuinely new conversation.
    const canvasCourseId =
      existingConversation != null ? storedCanvasCourseId : requestedCanvasCourseId;

    if (canvasCourseId != null) {
      const identity = canvasIdentity;
      if (!identity) {
        return res
          .status(409)
          .json({ message: 'Connect a Canvas account to use this course chat' });
      }
      const existingCanvasScope = existingConversation
        ? await db.getConvoCanvasScope(req.user?.id, conversationId)
        : null;
      if (existingConversation && existingCanvasScope?.canvasAccountKey == null) {
        return res.status(409).json({
          message:
            'This older course chat is not linked to a verified Canvas account; start a new course chat',
        });
      }
      if (
        existingConversation &&
        existingCanvasScope.canvasAccountKey !== identity.canvasAccountKey
      ) {
        return res.status(409).json({
          message: 'This course chat belongs to a different Canvas account',
        });
      }
      // Pin both parts of the verified Canvas identity for the rest of this
      // request. In particular, CourseWing tool construction must not resolve
      // the user's mutable tenant mapping again after this scope check.
      const courseScope = await getCanvasCourseScope(req.user?.id, identity, {
        forceRefresh: teacherAssistant,
      });
      const verifiedCourse = courseScope?.courses.get(canvasCourseId);
      if (!verifiedCourse) {
        return res.status(403).json({ message: 'This course is not on your Canvas account' });
      }
      if (teacherAssistant && verifiedCourse.isInstructor !== true) {
        return res.status(403).json({ message: 'Canvas instructor access is required' });
      }
      req.courseWingCanvasCourseKey = verifiedCourse.courseKey;
      if (existingConversation && existingCanvasScope.canvasCourseKey == null) {
        const adopted = await db.bindConvoCanvasCourseKey(
          req.user?.id,
          conversationId,
          canvasCourseId,
          identity.canvasAccountKey,
          verifiedCourse.courseKey,
        );
        if (!adopted) {
          return res.status(409).json({
            message: 'This older course chat could not be linked to the verified Canvas course',
          });
        }
      } else if (
        existingConversation &&
        existingCanvasScope.canvasCourseKey !== verifiedCourse.courseKey
      ) {
        return res.status(409).json({
          message: 'This course chat belongs to a different Canvas course scope',
        });
      }
      if (teacherAssistant) {
        const context = await getCourseContextSafe(canvasCourseId, {
          tenantId: identity.tenantId,
        });
        if (context) {
          sections.push(buildCourseCard(context, frozenNow));
        }
        sections.push(await buildClassReceiptsCard(verifiedCourse.courseKey, canvasCourseId));
      } else {
        const assistance = await getCourseAssistance(
          verifiedCourse.courseKey,
          canvasCourseId,
          requestedCanvasAssignmentId,
        );
        const activity =
          activityId == null
            ? null
            : await getVisibleCourseActivity(
                verifiedCourse.courseKey,
                canvasCourseId,
                activityId,
                req.user,
              );
        if (activityId != null && activity == null) {
          return res.status(404).json({ message: 'Activity not found' });
        }
        const activityPolicyLevel = getActivityPolicyLevel(activity);
        const effectivePolicyLevel =
          activityPolicyLevel === undefined ? assistance.policyLevel : activityPolicyLevel;
        sections[1] = buildStudentPolicy(effectivePolicyLevel, frozenNow);
        if (activity) {
          // Do not preserve client copies of the activity title or prompt. For
          // activity chats, the identifier and course marker are the only
          // client-provided context; all activity content comes from storage.
          sections[0] = `Canvas course ID: ${canvasCourseId}\nCourseWing activity ID: ${activityId}`;
          sections.push(
            `[CourseWing assigned activity]\nTitle: ${activity.title}\n${
              activity.prompt ? `Teacher instructions: ${activity.prompt}\n` : ''
            }${
              activity.questions
                ? `Practice problems (work through in order):\n${activity.questions}\n` +
                  'Work each problem through these problem-solving steps, naming each step out loud as you go ' +
                  '("Step 1 — identify the problem: ..."): ' +
                  '1) Identify and define the problem — restate what is being asked and break it into parts. ' +
                  '2) Identify what is known and what is unknown. ' +
                  '3) Represent the problem — write the relationship or equation that connects the quantities. ' +
                  '4) Solve and interpret — work it out and check the result makes sense. ' +
                  'Present the current question, then walk one step at a time, and have the student do the work at each step before moving on.'
                : ''
            }`.trimEnd(),
          );
        }
        const courseRules = buildCourseRules(assistance.blockedRules);
        if (courseRules != null) {
          sections.push(courseRules);
        }
        const [context, assignmentDetail] = await Promise.all([
          getCourseContextSafe(canvasCourseId, { tenantId: identity.tenantId }),
          requestedCanvasAssignmentId != null
            ? getAssignmentDetailSafe(canvasCourseId, requestedCanvasAssignmentId, {
                tenantId: identity.tenantId,
              })
            : Promise.resolve(null),
        ]);
        if (context) {
          sections.push(buildCourseCard(context, frozenNow));
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
