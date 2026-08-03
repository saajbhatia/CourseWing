const express = require('express');
const { logger, isValidObjectIdString } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const {
  CourseWingReceipt,
  CourseWingCourseSetting,
  CourseWingActivity,
  CONSOLE_LEVELS,
  isTeacherUser,
  getCanvasCourseScope,
  getCourseSetting,
  clearCourseSettingCache,
  refreshReceipts,
  isActivityVisibleToUser,
  getConversationMessages,
  buildTranscript,
  getUsersById,
  displayName,
  initials,
  studentStatus,
  getPulse,
  getStudentProfile,
  answerAssistant,
} = require('~/server/services/CourseWingTeacher');
const { getCourseWingCanvasContext } = require('~/server/services/CourseWing');

const router = express.Router();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_TYPES = ['Practice set', 'Review session', 'Warm-up', 'Announcement'];

function parseCourseId(value) {
  const courseId = Number(value);
  return Number.isSafeInteger(courseId) && courseId > 0 ? courseId : null;
}

async function teacherGate(req, res, next) {
  if (!(await isTeacherUser(req.user))) {
    return res.status(403).json({ message: 'Teacher access required' });
  }
  const courseId = parseCourseId(req.params.courseId);
  if (courseId == null) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  try {
    const { identity, frozenNow } = await getCourseWingCanvasContext(req.user.id);
    const scope = await getCanvasCourseScope(req.user.id, identity, { forceRefresh: true });
    const course = scope?.courses.get(courseId);
    if (!course) {
      return res.status(403).json({ message: 'This course is not on your Canvas account' });
    }
    if (course.isInstructor !== true) {
      return res.status(403).json({ message: 'Canvas instructor access is required' });
    }
    req.teacherCanvasCourseKey = course.courseKey;
    req.teacherCanvasTenantId = scope.tenantId;
    req.teacherNow = frozenNow?.getTime() ?? Date.now();
  } catch (error) {
    logger.error('[teacher] Failed to verify course access', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
  req.teacherCourseId = courseId;
  next();
}

async function getCourseReceipts(canvasCourseKey, canvasCourseId) {
  return CourseWingReceipt.find({ canvasCourseKey, canvasCourseId })
    .sort({ lastMessageAt: -1 })
    .lean();
}

function computeStats(receipts, now) {
  const inWindow = (r, start, end) => {
    const t = new Date(r.lastMessageAt).getTime();
    return t >= start && t < end;
  };
  const thisWeek = receipts.filter((r) => {
    const time = new Date(r.lastMessageAt).getTime();
    return time >= now - WEEK_MS && time <= now;
  });
  const priorWeek = receipts.filter((r) => inWindow(r, now - 2 * WEEK_MS, now - WEEK_MS));
  const distinct = (list) => new Set(list.map((r) => r.userId)).size;
  const avg = (list) =>
    list.length
      ? Math.round(list.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0) / list.length)
      : 0;
  return {
    sessionsThisWeek: thisWeek.length,
    sessionsPriorWeek: priorWeek.length,
    activeStudentsThisWeek: distinct(thisWeek),
    totalStudents: distinct(receipts),
    avgMinutes: avg(thisWeek.length ? thisWeek : receipts),
    pendingFlags: receipts.filter((r) => r.flagStatus === 'pending').length,
    totalSessions: receipts.length,
  };
}

function receiptView(receipt, nameById) {
  const name = displayName(nameById.get(receipt.userId));
  return {
    conversationId: receipt.conversationId,
    userId: receipt.userId,
    student: name,
    initials: initials(name),
    topic: receipt.topic,
    summary: receipt.summary,
    helpLevel: receipt.helpLevel,
    durationMinutes: receipt.durationMinutes,
    lastMessageAt: receipt.lastMessageAt,
    flagType: receipt.flagType ?? null,
    flagStatus: receipt.flagStatus ?? 'none',
    flagNote: receipt.flagNote ?? null,
    unlocked: (receipt.unlockLog ?? []).length > 0,
  };
}

router.use(requireJwtAuth);

router.get('/teacher/me', async (req, res) => {
  res.json({ isTeacher: await isTeacherUser(req.user) });
});

router.get('/teacher/courses/:courseId/overview', teacherGate, async (req, res) => {
  try {
    const courseId = req.teacherCourseId;
    const canvasCourseKey = req.teacherCanvasCourseKey;
    const refresh =
      req.query.refresh === '0'
        ? { generated: 0, staleRemaining: 0 }
        : await refreshReceipts(canvasCourseKey, courseId);
    const receipts = await getCourseReceipts(canvasCourseKey, courseId);
    const nameById = await getUsersById([...new Set(receipts.map((r) => r.userId))]);
    const now = req.teacherNow;
    const stats = computeStats(receipts, now);

    const byStudent = new Map();
    for (const receipt of receipts) {
      if (!byStudent.has(receipt.userId)) {
        byStudent.set(receipt.userId, []);
      }
      byStudent.get(receipt.userId).push(receipt);
    }
    const students = [...byStudent.entries()]
      .map(([userId, list]) => {
        const name = displayName(nameById.get(userId));
        return {
          userId,
          name,
          initials: initials(name),
          email: nameById.get(userId)?.email ?? null,
          sessions: list.length,
          minutes: list.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0),
          lastMessageAt: list[0].lastMessageAt,
          status: studentStatus(list, now),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const pulse = await getPulse(canvasCourseKey, courseId, receipts, nameById);
    return res.json({
      refresh,
      stats,
      pulse,
      students,
      latestReceipts: receipts.slice(0, 8).map((r) => receiptView(r, nameById)),
    });
  } catch (error) {
    logger.error('[teacher/overview] Failed', error);
    return res.status(500).json({ message: 'Failed to load class overview' });
  }
});

router.get('/teacher/courses/:courseId/students/:userId', teacherGate, async (req, res) => {
  try {
    const receipts = await CourseWingReceipt.find({
      canvasCourseKey: req.teacherCanvasCourseKey,
      canvasCourseId: req.teacherCourseId,
      userId: req.params.userId,
    })
      .sort({ lastMessageAt: -1 })
      .lean();
    if (!receipts.length) {
      return res.status(404).json({ message: 'No sessions for this student' });
    }
    const nameById = await getUsersById([req.params.userId]);
    const name = displayName(nameById.get(req.params.userId));
    const profile = await getStudentProfile(
      req.teacherCanvasCourseKey,
      req.teacherCourseId,
      req.params.userId,
      receipts,
      name,
    );
    return res.json({
      userId: req.params.userId,
      name,
      initials: initials(name),
      sessions: receipts.length,
      lastMessageAt: receipts[0].lastMessageAt,
      status: studentStatus(receipts, req.teacherNow),
      profile,
      receipts: receipts.map((r) => receiptView(r, nameById)),
    });
  } catch (error) {
    logger.error('[teacher/student] Failed', error);
    return res.status(500).json({ message: 'Failed to load student detail' });
  }
});

router.post('/teacher/courses/:courseId/assistant', teacherGate, async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ message: 'Question is required' });
  }
  try {
    const receipts = await getCourseReceipts(req.teacherCanvasCourseKey, req.teacherCourseId);
    const nameById = await getUsersById([...new Set(receipts.map((r) => r.userId))]);
    const stats = computeStats(receipts, req.teacherNow);
    const text = await answerAssistant(
      req.teacherCourseId,
      question,
      req.body?.history,
      receipts,
      nameById,
      stats,
    );
    if (!text) {
      return res.status(502).json({ message: 'Assistant is unavailable' });
    }
    return res.json({ text });
  } catch (error) {
    logger.error('[teacher/assistant] Failed', error);
    return res.status(500).json({ message: 'Assistant request failed' });
  }
});

router.get('/teacher/courses/:courseId/queue', teacherGate, async (req, res) => {
  try {
    const receipts = await CourseWingReceipt.find({
      canvasCourseKey: req.teacherCanvasCourseKey,
      canvasCourseId: req.teacherCourseId,
      flagType: { $ne: null },
      flagStatus: { $ne: 'dismissed' },
    })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();
    const nameById = await getUsersById([...new Set(receipts.map((r) => r.userId))]);
    return res.json({ queue: receipts.map((r) => receiptView(r, nameById)) });
  } catch (error) {
    logger.error('[teacher/queue] Failed', error);
    return res.status(500).json({ message: 'Failed to load review queue' });
  }
});

async function findCourseReceipt(canvasCourseKey, courseId, conversationId, userId) {
  return CourseWingReceipt.findOne({
    canvasCourseKey,
    canvasCourseId: courseId,
    conversationId,
    userId,
  }).lean();
}

router.post(
  '/teacher/courses/:courseId/receipts/:conversationId/flag',
  teacherGate,
  async (req, res) => {
    const action = req.body?.action;
    if (!['dismiss', 'escalate'].includes(action)) {
      return res.status(400).json({ message: 'action must be dismiss or escalate' });
    }
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    try {
      const receipt = await findCourseReceipt(
        req.teacherCanvasCourseKey,
        req.teacherCourseId,
        req.params.conversationId,
        userId,
      );
      if (!receipt || receipt.flagType == null) {
        return res.status(404).json({ message: 'Flag not found' });
      }
      await CourseWingReceipt.updateOne(
        {
          _id: receipt._id,
          canvasCourseKey: req.teacherCanvasCourseKey,
          canvasCourseId: req.teacherCourseId,
          userId: receipt.userId,
        },
        { $set: { flagStatus: action === 'dismiss' ? 'dismissed' : 'escalated' } },
      );
      return res.json({ ok: true });
    } catch (error) {
      logger.error('[teacher/flag] Failed', error);
      return res.status(500).json({ message: 'Failed to update flag' });
    }
  },
);

router.post(
  '/teacher/courses/:courseId/receipts/:conversationId/unlock',
  teacherGate,
  async (req, res) => {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    try {
      const receipt = await findCourseReceipt(
        req.teacherCanvasCourseKey,
        req.teacherCourseId,
        req.params.conversationId,
        userId,
      );
      if (!receipt || receipt.flagType == null) {
        return res.status(404).json({ message: 'Flag not found' });
      }
      await CourseWingReceipt.updateOne(
        {
          _id: receipt._id,
          canvasCourseKey: req.teacherCanvasCourseKey,
          canvasCourseId: req.teacherCourseId,
          userId: receipt.userId,
        },
        { $push: { unlockLog: { at: new Date(), by: req.user.email ?? req.user.id } } },
      );
      logger.info(
        `[teacher/unlock] ${req.user.email} unlocked transcript ${req.params.conversationId}`,
      );
      const messages = await getConversationMessages(req.params.conversationId, receipt.userId);
      return res.json({ transcript: buildTranscript(messages, 4000) });
    } catch (error) {
      logger.error('[teacher/unlock] Failed', error);
      return res.status(500).json({ message: 'Failed to unlock transcript' });
    }
  },
);

router.get('/teacher/courses/:courseId/settings', teacherGate, async (req, res) => {
  const setting = await getCourseSetting(req.teacherCanvasCourseKey, req.teacherCourseId);
  return res.json({
    helpLevel: setting?.helpLevel ?? 'guided',
    blockedRules: setting?.blockedRules ?? [],
    overrides: (setting?.overrides ?? []).map((o) => ({
      canvasAssignmentId: o.canvasAssignmentId,
      name: o.name,
      level: o.level,
      blockedRules: o.blockedRules ?? [],
    })),
  });
});

router.put('/teacher/courses/:courseId/settings', teacherGate, async (req, res) => {
  const helpLevel = req.body?.helpLevel;
  if (helpLevel != null && !CONSOLE_LEVELS.includes(helpLevel)) {
    return res.status(400).json({ message: 'Invalid help level' });
  }
  const blockedRules = Array.isArray(req.body?.blockedRules)
    ? req.body.blockedRules.filter((r) => typeof r === 'string' && r.length < 200).slice(0, 20)
    : undefined;
  const overrides = Array.isArray(req.body?.overrides)
    ? req.body.overrides
        .filter((o) => Number.isSafeInteger(o?.canvasAssignmentId))
        .slice(0, 50)
        .map((o) => ({
          canvasAssignmentId: o.canvasAssignmentId,
          name: typeof o.name === 'string' ? o.name.slice(0, 200) : '',
          level: CONSOLE_LEVELS.includes(o.level) ? o.level : 'guided',
          blockedRules: Array.isArray(o.blockedRules)
            ? o.blockedRules.filter((r) => typeof r === 'string' && r.length < 200).slice(0, 20)
            : [],
        }))
    : undefined;
  const update = {};
  if (helpLevel != null) {
    update.helpLevel = helpLevel;
  }
  if (blockedRules !== undefined) {
    update.blockedRules = blockedRules;
  }
  if (overrides !== undefined) {
    update.overrides = overrides;
  }
  try {
    await CourseWingCourseSetting.updateOne(
      {
        canvasCourseKey: req.teacherCanvasCourseKey,
        canvasCourseId: req.teacherCourseId,
      },
      { $set: update },
      { upsert: true },
    );
    clearCourseSettingCache(req.teacherCanvasCourseKey);
    return res.json({ ok: true });
  } catch (error) {
    logger.error('[teacher/settings] Failed', error);
    return res.status(500).json({ message: 'Failed to save settings' });
  }
});

function activityView(activity, userId, includeTeacherDetails = false) {
  const view = {
    id: String(activity._id),
    title: activity.title,
    type: activity.type,
    level: activity.level,
    prompt: activity.prompt ?? null,
    questions: activity.questions ?? null,
    dueAt: activity.dueAt ?? null,
    startedByMe: userId != null && (activity.startedBy ?? []).includes(userId),
    createdAt: activity.createdAt,
  };
  if (includeTeacherDetails) {
    view.audience = activity.audience ?? [];
    view.startedCount = (activity.startedBy ?? []).length;
  }
  return view;
}

router.get('/teacher/courses/:courseId/activities', teacherGate, async (req, res) => {
  const activities = await CourseWingActivity.find({
    canvasCourseKey: req.teacherCanvasCourseKey,
    canvasCourseId: req.teacherCourseId,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return res.json({ activities: activities.map((a) => activityView(a, null, true)) });
});

router.post('/teacher/courses/:courseId/activities', teacherGate, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }
  const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
  try {
    const activity = await CourseWingActivity.create({
      canvasCourseKey: req.teacherCanvasCourseKey,
      canvasCourseId: req.teacherCourseId,
      title,
      type: ACTIVITY_TYPES.includes(req.body?.type) ? req.body.type : 'Practice set',
      level: CONSOLE_LEVELS.includes(req.body?.level) ? req.body.level : 'guided',
      prompt: typeof req.body?.prompt === 'string' ? req.body.prompt.slice(0, 4000) : null,
      questions:
        typeof req.body?.questions === 'string' ? req.body.questions.slice(0, 4000) : null,
      dueAt: dueAt != null && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      audience: Array.isArray(req.body?.audience)
        ? [
            ...new Set(
              req.body.audience
                .filter((value) => typeof value === 'string' && value.includes('@'))
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 100),
            ),
          ]
        : [],
      createdBy: req.user.id,
    });
    return res.status(201).json({ activity: activityView(activity.toObject(), null, true) });
  } catch (error) {
    logger.error('[teacher/activities] Failed', error);
    return res.status(500).json({ message: 'Failed to create activity' });
  }
});

router.delete('/teacher/courses/:courseId/activities/:activityId', teacherGate, async (req, res) => {
  const { activityId } = req.params;
  if (!isValidObjectIdString(activityId)) {
    return res.status(400).json({ message: 'Invalid activity id' });
  }
  try {
    const deleted = await CourseWingActivity.findOneAndDelete({
      _id: activityId,
      canvasCourseKey: req.teacherCanvasCourseKey,
      canvasCourseId: req.teacherCourseId,
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    return res.json({ deleted: true });
  } catch (error) {
    logger.error('[teacher/activities] Failed to delete', error);
    return res.status(500).json({ message: 'Failed to delete activity' });
  }
});

router.get('/activities', async (req, res) => {
  const courseId = parseCourseId(req.query.courseId);
  if (courseId == null) {
    return res.status(400).json({ message: 'courseId is required' });
  }
  try {
    const scope = await getCanvasCourseScope(req.user.id);
    const course = scope?.courses.get(courseId);
    if (!course) {
      return res.status(403).json({ message: 'This course is not on your Canvas account' });
    }
    const activities = await CourseWingActivity.find({
      canvasCourseKey: course.courseKey,
      canvasCourseId: courseId,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const visible = activities.filter((activity) => isActivityVisibleToUser(activity, req.user));
    return res.json({ activities: visible.map((a) => activityView(a, req.user.id)) });
  } catch (error) {
    logger.error('[activities] Failed to verify course access', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

router.post('/activities/:id/started', async (req, res) => {
  try {
    const scope = await getCanvasCourseScope(req.user.id);
    if (!scope) {
      return res.status(403).json({ message: 'Connect a Canvas account to use activities' });
    }
    const courseScopes = [...scope.courses.entries()].map(([canvasCourseId, course]) => ({
      canvasCourseId,
      canvasCourseKey: course.courseKey,
    }));
    if (courseScopes.length === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    const activity = await CourseWingActivity.findOne({
      _id: req.params.id,
      $or: courseScopes,
    }).lean();
    if (
      !activity ||
      !scope.courseIds.has(activity.canvasCourseId) ||
      !isActivityVisibleToUser(activity, req.user)
    ) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    const result = await CourseWingActivity.updateOne(
      {
        _id: activity._id,
        canvasCourseKey: activity.canvasCourseKey,
        canvasCourseId: activity.canvasCourseId,
      },
      { $addToSet: { startedBy: req.user.id } },
    );
    if (result.matchedCount !== 1) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    return res.json({ ok: true });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid activity' });
    }
    logger.error('[activities/started] Failed', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

module.exports = router;
