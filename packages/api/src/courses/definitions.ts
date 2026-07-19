import type { ExtendedJsonSchema, ToolRegistryDefinition } from '~/tools/registry/definitions';
import {
  NATIVE_COURSE_CREATE_PROJECT,
  NATIVE_COURSE_DELETE_AI_USE,
  NATIVE_COURSE_DELETE_PROJECT,
  NATIVE_COURSE_DELETE_TIME,
  NATIVE_COURSE_DELETE_WORK,
  NATIVE_COURSE_GET_CONTEXT,
  NATIVE_COURSE_GET_PROFILE,
  NATIVE_COURSE_READ_FILE,
  NATIVE_COURSE_LIST,
  NATIVE_COURSE_LOG_TIME,
  NATIVE_COURSE_RECORD_AI_USE,
  NATIVE_COURSE_RECORD_WORK,
  NATIVE_COURSE_SAVE_AI_REVIEW,
  NATIVE_COURSE_TEACHER_CREATE_FEEDBACK,
  NATIVE_COURSE_TEACHER_DELETE_POST,
  NATIVE_COURSE_TEACHER_GENERATE_REPORT,
  NATIVE_COURSE_TEACHER_GET_CONTEXT,
  NATIVE_COURSE_TEACHER_PUBLISH_POSTS,
  NATIVE_COURSE_TEACHER_RELEASE_REPORT,
  NATIVE_COURSE_TEACHER_UPDATE_POST,
  NATIVE_COURSE_TEACHER_UPDATE_REPORT,
  NATIVE_COURSE_UNDO,
  NATIVE_COURSE_UPDATE_FEEDBACK,
  NATIVE_COURSE_UPDATE_AI_USE,
  NATIVE_COURSE_UPDATE_PROFILE,
  NATIVE_COURSE_UPDATE_PROJECT,
  NATIVE_COURSE_UPDATE_TIME,
  NATIVE_COURSE_UPDATE_WORK,
  nativeCourseToolDescriptions,
} from './tools';

const courseId: ExtendedJsonSchema = {
  type: 'string',
  minLength: 1,
  description: 'Exact native course ID from native_course_list or current course context.',
};
const entityId = (entity: string): ExtendedJsonSchema => ({
  type: 'string',
  minLength: 1,
  description: `Exact ${entity} ID returned by a native course tool.`,
});
const link: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', maxLength: 120 },
    url: { type: 'string', format: 'uri', maxLength: 2048 },
  },
  required: ['url'],
  additionalProperties: false,
};
const links: ExtendedJsonSchema = {
  type: 'array',
  maxItems: 20,
  items: link,
};
const technicalRoute: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    capability: { type: 'string', maxLength: 2000 },
    dataInput: { type: 'string', maxLength: 2000 },
    output: { type: 'string', maxLength: 2000 },
    evaluation: { type: 'string', maxLength: 2000 },
    safeguards: { type: 'string', maxLength: 2000 },
  },
  additionalProperties: false,
};
const workKind: ExtendedJsonSchema = {
  type: 'string',
  enum: ['paper', 'presentation', 'project', 'portfolio', 'reflection', 'other'],
};
const portfolioState: ExtendedJsonSchema = {
  type: 'string',
  enum: ['none', 'selected', 'approved'],
};
const timeCategory: ExtendedJsonSchema = {
  type: 'string',
  enum: [
    'class',
    'reading',
    'research',
    'coding',
    'design',
    'ai_experimentation',
    'office_hours',
    'team_meeting',
    'slide_building',
    'demo_video',
    'website',
    'fundraising_ip',
    'testing',
    'presentation',
    'meeting',
    'other',
  ],
};
const metadata: ExtendedJsonSchema = {
  type: 'object',
  description:
    'Structured fields for this record. For papers use authors (string), year (string), tags (string array), summary, method, keyFindings, limitations, projectImpact (strings), timeSpentMinutes (number), presentationLink (string), and attachments (file metadata array).',
  additionalProperties: true,
};

const projectFields: Record<string, ExtendedJsonSchema> = {
  title: { type: 'string', minLength: 1, maxLength: 200 },
  problem: { type: 'string', maxLength: 4000 },
  targetUser: { type: 'string', maxLength: 2000 },
  valueProposition: { type: 'string', maxLength: 2000 },
  technicalRoute,
  risks: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', minLength: 1, maxLength: 500 },
  },
  links,
  collaboratorEmails: {
    type: 'array',
    maxItems: 100,
    items: { type: 'string', format: 'email', maxLength: 320 },
  },
};

const workFields: Record<string, ExtendedJsonSchema> = {
  title: { type: 'string', minLength: 1, maxLength: 240 },
  description: { type: 'string', maxLength: 10000 },
  kind: workKind,
  projectId: entityId('project'),
  milestoneId: entityId('milestone'),
  links,
  reflection: { type: 'string', maxLength: 10000 },
  metadata,
  portfolioState,
  aiSummary: { type: 'string', maxLength: 10000 },
  versionOf: entityId('earlier work record'),
  fileIds: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', minLength: 1, maxLength: 200 },
    description:
      'Exact uploaded file IDs supplied by the course UI handoff. Never invent file IDs.',
  },
  attachRequestFiles: {
    type: 'boolean',
    description:
      'Defaults to true when the chat request contains attached files. The server supplies their IDs.',
  },
};

const timeFields: Record<string, ExtendedJsonSchema> = {
  minutes: { type: 'integer', minimum: 1, maximum: 1440 },
  category: timeCategory,
  customCategory: {
    type: 'string',
    maxLength: 120,
    description: 'Student-defined category label when category is other.',
  },
  description: { type: 'string', minLength: 1, maxLength: 2000 },
  date: {
    type: 'string',
    description:
      'YYYY-MM-DD date-only value. For “today,” use the exact student local date from course context when available; otherwise omit it and let the server use its local date.',
  },
  projectId: entityId('project'),
  milestoneId: entityId('milestone'),
  workId: entityId('work record'),
  outcome: { type: 'string', maxLength: 2000 },
  evidenceUrl: { type: 'string', maxLength: 2048 },
  reflection: { type: 'string', maxLength: 10000 },
};

const aiUseFields: Record<string, ExtendedJsonSchema> = {
  tool: {
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'Name of the AI tool the student used.',
  },
  task: {
    type: 'string',
    minLength: 1,
    maxLength: 2000,
    description: 'What the student used the AI tool to do.',
  },
  output: {
    type: 'string',
    minLength: 1,
    maxLength: 4000,
    description: 'What the AI produced or suggested.',
  },
  learning: {
    type: 'string',
    minLength: 1,
    maxLength: 4000,
    description: 'What the student learned, changed, or decided after using AI.',
  },
  date: {
    type: 'string',
    description:
      'YYYY-MM-DD date-only value. For “today,” use the exact student local date from course context when available; otherwise omit it.',
  },
  projectId: entityId('project'),
  evidenceUrl: { type: 'string', format: 'uri', maxLength: 2048 },
  reviewed: {
    type: 'boolean',
    description: 'Whether the student personally checked the AI output.',
  },
  safetyNotes: {
    type: 'string',
    maxLength: 2000,
    description: 'Any privacy, citation, bias, accuracy, or safety check the student made.',
  },
};
const coursePostKind: ExtendedJsonSchema = {
  type: 'string',
  enum: ['announcement', 'resource', 'deadline', 'schedule'],
};
const dateTime: ExtendedJsonSchema = {
  type: 'string',
  format: 'date-time',
  description:
    'ISO 8601 date and time with a timezone offset, for example 2026-07-19T09:00:00-04:00.',
};
const teacherPost: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    kind: coursePostKind,
    title: { type: 'string', minLength: 1, maxLength: 240 },
    body: { type: 'string', maxLength: 20000 },
    fileIds: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    links,
    startsAt: dateTime,
    endsAt: dateTime,
    dueAt: dateTime,
  },
  required: ['kind', 'title'],
  additionalProperties: false,
};
const teacherFeedback: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    studentId: entityId('active student'),
    workId: entityId('work record'),
    projectId: entityId('project'),
    visibility: { type: 'string', enum: ['student', 'teacher'], default: 'student' },
    content: { type: 'string', minLength: 1, maxLength: 10000 },
    actionItems: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 1000 },
    },
  },
  required: ['studentId', 'content'],
  additionalProperties: false,
};
const reportSection: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 80 },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    content: { type: 'string', maxLength: 30000 },
    evidenceIds: {
      type: 'array',
      maxItems: 200,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
  },
  required: ['key', 'title', 'content', 'evidenceIds'],
  additionalProperties: false,
};

function definition(
  name: keyof typeof nativeCourseToolDescriptions,
  properties: Record<string, ExtendedJsonSchema>,
  required: string[] = [],
): ToolRegistryDefinition {
  return {
    name,
    description: nativeCourseToolDescriptions[name],
    schema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    toolType: 'custom',
  };
}

export const nativeCourseToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [NATIVE_COURSE_LIST]: definition(NATIVE_COURSE_LIST, {}),
  [NATIVE_COURSE_GET_CONTEXT]: definition(
    NATIVE_COURSE_GET_CONTEXT,
    {
      courseId,
      projectId: entityId('project'),
    },
    ['courseId'],
  ),
  [NATIVE_COURSE_READ_FILE]: definition(
    NATIVE_COURSE_READ_FILE,
    {
      courseId,
      fileId: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Exact uploaded file ID supplied by the course UI or current request.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        maximum: 2000000,
        default: 0,
        description: 'Character offset for the section to read. Start with 0.',
      },
      maxCharacters: {
        type: 'integer',
        minimum: 1000,
        maximum: 50000,
        default: 50000,
        description: 'Maximum characters to return in this section.',
      },
    },
    ['courseId', 'fileId'],
  ),
  [NATIVE_COURSE_GET_PROFILE]: definition(NATIVE_COURSE_GET_PROFILE, { courseId }, ['courseId']),
  [NATIVE_COURSE_UPDATE_PROFILE]: definition(
    NATIVE_COURSE_UPDATE_PROFILE,
    {
      courseId,
      preferredName: { type: 'string', maxLength: 120 },
      interests: {
        type: 'array',
        maxItems: 30,
        items: { type: 'string', minLength: 1, maxLength: 120 },
      },
      bio: { type: 'string', maxLength: 4000 },
      website: { type: 'string', maxLength: 2048 },
      github: { type: 'string', maxLength: 2048 },
    },
    ['courseId'],
  ),
  [NATIVE_COURSE_CREATE_PROJECT]: definition(
    NATIVE_COURSE_CREATE_PROJECT,
    { courseId, ...projectFields },
    ['courseId', 'title'],
  ),
  [NATIVE_COURSE_UPDATE_PROJECT]: definition(
    NATIVE_COURSE_UPDATE_PROJECT,
    {
      courseId,
      projectId: entityId('project'),
      ...projectFields,
    },
    ['courseId', 'projectId'],
  ),
  [NATIVE_COURSE_DELETE_PROJECT]: definition(
    NATIVE_COURSE_DELETE_PROJECT,
    {
      courseId,
      projectId: entityId('project'),
    },
    ['courseId', 'projectId'],
  ),
  [NATIVE_COURSE_RECORD_WORK]: definition(NATIVE_COURSE_RECORD_WORK, { courseId, ...workFields }, [
    'courseId',
    'title',
  ]),
  [NATIVE_COURSE_UPDATE_WORK]: definition(
    NATIVE_COURSE_UPDATE_WORK,
    {
      courseId,
      workId: entityId('work record'),
      ...workFields,
      projectId: {
        type: 'string',
        description: 'Exact project ID, or an empty string to remove the project connection.',
      },
      replaceFileIds: {
        type: 'boolean',
        description: 'Set true to replace existing attachments instead of adding to them.',
      },
    },
    ['courseId', 'workId'],
  ),
  [NATIVE_COURSE_DELETE_WORK]: definition(
    NATIVE_COURSE_DELETE_WORK,
    {
      courseId,
      workId: entityId('work record'),
    },
    ['courseId', 'workId'],
  ),
  [NATIVE_COURSE_LOG_TIME]: definition(NATIVE_COURSE_LOG_TIME, { courseId, ...timeFields }, [
    'courseId',
    'minutes',
    'description',
  ]),
  [NATIVE_COURSE_UPDATE_TIME]: definition(
    NATIVE_COURSE_UPDATE_TIME,
    {
      courseId,
      entryId: entityId('time entry'),
      ...timeFields,
      projectId: {
        type: 'string',
        description: 'Exact project ID, or an empty string to remove the project connection.',
      },
      workId: {
        type: 'string',
        description: 'Exact work ID, or an empty string to remove the work connection.',
      },
    },
    ['courseId', 'entryId'],
  ),
  [NATIVE_COURSE_DELETE_TIME]: definition(
    NATIVE_COURSE_DELETE_TIME,
    {
      courseId,
      entryId: entityId('time entry'),
    },
    ['courseId', 'entryId'],
  ),
  [NATIVE_COURSE_RECORD_AI_USE]: definition(
    NATIVE_COURSE_RECORD_AI_USE,
    { courseId, ...aiUseFields },
    ['courseId', 'tool', 'task', 'output', 'learning'],
  ),
  [NATIVE_COURSE_UPDATE_AI_USE]: definition(
    NATIVE_COURSE_UPDATE_AI_USE,
    {
      courseId,
      entryId: entityId('AI-use entry'),
      ...aiUseFields,
      projectId: {
        type: 'string',
        description: 'Exact project ID, or an empty string to remove the project connection.',
      },
      evidenceUrl: { type: 'string', maxLength: 2048 },
    },
    ['courseId', 'entryId'],
  ),
  [NATIVE_COURSE_DELETE_AI_USE]: definition(
    NATIVE_COURSE_DELETE_AI_USE,
    {
      courseId,
      entryId: entityId('AI-use entry'),
    },
    ['courseId', 'entryId'],
  ),
  [NATIVE_COURSE_UPDATE_FEEDBACK]: definition(
    NATIVE_COURSE_UPDATE_FEEDBACK,
    {
      courseId,
      feedbackId: entityId('feedback record'),
      studentResponse: { type: 'string', maxLength: 10000 },
      connectedRevisionId: {
        type: 'string',
        description: 'Exact work ID, or an empty string to remove the connected revision.',
      },
      actionItemId: { type: 'string' },
      actionItemStatus: { type: 'string', enum: ['open', 'addressed'] },
    },
    ['courseId', 'feedbackId'],
  ),
  [NATIVE_COURSE_SAVE_AI_REVIEW]: definition(
    NATIVE_COURSE_SAVE_AI_REVIEW,
    {
      courseId,
      workId: entityId('work record'),
      projectId: entityId('project'),
      content: { type: 'string', minLength: 1, maxLength: 10000 },
      actionItems: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 1000 },
      },
    },
    ['courseId', 'workId', 'content'],
  ),
  [NATIVE_COURSE_TEACHER_GET_CONTEXT]: definition(
    NATIVE_COURSE_TEACHER_GET_CONTEXT,
    {
      courseId,
      studentId: entityId('active student'),
      projectId: entityId('project'),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 100,
        description: 'Maximum records to return for each student-owned record type.',
      },
    },
    ['courseId'],
  ),
  [NATIVE_COURSE_TEACHER_PUBLISH_POSTS]: definition(
    NATIVE_COURSE_TEACHER_PUBLISH_POSTS,
    {
      courseId,
      posts: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: teacherPost,
        description:
          'Items to publish. Every schedule item requires startsAt; every deadline requires dueAt.',
      },
    },
    ['courseId', 'posts'],
  ),
  [NATIVE_COURSE_TEACHER_UPDATE_POST]: definition(
    NATIVE_COURSE_TEACHER_UPDATE_POST,
    {
      courseId,
      postId: entityId('course post'),
      kind: coursePostKind,
      title: { type: 'string', minLength: 1, maxLength: 240 },
      body: { type: 'string', maxLength: 20000 },
      fileIds: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
      links,
      startsAt: { anyOf: [dateTime, { type: 'null' }] },
      endsAt: { anyOf: [dateTime, { type: 'null' }] },
      dueAt: { anyOf: [dateTime, { type: 'null' }] },
    },
    ['courseId', 'postId'],
  ),
  [NATIVE_COURSE_TEACHER_DELETE_POST]: definition(
    NATIVE_COURSE_TEACHER_DELETE_POST,
    {
      courseId,
      postId: entityId('course post'),
      confirmed: {
        type: 'boolean',
        const: true,
        description: 'True only after the teacher explicitly confirms this deletion.',
      },
    },
    ['courseId', 'postId', 'confirmed'],
  ),
  [NATIVE_COURSE_TEACHER_CREATE_FEEDBACK]: definition(
    NATIVE_COURSE_TEACHER_CREATE_FEEDBACK,
    {
      courseId,
      feedback: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: teacherFeedback,
        description:
          'One record per intended student. Repeat project-level feedback for each intended project member.',
      },
    },
    ['courseId', 'feedback'],
  ),
  [NATIVE_COURSE_TEACHER_GENERATE_REPORT]: definition(
    NATIVE_COURSE_TEACHER_GENERATE_REPORT,
    {
      courseId,
      studentId: entityId('active student'),
      kind: { type: 'string', enum: ['progress', 'final'] },
    },
    ['courseId', 'studentId', 'kind'],
  ),
  [NATIVE_COURSE_TEACHER_UPDATE_REPORT]: definition(
    NATIVE_COURSE_TEACHER_UPDATE_REPORT,
    {
      courseId,
      reportId: entityId('course report'),
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: reportSection,
      },
    },
    ['courseId', 'reportId', 'sections'],
  ),
  [NATIVE_COURSE_TEACHER_RELEASE_REPORT]: definition(
    NATIVE_COURSE_TEACHER_RELEASE_REPORT,
    {
      courseId,
      reportId: entityId('course report'),
      confirmed: {
        type: 'boolean',
        const: true,
        description: 'True only after the teacher explicitly confirms release to the student.',
      },
    },
    ['courseId', 'reportId', 'confirmed'],
  ),
  [NATIVE_COURSE_UNDO]: definition(
    NATIVE_COURSE_UNDO,
    {
      courseId,
      sourceKey: { type: 'string', minLength: 1, maxLength: 200 },
    },
    ['courseId', 'sourceKey'],
  ),
};
