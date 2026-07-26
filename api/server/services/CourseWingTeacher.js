const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { extractAssistanceLevel } = require('librechat-data-provider');
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

const receiptSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    canvasCourseId: { type: Number, required: true, index: true },
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

const courseSettingSchema = new mongoose.Schema(
  {
    canvasCourseId: { type: Number, required: true, unique: true },
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

const activitySchema = new mongoose.Schema(
  {
    canvasCourseId: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, default: 'Practice set' },
    level: { type: String, default: 'guided' },
    prompt: String,
    dueAt: Date,
    audience: { type: [String], default: [] },
    createdBy: String,
    startedBy: { type: [String], default: [] },
  },
  { timestamps: true },
);

const CourseWingReceipt =
  mongoose.models.CourseWingReceipt || mongoose.model('CourseWingReceipt', receiptSchema);
const CourseWingCourseSetting =
  mongoose.models.CourseWingCourseSetting ||
  mongoose.model('CourseWingCourseSetting', courseSettingSchema);
const CourseWingActivity =
  mongoose.models.CourseWingActivity || mongoose.model('CourseWingActivity', activitySchema);

const teacherRoleSchema = new mongoose.Schema(
  { email: { type: String, required: true, unique: true, lowercase: true } },
  { timestamps: true },
);
const CourseWingTeacherRole =
  mongoose.models.CourseWingTeacherRole ||
  mongoose.model('CourseWingTeacherRole', teacherRoleSchema);

let assignedTeacherCache = { emails: new Set(), expiresAt: 0 };

async function getAssignedTeacherEmails() {
  if (assignedTeacherCache.expiresAt > Date.now()) {
    return assignedTeacherCache.emails;
  }
  const docs = await CourseWingTeacherRole.find().select('email').lean();
  const emails = new Set(docs.map((doc) => doc.email));
  assignedTeacherCache = { emails, expiresAt: Date.now() + 30 * 1000 };
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

const teacherCourseCache = new Map();

/** Courses the teacher's own connected Canvas account can see; scopes every console request. */
async function getTeacherCourseIds(userId) {
  const cached = teacherCourseCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.courseIds;
  }
  const identity = await getCourseWingCanvasIdentity(userId);
  if (!identity?.tenantId) {
    return new Set();
  }
  const { ok, body } = await serviceFetch('/api/coursewing/courses/current', {
    headers: { 'X-Tenant-Id': identity.tenantId },
  });
  if (!ok || !Array.isArray(body)) {
    return new Set();
  }
  const courseIds = new Set(
    body.map((course) => course.canvasCourseId).filter((id) => Number.isSafeInteger(id)),
  );
  teacherCourseCache.set(userId, { courseIds, expiresAt: Date.now() + 5 * 60 * 1000 });
  return courseIds;
}

const settingsCache = new Map();

async function getCourseSetting(canvasCourseId) {
  const cached = settingsCache.get(canvasCourseId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.setting;
  }
  const setting = await CourseWingCourseSetting.findOne({ canvasCourseId }).lean();
  settingsCache.set(canvasCourseId, { setting, expiresAt: Date.now() + 30 * 1000 });
  return setting;
}

function clearCourseSettingCache(canvasCourseId) {
  settingsCache.delete(canvasCourseId);
}

/**
 * Resolves the policy the middleware should apply for a course chat that carries no
 * explicit assistance-level marker. Returns `{ policyLevel, blockedRules }` where a null
 * policyLevel means "use the learning default".
 */
async function getCourseAssistance(canvasCourseId, canvasAssignmentId) {
  try {
    const setting = await getCourseSetting(canvasCourseId);
    if (!setting) {
      return { policyLevel: null, blockedRules: [] };
    }
    const override =
      canvasAssignmentId != null
        ? (setting.overrides ?? []).find((o) => o.canvasAssignmentId === canvasAssignmentId)
        : null;
    const consoleLevel = override?.level ?? setting.helpLevel ?? 'guided';
    const blockedRules = [
      ...(setting.blockedRules ?? []),
      ...(override?.blockedRules ?? []),
    ].filter(Boolean);
    return {
      policyLevel: CONSOLE_LEVEL_TO_POLICY[consoleLevel] ?? null,
      blockedRules,
    };
  } catch (error) {
    logger.error('[CourseWingTeacher] Failed to resolve course assistance setting', error);
    return { policyLevel: null, blockedRules: [] };
  }
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

async function getConversationMessages(conversationId) {
  return mongoose.models.Message.find({ conversationId })
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

async function generateReceipt(conversation, stats) {
  const messages = await getConversationMessages(conversation.conversationId);
  if (messages.length < 2) {
    return null;
  }
  const transcript = buildTranscript(messages);
  const markedLevel = extractAssistanceLevel(conversation.promptPrefix);
  const parsed = await llmJson([
    { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Conversation title: ${conversation.title ?? 'untitled'}\nAssistance level: ${markedLevel ?? 'guided (course default)'}\n\nTranscript:\n${transcript}`,
    },
  ]);
  if (!parsed) {
    return null;
  }
  const flagType = normalizeFlagType(parsed.flag?.type);
  const existing = await CourseWingReceipt.findOne({
    conversationId: conversation.conversationId,
  }).lean();
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
    canvasCourseId: conversation.canvasCourseId,
    topic: String(parsed.topic ?? '').slice(0, 120),
    summary: String(parsed.summary ?? '').slice(0, 2000),
    strengths: String(parsed.strengths ?? '').slice(0, 500),
    struggles: String(parsed.struggles ?? '').slice(0, 500),
    usagePattern: String(parsed.usagePattern ?? '').slice(0, 200),
    helpLevel: markedLevel ?? 'guided',
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
    { conversationId: conversation.conversationId },
    { $set: update },
    { upsert: true, new: true },
  ).lean();
}

/** Generates or refreshes receipts for course conversations whose message counts changed. */
async function refreshReceipts(canvasCourseId, { limit = MAX_RECEIPTS_PER_REFRESH } = {}) {
  const allConversations = await mongoose.models.Conversation.find({ canvasCourseId })
    .select('conversationId user title promptPrefix canvasCourseId')
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
  const ids = conversations.map((c) => c.conversationId);
  const [countRows, receipts] = await Promise.all([
    mongoose.models.Message.aggregate([
      { $match: { conversationId: { $in: ids } } },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 },
          first: { $min: '$createdAt' },
          last: { $max: '$createdAt' },
        },
      },
    ]),
    CourseWingReceipt.find({ conversationId: { $in: ids } })
      .select('conversationId messageCount')
      .lean(),
  ]);
  const statsById = new Map(countRows.map((row) => [row._id, row]));
  const receiptCounts = new Map(receipts.map((r) => [r.conversationId, r.messageCount]));
  const stale = conversations.filter((conversation) => {
    const stats = statsById.get(conversation.conversationId);
    return (
      stats != null &&
      stats.count >= 2 &&
      receiptCounts.get(conversation.conversationId) !== stats.count
    );
  });
  const queue = stale.slice(0, limit);
  let generated = 0;
  const workers = Array.from({ length: Math.min(RECEIPT_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const conversation = queue.shift();
      try {
        const receipt = await generateReceipt(
          conversation,
          statsById.get(conversation.conversationId),
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
  return { generated, staleRemaining: Math.max(0, stale.length - limit), total: ids.length };
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

async function getPulse(canvasCourseId, receipts, nameById) {
  if (!receipts.length) {
    return null;
  }
  const version = receiptsVersion(receipts);
  const cached = pulseCache.get(canvasCourseId);
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
    pulseCache.set(canvasCourseId, { version, pulse });
  }
  return pulse;
}

async function getStudentProfile(canvasCourseId, userId, receipts, name) {
  if (!receipts.length) {
    return null;
  }
  const key = `${canvasCourseId}:${userId}`;
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
async function buildClassReceiptsCard(canvasCourseId) {
  const receipts = await CourseWingReceipt.find({ canvasCourseId })
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
  getTeacherCourseIds,
  getCourseSetting,
  clearCourseSettingCache,
  getCourseAssistance,
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
