import { Schema } from 'mongoose';
import type {
  ICourseDocument,
  ICourseMemberDocument,
  ICourseTeamDocument,
  ICourseProjectDocument,
  ICourseMilestoneDocument,
  ICourseWorkDocument,
  ICourseTimeDocument,
  ICourseAiUseDocument,
  ICourseFeedbackDocument,
  ICoursePostDocument,
  ICourseReportDocument,
} from '~/types';

const linkSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: 120 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
  },
  { _id: false },
);

export const courseSchema: Schema<ICourseDocument> = new Schema<ICourseDocument>(
  {
    tenantId: { type: String, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    createdBy: { type: String, required: true, index: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    origin: { type: String, enum: ['native'], default: 'native', required: true },
  },
  { timestamps: true },
);

courseSchema.index({ tenantId: 1, createdBy: 1, status: 1, updatedAt: -1 });

export const courseMemberSchema: Schema<ICourseMemberDocument> = new Schema<ICourseMemberDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    email: { type: String, required: true, trim: true, maxlength: 320 },
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    role: { type: String, enum: ['teacher', 'student'], required: true, index: true },
    state: {
      type: String,
      enum: ['pending', 'active', 'removed'],
      default: 'pending',
      index: true,
    },
    invitedBy: { type: String, required: true },
    joinedAt: { type: Date },
    preferredName: { type: String, trim: true, maxlength: 120, default: '' },
    interests: [{ type: String, trim: true, maxlength: 120 }],
    bio: { type: String, trim: true, maxlength: 4000, default: '' },
    website: { type: String, trim: true, maxlength: 2048, default: '' },
    github: { type: String, trim: true, maxlength: 2048, default: '' },
  },
  { timestamps: true },
);

courseMemberSchema.index({ tenantId: 1, courseId: 1, normalizedEmail: 1 }, { unique: true });
courseMemberSchema.index({ tenantId: 1, userId: 1, state: 1, updatedAt: -1 });
courseMemberSchema.index({ tenantId: 1, courseId: 1, role: 1, state: 1, _id: 1 });

export const courseTeamSchema: Schema<ICourseTeamDocument> = new Schema<ICourseTeamDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    memberIds: [{ type: String, required: true }],
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

courseTeamSchema.index({ tenantId: 1, courseId: 1, name: 1 });
courseTeamSchema.index({ tenantId: 1, courseId: 1, memberIds: 1 });

export const courseProjectSchema: Schema<ICourseProjectDocument> =
  new Schema<ICourseProjectDocument>(
    {
      tenantId: { type: String, index: true },
      courseId: { type: String, required: true, index: true },
      teamId: { type: String, required: true, index: true },
      title: { type: String, required: true, trim: true, maxlength: 200 },
      problem: { type: String, trim: true, maxlength: 4000, default: '' },
      targetUser: { type: String, trim: true, maxlength: 2000, default: '' },
      valueProposition: { type: String, trim: true, maxlength: 2000, default: '' },
      technicalRoute: {
        capability: { type: String, trim: true, maxlength: 2000 },
        dataInput: { type: String, trim: true, maxlength: 2000 },
        output: { type: String, trim: true, maxlength: 2000 },
        evaluation: { type: String, trim: true, maxlength: 2000 },
        safeguards: { type: String, trim: true, maxlength: 2000 },
      },
      risks: [{ type: String, trim: true, maxlength: 500 }],
      links: { type: [linkSchema], default: [] },
      collaboratorEmails: [{ type: String, trim: true, lowercase: true, maxlength: 320 }],
      createdBy: { type: String, index: true },
    },
    { timestamps: true },
  );

courseProjectSchema.index({ tenantId: 1, courseId: 1, teamId: 1 }, { unique: true });

export const courseMilestoneSchema: Schema<ICourseMilestoneDocument> =
  new Schema<ICourseMilestoneDocument>(
    {
      tenantId: { type: String, index: true },
      courseId: { type: String, required: true, index: true },
      projectId: { type: String, index: true },
      studentId: { type: String, index: true },
      title: { type: String, required: true, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 2000, default: '' },
      status: {
        type: String,
        enum: ['exploring', 'working', 'ready', 'revised', 'complete'],
        default: 'exploring',
        index: true,
      },
      createdBy: { type: String, required: true },
    },
    { timestamps: true },
  );

courseMilestoneSchema.index({ tenantId: 1, courseId: 1, projectId: 1, updatedAt: -1 });
courseMilestoneSchema.index({ tenantId: 1, courseId: 1, studentId: 1, updatedAt: -1 });

export const courseWorkSchema: Schema<ICourseWorkDocument> = new Schema<ICourseWorkDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    teamId: { type: String, index: true },
    projectId: { type: String, index: true },
    milestoneId: { type: String, index: true },
    kind: {
      type: String,
      enum: ['paper', 'presentation', 'project', 'portfolio', 'reflection', 'other'],
      default: 'other',
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    fileIds: [{ type: String, trim: true }],
    links: { type: [linkSchema], default: [] },
    source: { type: String, enum: ['student', 'ai', 'teacher'], required: true },
    sourceConversationId: { type: String },
    sourceMessageId: { type: String },
    sourceToolCallId: { type: String },
    sourceKey: { type: String },
    versionOf: { type: String, index: true },
    portfolioState: {
      type: String,
      enum: ['none', 'selected', 'approved'],
      default: 'none',
      index: true,
    },
    aiSummary: { type: String, maxlength: 10000 },
    reflection: { type: String, maxlength: 10000 },
    metadata: { type: Schema.Types.Mixed, default: {} } as never,
    deletedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

courseWorkSchema.index({ tenantId: 1, courseId: 1, studentId: 1, updatedAt: -1, _id: -1 });
courseWorkSchema.index({ tenantId: 1, courseId: 1, projectId: 1, updatedAt: -1 });
courseWorkSchema.index(
  { tenantId: 1, courseId: 1, studentId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
);

export const courseTimeSchema: Schema<ICourseTimeDocument> = new Schema<ICourseTimeDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    projectId: { type: String, index: true },
    milestoneId: { type: String, index: true },
    workId: { type: String, index: true },
    date: { type: Date, required: true, index: true },
    minutes: { type: Number, required: true, min: 1, max: 1440 },
    category: {
      type: String,
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
      default: 'other',
      index: true,
    },
    customCategory: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    outcome: { type: String, trim: true, maxlength: 2000, default: '' },
    evidenceUrl: { type: String, trim: true, maxlength: 2048, default: '' },
    reflection: { type: String, trim: true, maxlength: 10000, default: '' },
    sourceMessageId: { type: String },
    sourceToolCallId: { type: String },
    sourceKey: { type: String },
    deletedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

courseTimeSchema.index({ tenantId: 1, courseId: 1, studentId: 1, date: -1, _id: -1 });
courseTimeSchema.index(
  { tenantId: 1, courseId: 1, studentId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
);

export const courseAiUseSchema: Schema<ICourseAiUseDocument> = new Schema<ICourseAiUseDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    projectId: { type: String, index: true },
    date: { type: Date, required: true, index: true },
    tool: { type: String, required: true, trim: true, maxlength: 120 },
    task: { type: String, required: true, trim: true, maxlength: 2000 },
    output: { type: String, required: true, trim: true, maxlength: 4000 },
    evidenceUrl: { type: String, trim: true, maxlength: 2048, default: '' },
    reviewed: { type: Boolean, required: true, default: false, index: true },
    safetyNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    learning: { type: String, required: true, trim: true, maxlength: 4000 },
    sourceMessageId: { type: String },
    sourceToolCallId: { type: String },
    sourceKey: { type: String },
    deletedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

courseAiUseSchema.index({ tenantId: 1, courseId: 1, studentId: 1, date: -1, _id: -1 });
courseAiUseSchema.index({ tenantId: 1, courseId: 1, projectId: 1, date: -1, _id: -1 });
courseAiUseSchema.index(
  { tenantId: 1, courseId: 1, studentId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
);

const actionItemSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['open', 'addressed'], default: 'open' },
  },
  { _id: false },
);

export const courseFeedbackSchema: Schema<ICourseFeedbackDocument> =
  new Schema<ICourseFeedbackDocument>(
    {
      tenantId: { type: String, index: true },
      courseId: { type: String, required: true, index: true },
      studentId: { type: String, required: true, index: true },
      workId: { type: String, index: true },
      projectId: { type: String, index: true },
      authorId: { type: String },
      authorType: { type: String, enum: ['ai', 'teacher'], required: true, index: true },
      visibility: { type: String, enum: ['student', 'teacher'], required: true, index: true },
      content: { type: String, required: true, trim: true, maxlength: 10000 },
      actionItems: { type: [actionItemSchema], default: [] },
      studentResponse: { type: String, trim: true, maxlength: 10000, default: '' },
      connectedRevisionId: { type: String, index: true },
    },
    { timestamps: true },
  );

courseFeedbackSchema.index({ tenantId: 1, courseId: 1, studentId: 1, createdAt: -1 });
courseFeedbackSchema.index({ tenantId: 1, courseId: 1, workId: 1, createdAt: -1 });

export const coursePostSchema: Schema<ICoursePostDocument> = new Schema<ICoursePostDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    kind: {
      type: String,
      enum: ['announcement', 'resource', 'deadline', 'schedule'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    body: { type: String, trim: true, maxlength: 20000, default: '' },
    fileIds: [{ type: String, trim: true }],
    links: { type: [linkSchema], default: [] },
    publishedAt: { type: Date, required: true, default: Date.now, index: true },
    startsAt: { type: Date, index: true },
    endsAt: { type: Date, index: true },
    dueAt: { type: Date, index: true },
  },
  { timestamps: true },
);

coursePostSchema.index({ tenantId: 1, courseId: 1, kind: 1, publishedAt: -1 });
coursePostSchema.index({ tenantId: 1, courseId: 1, kind: 1, startsAt: 1 });

const reportSectionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, default: '', maxlength: 30000 },
    evidenceIds: [{ type: String }],
  },
  { _id: false },
);

export const courseReportSchema: Schema<ICourseReportDocument> = new Schema<ICourseReportDocument>(
  {
    tenantId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['progress', 'final'], required: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'reviewed', 'released'],
      default: 'draft',
      index: true,
    },
    sections: { type: [reportSectionSchema], default: [] },
    evidenceIds: [{ type: String }],
    generatedAt: { type: Date },
    generatedBy: { type: String },
    releasedAt: { type: Date },
    releasedBy: { type: String },
    version: { type: Number, required: true, default: 1, min: 1 },
  },
  { timestamps: true },
);

courseReportSchema.index({
  tenantId: 1,
  courseId: 1,
  studentId: 1,
  kind: 1,
  version: -1,
});
