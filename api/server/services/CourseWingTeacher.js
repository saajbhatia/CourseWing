const mongoose = require('mongoose');
const {
  logger,
  applyTenantIsolation,
  getTenantId,
  SYSTEM_TENANT_ID,
} = require('@librechat/data-schemas');
const { extractCanvasActivityId, extractCanvasAssignmentId } = require('librechat-data-provider');
const { serviceFetch, getCourseWingCanvasIdentity } = require('~/server/services/CourseWing');

const TEACHER_MODEL = () =>
  process.env.COURSEWING_TEACHER_MODEL || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_RECEIPTS_PER_REFRESH = 15;
const RECEIPT_CONCURRENCY = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CONSOLE_LEVELS = ['open', 'guided', 'socratic'];
/** Console levels map onto existing assistance policies; 'guided' is the learning default. */
const CONSOLE_LEVEL_TO_POLICY = { open: 'full', guided: null, socratic: 'hints' };
const CANVAS_ACCOUNT_KEY_PATTERN = /^[a-f\d]{24}$/;
const CANVAS_COURSE_KEY_PATTERN = /^[a-f\d]{64}$/;
const DEFAULT_APP_TENANT_KEY = '__DEFAULT__';
const APP_TENANT_SCOPE_APPLIED = Symbol.for('coursewing:appTenantScope');

function currentAppTenantKey() {
  return getTenantId() ?? DEFAULT_APP_TENANT_KEY;
}

function activeAppTenantFilter() {
  const tenantId = getTenantId();
  return tenantId === SYSTEM_TENANT_ID ? null : (tenantId ?? DEFAULT_APP_TENANT_KEY);
}

function conversationAppTenantFilter() {
  const tenantId = getTenantId();
  if (tenantId === SYSTEM_TENANT_ID) {
    return {};
  }
  // MongoDB's `{ tenantId: null }` matches both null and missing fields, which
  // is the legacy/default app tenant without admitting named-tenant records.
  return { tenantId: tenantId ?? null };
}

function teacherCacheKey(baseKey) {
  return `${baseKey}:${currentAppTenantKey()}`;
}

/**
 * LibreChat's transitional tenant plugin intentionally leaves queries unfiltered
 * when no ALS tenant exists. CourseWing treats that state as the real default
 * app tenant, so its custom collections need an explicit scope even there.
 */
function applyCourseWingAppTenantScope(schema) {
  if (schema[APP_TENANT_SCOPE_APPLIED]) {
    return;
  }
  schema[APP_TENANT_SCOPE_APPLIED] = true;

  const queryScope = function () {
    const appTenantKey = activeAppTenantFilter();
    if (appTenantKey != null) {
      this.where({ appTenantKey });
    }
  };
  for (const operation of [
    'find',
    'findOne',
    'distinct',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'replaceOne',
  ]) {
    schema.pre(operation, queryScope);
  }

  schema.pre('aggregate', function () {
    const appTenantKey = activeAppTenantFilter();
    if (appTenantKey != null) {
      this.pipeline().unshift({ $match: { appTenantKey } });
    }
  });

  schema.pre('validate', function () {
    const appTenantKey = activeAppTenantFilter();
    if (appTenantKey == null) {
      return;
    }
    if (this.appTenantKey == null) {
      this.appTenantKey = appTenantKey;
    } else if (this.appTenantKey !== appTenantKey) {
      throw new Error('[CourseWingTeacher] Cross-tenant document mutation is not allowed');
    }
  });

  schema.pre('insertMany', function (next, docs) {
    const appTenantKey = activeAppTenantFilter();
    if (appTenantKey != null && Array.isArray(docs)) {
      for (const doc of docs) {
        if (doc.appTenantKey == null) {
          doc.appTenantKey = appTenantKey;
        } else if (doc.appTenantKey !== appTenantKey) {
          return next(new Error('[CourseWingTeacher] Cross-tenant document insert is not allowed'));
        }
      }
    }
    next();
  });
}

const receiptSchema = new mongoose.Schema(
  {
    appTenantKey: { type: String, required: true, select: false },
    tenantId: { type: String },
    conversationId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    canvasAccountKey: { type: String, select: false },
    canvasCourseKey: { type: String, required: true },
    canvasCourseId: { type: Number, required: true },
    topic: String,
    summary: String,
    strengths: String,
    struggles: String,
    usagePattern: String,
    helpLevel: String,
    flagType: String,
    flagNote: String,
    flagStatus: { type: String, default: 'none' },
    unlockLog: [{ at: Date, by: String }],
    messageCount: Number,
    durationMinutes: Number,
    firstMessageAt: Date,
    lastMessageAt: Date,
    model: String,
  },
  { timestamps: true },
);
receiptSchema.index({
  appTenantKey: 1,
  canvasCourseKey: 1,
  canvasCourseId: 1,
  lastMessageAt: -1,
});
receiptSchema.index(
  { appTenantKey: 1, canvasCourseKey: 1, userId: 1, conversationId: 1 },
  {
    name: 'app_tenant_canvas_course_user_conversation_unique',
    unique: true,
    partialFilterExpression: { canvasCourseKey: { $type: 'string' } },
  },
);

const courseSettingSchema = new mongoose.Schema(
  {
    appTenantKey: { type: String, required: true, select: false },
    tenantId: { type: String },
    canvasAccountKey: { type: String, select: false },
    canvasCourseKey: { type: String, required: true },
    canvasCourseId: { type: Number, required: true },
    helpLevel: { type: String, default: 'guided' },
    blockedRules: { type: [String], default: [] },
    overrides: {
      type: [
        {
          canvasAssignmentId: Number,
          name: String,
          level: String,
          blockedRules: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);
courseSettingSchema.index(
  { appTenantKey: 1, canvasCourseKey: 1 },
  {
    name: 'app_tenant_canvas_course_unique',
    unique: true,
    partialFilterExpression: { canvasCourseKey: { $type: 'string' } },
  },
);

const activitySchema = new mongoose.Schema(
  {
    appTenantKey: { type: String, required: true, select: false },
    tenantId: { type: String },
    canvasAccountKey: { type: String, select: false },
    canvasCourseKey: { type: String, required: true },
    canvasCourseId: { type: Number, required: true },
    title: { type: String, required: true },
    type: { type: String, default: 'Practice set' },
    level: { type: String, default: 'guided' },
    prompt: String,
    questions: String,
    dueAt: Date,
    audience: { type: [String], default: [] },
    createdBy: String,
    startedBy: { type: [String], default: [] },
  },
  { timestamps: true },
);
activitySchema.index({
  appTenantKey: 1,
  canvasCourseKey: 1,
  canvasCourseId: 1,
  createdAt: -1,
});

applyTenantIsolation(receiptSchema);
applyTenantIsolation(courseSettingSchema);
applyTenantIsolation(activitySchema);
applyCourseWingAppTenantScope(receiptSchema);
applyCourseWingAppTenantScope(courseSettingSchema);
applyCourseWingAppTenantScope(activitySchema);

/* Collection names keep their pre-rebrand "learnlight" spelling: production data
 * lives there, and data-at-rest identifiers are intentionally not renamed
 * (see the note atop CourseWingAuth.js). */
const CourseWingReceipt =
  mongoose.models.CourseWingReceipt ||
  mongoose.model('CourseWingReceipt', receiptSchema, 'learnlightreceipts');
const CourseWingCourseSetting =
  mongoose.models.CourseWingCourseSetting ||
  mongoose.model('CourseWingCourseSetting', courseSettingSchema, 'learnlightcoursesettings');
const CourseWingActivity =
  mongoose.models.CourseWingActivity ||
  mongoose.model('CourseWingActivity', activitySchema, 'learnlightactivities');

const teacherRoleSchema = new mongoose.Schema(
  {
    appTenantKey: { type: String, required: true, select: false },
    tenantId: { type: String },
    email: { type: String, required: true, lowercase: true },
  },
  { timestamps: true },
);
teacherRoleSchema.index(
  { appTenantKey: 1, email: 1 },
  {
    name: 'app_tenant_email_unique',
    unique: true,
    partialFilterExpression: { appTenantKey: { $type: 'string' } },
  },
);
applyTenantIsolation(teacherRoleSchema);
applyCourseWingAppTenantScope(teacherRoleSchema);
const CourseWingTeacherRole =
  mongoose.models.CourseWingTeacherRole ||
  mongoose.model('CourseWingTeacherRole', teacherRoleSchema, 'learnlightteacherroles');

let teacherStorageIndexPromise = null;

/**
 * Mongoose creates new indexes but does not remove the old globally unique
 * setting-course, receipt-conversation, and teacher-email indexes. Drop only
 * those known legacy indexes (including the pre-app-tenant account indexes)
 * before creating tenant/account-scoped replacements. Existing unscoped
 * records remain quarantined instead of being guessed into a tenant.
 */
async function ensureTeacherStorageIndexes() {
  if (teacherStorageIndexPromise) {
    return teacherStorageIndexPromise;
  }
  teacherStorageIndexPromise = (async () => {
    const legacyIndexes = [
      {
        model: CourseWingCourseSetting,
        name: 'canvasCourseId_1',
      },
      {
        model: CourseWingReceipt,
        name: 'conversationId_1',
      },
      {
        model: CourseWingTeacherRole,
        name: 'email_1',
      },
      {
        model: CourseWingCourseSetting,
        name: 'canvas_account_course_unique',
      },
      {
        model: CourseWingReceipt,
        name: 'canvas_account_user_conversation_unique',
      },
      {
        model: CourseWingCourseSetting,
        name: 'tenant_canvas_account_course_unique',
      },
      {
        model: CourseWingReceipt,
        name: 'tenant_canvas_account_user_conversation_unique',
      },
      {
        model: CourseWingTeacherRole,
        name: 'tenant_email_unique',
      },
    ];
    for (const legacy of legacyIndexes) {
      try {
        const indexes = await legacy.model.collection.indexes();
        const legacyIndex = indexes.find(
          (index) => index.name === legacy.name && index.unique === true,
        );
        if (legacyIndex) {
          await legacy.model.collection.dropIndex(legacyIndex.name);
        }
      } catch (error) {
        // A new deployment may not have created this collection yet.
        if (![26, 27].includes(error?.code) && error?.codeName !== 'NamespaceNotFound') {
          throw error;
        }
      }
    }
    await Promise.all([
      CourseWingReceipt.createIndexes(),
      CourseWingCourseSetting.createIndexes(),
      CourseWingActivity.createIndexes(),
      CourseWingTeacherRole.createIndexes(),
    ]);
  })().catch((error) => {
    teacherStorageIndexPromise = null;
    throw error;
  });
  return teacherStorageIndexPromise;
}

const assignedTeacherCache = new Map();

async function getAssignedTeacherEmails() {
  await ensureTeacherStorageIndexes();
  const cacheKey = teacherCacheKey('coursewing:assigned-teachers');
  const cached = assignedTeacherCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    return cached.emails;
  }
  const docs = await CourseWingTeacherRole.find().select('email').lean();
  const emails = new Set(docs.map((doc) => doc.email));
  assignedTeacherCache.set(cacheKey, { emails, expiresAt: Date.now() + 30 * 1000 });
  return emails;
}

function envTeacherEmails() {
  return (process.env.COURSEWING_TEACHER_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Teacher role: ADMIN, an env-listed email, or an email assigned in the CourseWingTeacherRole collection. */
async function isTeacherUser(user) {
  if (!user) {
    return false;
  }
  if (user.role === 'ADMIN') {
    return true;
  }
  const email = (user.email ?? '').toLowerCase();
  if (!email) {
    return false;
  }
  if (envTeacherEmails().includes(email)) {
    return true;
  }
  return (await getAssignedTeacherEmails()).has(email);
}

const canvasCourseCache = new Map();

/**
 * The caller's current Canvas identity and service-verified shared course keys.
 * A shared key joins teachers and students in the same LMS course; the account
 * key remains the immutable per-user binding for the conversation itself.
 */
async function getCanvasCourseScope(userId, pinnedIdentity, { forceRefresh = false } = {}) {
  await ensureTeacherStorageIndexes();
  const identity =
    pinnedIdentity === undefined ? await getCourseWingCanvasIdentity(userId) : pinnedIdentity;
  if (
    !identity?.tenantId ||
    typeof identity.tenantId !== 'string' ||
    !CANVAS_ACCOUNT_KEY_PATTERN.test(identity.canvasAccountKey ?? '')
  ) {
    return null;
  }
  const cacheKey = teacherCacheKey(`coursewing:courses:${userId}`);
  const cached = canvasCourseCache.get(cacheKey);
  if (
    !forceRefresh &&
    cached &&
    cached.canvasAccountKey === identity.canvasAccountKey &&
    cached.expiresAt > Date.now()
  ) {
    return { ...identity, courseIds: cached.courseIds, courses: cached.courses };
  }
  const { ok, body } = await serviceFetch('/api/coursewing/courses/current', {
    headers: { 'X-Tenant-Id': identity.tenantId },
  });
  if (!ok || !Array.isArray(body)) {
    throw new Error('Canvas service did not return the current course list');
  }
  const courses = new Map();
  for (const course of body) {
    const canvasCourseId = course?.canvasCourseId;
    if (
      !Number.isSafeInteger(canvasCourseId) ||
      canvasCourseId <= 0 ||
      !CANVAS_COURSE_KEY_PATTERN.test(course?.courseKey ?? '') ||
      typeof course?.isInstructor !== 'boolean' ||
      courses.has(canvasCourseId)
    ) {
      throw new Error('Canvas service returned an invalid course scope');
    }
    courses.set(canvasCourseId, {
      courseKey: course.courseKey,
      isInstructor: course.isInstructor,
    });
  }
  const courseIds = new Set(courses.keys());
  canvasCourseCache.set(cacheKey, {
    canvasAccountKey: identity.canvasAccountKey,
    courseIds,
    courses,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return { ...identity, courseIds, courses };
}

/** Courses the teacher's pinned Canvas account can see. */
async function getTeacherCourseIds(userId, pinnedIdentity) {
  return (await getCanvasCourseScope(userId, pinnedIdentity))?.courseIds ?? new Set();
}

const settingsCache = new Map();

function courseScopeKey(canvasCourseKey) {
  return teacherCacheKey(`coursewing:${canvasCourseKey}`);
}

async function getCourseSetting(canvasCourseKey, canvasCourseId) {
  await ensureTeacherStorageIndexes();
  const cacheKey = courseScopeKey(canvasCourseKey);
  const cached = settingsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.setting;
  }
  const setting = await CourseWingCourseSetting.findOne({
    canvasCourseKey,
    canvasCourseId,
  }).lean();
  settingsCache.set(cacheKey, { setting, expiresAt: Date.now() + 30 * 1000 });
  return setting;
}

function clearCourseSettingCache(canvasCourseKey) {
  settingsCache.delete(courseScopeKey(canvasCourseKey));
}

/**
 * Resolves the account-scoped policy the middleware applies to a course chat.
 * Returns `{ policyLevel, blockedRules }` where a null policyLevel means
 * "use the learning default".
 */
async function getCourseAssistance(canvasCourseKey, canvasCourseId, canvasAssignmentId) {
  const setting = await getCourseSetting(canvasCourseKey, canvasCourseId);
  if (!setting) {
    return { consoleLevel: 'guided', policyLevel: null, blockedRules: [] };
  }
  const override =
    canvasAssignmentId != null
      ? (setting.overrides ?? []).find((o) => o.canvasAssignmentId === canvasAssignmentId)
      : null;
  const consoleLevel = override?.level ?? setting.helpLevel ?? 'guided';
  const blockedRules = [...(setting.blockedRules ?? []), ...(override?.blockedRules ?? [])].filter(
    Boolean,
  );
  return {
    consoleLevel,
    policyLevel: CONSOLE_LEVEL_TO_POLICY[consoleLevel] ?? null,
    blockedRules,
  };
}

function isActivityVisibleToUser(activity, user) {
  const audience = activity?.audience ?? [];
  if (!audience.length) {
    return true;
  }
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  return email !== '' && audience.some((value) => String(value).trim().toLowerCase() === email);
}

async function getVisibleCourseActivity(canvasCourseKey, canvasCourseId, activityId, user) {
  if (!mongoose.isValidObjectId(activityId)) {
    return null;
  }
  const activity = await CourseWingActivity.findOne({
    _id: activityId,
    canvasCourseKey,
    canvasCourseId,
  }).lean();
  return isActivityVisibleToUser(activity, user) ? activity : null;
}

function receiptHelpLevelForConsoleLevel(consoleLevel) {
  if (consoleLevel === 'open') {
    return 'full';
  }
  if (consoleLevel === 'socratic') {
    return 'hints';
  }
  return 'guided';
}

/** Resolves receipt metadata from trusted account-scoped storage, never a raw level marker. */
async function resolveConversationHelpLevel(conversation, canvasCourseKey, owner) {
  const assistance = await getCourseAssistance(
    canvasCourseKey,
    conversation.canvasCourseId,
    extractCanvasAssignmentId(conversation.promptPrefix),
  );
  const activityId = extractCanvasActivityId(conversation.promptPrefix);
  if (activityId != null) {
    const activity = await getVisibleCourseActivity(
      canvasCourseKey,
      conversation.canvasCourseId,
      activityId,
      owner,
    );
    if (activity) {
      return receiptHelpLevelForConsoleLevel(activity.level);
    }
  }
  return receiptHelpLevelForConsoleLevel(assistance.consoleLevel);
}

function buildCourseRules(blockedRules) {
  if (!blockedRules?.length) {
    return null;
  }
  return `[CourseWing assistance policy — course rules]\nThe teacher has blocked these uses of the tutor for this course/assignment. Politely decline them and redirect to allowed help: ${blockedRules.join('; ')}.`;
}

let bedrockClient = null;

function getBedrockClient() {
  if (bedrockClient) {
    return bedrockClient;
  }
  const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
  bedrockClient = new BedrockRuntimeClient({
    region: process.env.BEDROCK_AWS_DEFAULT_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY,
    },
  });
  return bedrockClient;
}

/** Collapses consecutive same-role turns — the Converse API requires strict alternation. */
function toConverseMessages(messages) {
  const turns = [];
  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }
    const last = turns[turns.length - 1];
    if (last && last.role === message.role) {
      last.content[0].text += `\n\n${message.content}`;
    } else {
      turns.push({ role: message.role, content: [{ text: message.content }] });
    }
  }
  if (!turns.length || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: [{ text: 'Go ahead.' }] });
  }
  return turns;
}

async function llmChat(messages) {
  if (!process.env.BEDROCK_AWS_ACCESS_KEY_ID) {
    return null;
  }
  try {
    const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
    const system = messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }));
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId: TEACHER_MODEL(),
        system: system.length ? system : undefined,
        messages: toConverseMessages(messages),
        inferenceConfig: { maxTokens: 4000 },
      }),
    );
    const parts = response?.output?.message?.content ?? [];
    return (
      parts
        .map((part) => part.text)
        .filter(Boolean)
        .join('\n') || null
    );
  } catch (error) {
    logger.error(`[CourseWingTeacher] LLM call failed: ${error.message}`);
    return null;
  }
}

async function llmJson(messages) {
  const content = await llmChat(messages);
  if (!content) {
    return null;
  }
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    logger.error('[CourseWingTeacher] LLM returned unparseable JSON');
    return null;
  }
}

function visibleMessageText(message) {
  if (typeof message?.text === 'string' && message.text.trim()) {
    return message.text;
  }
  if (!Array.isArray(message?.content)) {
    return '';
  }
  return message.content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

async function getConversationMessages(conversationId, userId) {
  if (!conversationId || !userId) {
    return [];
  }
  return mongoose.models.Message.find({
    ...conversationAppTenantFilter(),
    conversationId,
    user: String(userId),
  })
    .sort({ createdAt: 1 })
    .select('text content isCreatedByUser createdAt')
    .lean();
}

function buildTranscript(messages, maxChars = MAX_TRANSCRIPT_CHARS) {
  const lines = [];
  for (const message of messages) {
    const text = visibleMessageText(message);
    if (!text) {
      continue;
    }
    lines.push(`${message.isCreatedByUser ? 'Student' : 'Tutor'}: ${text}`);
  }
  let transcript = lines.join('\n\n');
  if (transcript.length > maxChars) {
    transcript = `${transcript.slice(0, maxChars)}\n\n[transcript truncated]`;
  }
  return transcript;
}

const RECEIPT_SYSTEM_PROMPT = `You generate "session receipts" for a teacher dashboard from a student's AI-tutor chat transcript. Receipts are privacy-preserving summaries: specific about the academic content and how the student worked, without quoting the student verbatim.

Return STRICT JSON with exactly these keys:
- "topic": short session title, e.g. "Related rates — cone draining" (max 60 chars)
- "summary": 2-4 sentences for the teacher — what the student worked on, where they got stuck or succeeded, how the session ended. Be concrete about the subject matter.
- "strengths": one sentence on what the student did well (or "" if unclear)
- "struggles": one sentence on what the student needs help with (or "" if none)
- "usagePattern": a few words on how they used the tutor, e.g. "step-by-step practice", "study planning", "quick factual questions"
- "flag": {"type": one of "none", "answer_seeking", "academic_integrity", "wellbeing", "note": one sentence explaining the flag, or ""}

Flag "answer_seeking" only when the student pushes for final answers to graded/assigned work (not normal practice help). Flag "wellbeing" for signs of distress or crisis. Use "none" for ordinary sessions. Do not invent details that are not in the transcript.`;

function normalizeFlagType(value) {
  return ['answer_seeking', 'academic_integrity', 'wellbeing'].includes(value) ? value : null;
}

function resolveFlagStatus(flagType, keepStatus, existing) {
  if (flagType == null) {
    return 'none';
  }
  return keepStatus ? existing.flagStatus : 'pending';
}

async function generateReceipt(conversation, stats, canvasCourseKey, owner) {
  const messages = await getConversationMessages(conversation.conversationId, conversation.user);
  if (messages.length < 2) {
    return null;
  }
  const transcript = buildTranscript(messages);
  const helpLevel = await resolveConversationHelpLevel(conversation, canvasCourseKey, owner);
  const parsed = await llmJson([
    { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Conversation title: ${conversation.title ?? 'untitled'}\nAssistance level: ${helpLevel}\n\nTranscript:\n${transcript}`,
    },
  ]);
  if (!parsed) {
    return null;
  }
  const flagType = normalizeFlagType(parsed.flag?.type);
  // Legacy unscoped receipts remain quarantined. This scoped refresh creates a
  // new receipt rather than guessing which Canvas account owned old data.
  const receiptScope = {
    conversationId: conversation.conversationId,
    userId: String(conversation.user),
    canvasCourseKey,
    canvasCourseId: conversation.canvasCourseId,
  };
  const existing = await CourseWingReceipt.findOne(receiptScope).lean();
  const keepStatus =
    existing != null &&
    existing.flagType === flagType &&
    ['dismissed', 'escalated'].includes(existing.flagStatus);
  const durationMinutes = Math.max(
    1,
    Math.round((stats.last.getTime() - stats.first.getTime()) / 60_000),
  );
  const update = {
    userId: String(conversation.user),
    canvasCourseKey,
    canvasCourseId: conversation.canvasCourseId,
    topic: String(parsed.topic ?? '').slice(0, 120),
    summary: String(parsed.summary ?? '').slice(0, 2000),
    strengths: String(parsed.strengths ?? '').slice(0, 500),
    struggles: String(parsed.struggles ?? '').slice(0, 500),
    usagePattern: String(parsed.usagePattern ?? '').slice(0, 200),
    helpLevel,
    flagType,
    flagNote: flagType ? String(parsed.flag?.note ?? '').slice(0, 500) : null,
    flagStatus: resolveFlagStatus(flagType, keepStatus, existing),
    messageCount: stats.count,
    durationMinutes,
    firstMessageAt: stats.first,
    lastMessageAt: stats.last,
    model: TEACHER_MODEL(),
  };
  return CourseWingReceipt.findOneAndUpdate(
    receiptScope,
    { $set: update },
    { upsert: true, new: true },
  ).lean();
}

/** Generates or refreshes receipts for course conversations whose message counts changed. */
async function refreshReceipts(
  canvasCourseKey,
  canvasCourseId,
  { limit = MAX_RECEIPTS_PER_REFRESH } = {},
) {
  await ensureTeacherStorageIndexes();
  const allConversations = await mongoose.models.Conversation.find({
    ...conversationAppTenantFilter(),
    canvasCourseKey,
    canvasCourseId,
  })
    .select('+canvasCourseKey conversationId user title promptPrefix canvasCourseId')
    .lean();
  const owners = await getUsersById([...new Set(allConversations.map((c) => String(c.user)))]);
  const teacherOwnerIds = new Set();
  for (const [ownerId, owner] of owners) {
    if (await isTeacherUser(owner)) {
      teacherOwnerIds.add(ownerId);
    }
  }
  const conversations = allConversations.filter(
    (c) => !teacherOwnerIds.has(String(c.user)) && !isTeacherAssistantPrefix(c.promptPrefix),
  );
  if (!conversations.length) {
    return { generated: 0, total: 0 };
  }
  const conversationKey = (conversationId, userId) => `${conversationId}\u0000${userId}`;
  const messageScopes = conversations.map((conversation) => ({
    conversationId: conversation.conversationId,
    user: String(conversation.user),
  }));
  const receiptScopes = conversations.map((conversation) => ({
    conversationId: conversation.conversationId,
    userId: String(conversation.user),
  }));
  const messageTenantFilter = conversationAppTenantFilter();
  const [countRows, receipts] = await Promise.all([
    mongoose.models.Message.aggregate([
      { $match: { ...messageTenantFilter, $or: messageScopes } },
      {
        $group: {
          _id: { conversationId: '$conversationId', user: '$user' },
          count: { $sum: 1 },
          first: { $min: '$createdAt' },
          last: { $max: '$createdAt' },
        },
      },
    ]),
    CourseWingReceipt.find({
      canvasCourseKey,
      canvasCourseId,
      $or: receiptScopes,
    })
      .select('conversationId userId messageCount')
      .lean(),
  ]);
  const statsById = new Map(
    countRows.map((row) => [conversationKey(row._id.conversationId, row._id.user), row]),
  );
  const receiptCounts = new Map(
    receipts.map((receipt) => [
      conversationKey(receipt.conversationId, receipt.userId),
      receipt.messageCount,
    ]),
  );
  const stale = conversations.filter((conversation) => {
    const key = conversationKey(conversation.conversationId, String(conversation.user));
    const stats = statsById.get(key);
    return stats != null && stats.count >= 2 && receiptCounts.get(key) !== stats.count;
  });
  const queue = stale.slice(0, limit);
  let generated = 0;
  const workers = Array.from({ length: Math.min(RECEIPT_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const conversation = queue.shift();
      try {
        const receipt = await generateReceipt(
          conversation,
          statsById.get(conversationKey(conversation.conversationId, String(conversation.user))),
          canvasCourseKey,
          owners.get(String(conversation.user)),
        );
        if (receipt) {
          generated += 1;
        }
      } catch (error) {
        logger.error(
          `[CourseWingTeacher] Receipt generation failed for ${conversation.conversationId}`,
          error,
        );
      }
    }
  });
  await Promise.all(workers);
  return {
    generated,
    staleRemaining: Math.max(0, stale.length - limit),
    total: conversations.length,
  };
}

async function getUsersById(userIds) {
  const users = await mongoose.models.User.find({ _id: { $in: userIds } })
    .select('name username email role')
    .lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

function displayName(user) {
  return user?.name || user?.username || user?.email || 'Unknown student';
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function studentStatus(receipts, now) {
  const pendingFlag = receipts.some((r) => r.flagStatus === 'pending');
  if (pendingFlag) {
    return 'Needs support';
  }
  if (receipts.length < 2) {
    return 'Light usage';
  }
  const recent = receipts.filter((r) => now - new Date(r.lastMessageAt).getTime() < 2 * WEEK_MS);
  const struggling = recent.filter((r) => (r.struggles ?? '').trim()).length;
  if (struggling >= 2 && struggling >= recent.length / 2) {
    return 'Watch';
  }
  return 'On track';
}

const pulseCache = new Map();
const profileCache = new Map();

function receiptsVersion(receipts) {
  return `${receipts.length}:${receipts.reduce(
    (max, r) => Math.max(max, new Date(r.updatedAt ?? 0).getTime()),
    0,
  )}`;
}

function receiptsDigest(receipts, nameById, cap = 60) {
  return receipts
    .slice(0, cap)
    .map((r) => {
      const name = displayName(nameById.get(r.userId));
      const when = r.lastMessageAt ? new Date(r.lastMessageAt).toISOString().slice(0, 10) : '?';
      return `- ${name} · ${when} · ${r.durationMinutes ?? '?'}m · ${r.helpLevel} · ${r.topic}: ${r.summary}`;
    })
    .join('\n');
}

async function getPulse(canvasCourseKey, canvasCourseId, receipts, nameById) {
  if (!receipts.length) {
    return null;
  }
  const key = courseScopeKey(canvasCourseKey);
  const version = receiptsVersion(receipts);
  const cached = pulseCache.get(key);
  if (cached && cached.version === version) {
    return cached.pulse;
  }
  const parsed = await llmJson([
    {
      role: 'system',
      content: `You summarize AI-tutor session receipts for a teacher's class-pulse dashboard. Return STRICT JSON:
{"headline": "2-3 sentence class summary for the teacher — biggest shared struggle, what is going well, any engagement pattern. Reference topics and (sparingly) student first names.",
 "insight": "one sentence naming the most common specific sticking point and how many students hit it",
 "topics": [{"name": "short topic label", "count": <sessions on it>}] (max 6, sorted by count desc)}
Only use what is in the receipts; do not invent numbers.`,
    },
    { role: 'user', content: `Session receipts:\n${receiptsDigest(receipts, nameById)}` },
  ]);
  const pulse = parsed
    ? {
        headline: String(parsed.headline ?? ''),
        insight: String(parsed.insight ?? ''),
        topics: Array.isArray(parsed.topics)
          ? parsed.topics.slice(0, 6).map((t) => ({
              name: String(t?.name ?? ''),
              count: Number(t?.count) || 0,
            }))
          : [],
      }
    : null;
  if (pulse) {
    pulseCache.set(key, { version, pulse });
  }
  return pulse;
}

async function getStudentProfile(canvasCourseKey, canvasCourseId, userId, receipts, name) {
  if (!receipts.length) {
    return null;
  }
  const key = `${courseScopeKey(canvasCourseKey)}:${userId}`;
  const version = receiptsVersion(receipts);
  const cached = profileCache.get(key);
  if (cached && cached.version === version) {
    return cached.profile;
  }
  const digest = receipts
    .map(
      (r) =>
        `- ${new Date(r.lastMessageAt).toISOString().slice(0, 10)} · ${r.durationMinutes}m · ${r.topic}: ${r.summary} Strengths: ${r.strengths} Struggles: ${r.struggles} Usage: ${r.usagePattern}`,
    )
    .join('\n');
  const parsed = await llmJson([
    {
      role: 'system',
      content: `You build a one-student profile for a teacher from AI-tutor session receipts. Return STRICT JSON:
{"doingWell": "2-3 sentences on strengths, concrete",
 "needsHelp": "2-3 sentences on the main recurring gap (or what little there is)",
 "usesFor": "1-2 sentences on how this student tends to use the tutor"}
Only use what is in the receipts.`,
    },
    { role: 'user', content: `Student: ${name}\nReceipts:\n${digest}` },
  ]);
  const profile = parsed
    ? {
        doingWell: String(parsed.doingWell ?? ''),
        needsHelp: String(parsed.needsHelp ?? ''),
        usesFor: String(parsed.usesFor ?? ''),
      }
    : null;
  if (profile) {
    profileCache.set(key, { version, profile });
  }
  return profile;
}

async function answerAssistant(canvasCourseId, question, history, receipts, nameById, stats) {
  const context = `You are the class assistant on a teacher dashboard. You answer the teacher's questions about how their students are using the AI tutor, grounded ONLY in the session receipts and stats below (summaries only — you cannot see transcripts). Be concise and specific; use student names and topics from the receipts. If the data does not answer the question, say so.

Class stats: ${JSON.stringify(stats)}

Session receipts (newest first):
${receiptsDigest(receipts, nameById, 80)}`;
  const messages = [
    { role: 'system', content: context },
    ...(Array.isArray(history)
      ? history
          .slice(-10)
          .filter(
            (m) =>
              m != null &&
              ['user', 'assistant'].includes(m.role) &&
              typeof m.text === 'string' &&
              m.text.length < 8000,
          )
          .map((m) => ({ role: m.role, content: m.text }))
      : []),
    { role: 'user', content: String(question).slice(0, 4000) },
  ];
  return llmChat(messages);
}

const TEACHER_ASSISTANT_LINE = 'CourseWing teacher assistant';

function isTeacherAssistantPrefix(promptPrefix) {
  return (
    typeof promptPrefix === 'string' && /^\s*CourseWing teacher assistant\b/im.test(promptPrefix)
  );
}

function buildTeacherAssistantPrompt() {
  return `[CourseWing tutor — class assistant]
You are the class assistant for this course. The person you are chatting with is the TEACHER of the course, not a student — do not apply student tutoring policies to them.
Ground any statements about how students are using the AI tutor in the class receipts card below. Receipts are privacy-preserving summaries — you do not have access to student transcripts; say so if asked for them.
You may use the CourseWing course tools to look up course material, assignments, and dates. Help the teacher analyze patterns, check on specific students, and draft activities, warm-ups, or announcements. Be concise and concrete.`;
}

/** Compact receipts digest appended to teacher-assistant chats each turn. */
async function buildClassReceiptsCard(canvasCourseKey, canvasCourseId) {
  const receipts = await CourseWingReceipt.find({ canvasCourseKey, canvasCourseId })
    .sort({ lastMessageAt: -1 })
    .limit(60)
    .lean();
  if (!receipts.length) {
    return '[CourseWing class receipts]\nNo tutor sessions have been recorded for this course yet.';
  }
  const nameById = await getUsersById([...new Set(receipts.map((r) => r.userId))]);
  const students = new Set(receipts.map((r) => r.userId)).size;
  const pending = receipts.filter((r) => r.flagStatus === 'pending').length;
  return `[CourseWing class receipts]
${receipts.length} session(s) from ${students} student(s) · ${pending} flag(s) awaiting review · newest first
${receiptsDigest(receipts, nameById, 60)}`;
}

module.exports = {
  CourseWingReceipt,
  CourseWingCourseSetting,
  CourseWingActivity,
  CourseWingTeacherRole,
  TEACHER_ASSISTANT_LINE,
  isTeacherAssistantPrefix,
  buildTeacherAssistantPrompt,
  buildClassReceiptsCard,
  CONSOLE_LEVELS,
  isTeacherUser,
  getCanvasCourseScope,
  getTeacherCourseIds,
  ensureTeacherStorageIndexes,
  getCourseSetting,
  clearCourseSettingCache,
  getCourseAssistance,
  isActivityVisibleToUser,
  getVisibleCourseActivity,
  resolveConversationHelpLevel,
  buildCourseRules,
  refreshReceipts,
  getConversationMessages,
  buildTranscript,
  getUsersById,
  displayName,
  initials,
  studentStatus,
  getPulse,
  getStudentProfile,
  answerAssistant,
};
