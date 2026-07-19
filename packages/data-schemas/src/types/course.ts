import type { Document, Types } from 'mongoose';

export type CourseRole = 'teacher' | 'student';
export type CourseMemberState = 'pending' | 'active' | 'removed';
export type CourseMilestoneStatus = 'exploring' | 'working' | 'ready' | 'revised' | 'complete';
export type CourseWorkKind =
  | 'paper'
  | 'presentation'
  | 'project'
  | 'portfolio'
  | 'reflection'
  | 'other';
export type CourseWorkSource = 'student' | 'ai' | 'teacher';
export type CoursePortfolioState = 'none' | 'selected' | 'approved';
export type CourseTimeCategory =
  | 'class'
  | 'reading'
  | 'research'
  | 'coding'
  | 'design'
  | 'ai_experimentation'
  | 'office_hours'
  | 'team_meeting'
  | 'slide_building'
  | 'demo_video'
  | 'website'
  | 'fundraising_ip'
  | 'testing'
  | 'presentation'
  | 'meeting'
  | 'other';
export type CourseFeedbackAuthor = 'ai' | 'teacher';
export type CourseFeedbackVisibility = 'student' | 'teacher';
export type CourseReportKind = 'progress' | 'final';
export type CourseReportStatus = 'draft' | 'reviewed' | 'released';
export type CoursePostKind = 'announcement' | 'resource' | 'deadline' | 'schedule';
export type CourseJsonValue =
  | string
  | number
  | boolean
  | null
  | CourseJsonValue[]
  | { [key: string]: CourseJsonValue };
export type CourseWorkMetadata = Record<string, CourseJsonValue>;

export interface ICourseLink {
  label?: string;
  url: string;
}

export interface ICourse {
  _id?: Types.ObjectId;
  tenantId?: string;
  name: string;
  description?: string;
  createdBy: string;
  status: 'active' | 'archived';
  origin: 'native';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseDocument extends Omit<ICourse, '_id'>, Document {}

export interface ICourseMember {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  userId?: string;
  email: string;
  normalizedEmail: string;
  role: CourseRole;
  state: CourseMemberState;
  invitedBy: string;
  joinedAt?: Date;
  preferredName?: string;
  interests: string[];
  bio?: string;
  website?: string;
  github?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseMemberDocument extends Omit<ICourseMember, '_id'>, Document {}

export interface ICourseTeam {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseTeamDocument extends Omit<ICourseTeam, '_id'>, Document {}

export interface ICourseTechnicalRoute {
  capability?: string;
  dataInput?: string;
  output?: string;
  evaluation?: string;
  safeguards?: string;
}

export interface ICourseProject {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  teamId: string;
  title: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: ICourseTechnicalRoute;
  risks: string[];
  links: ICourseLink[];
  collaboratorEmails: string[];
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseProjectDocument extends Omit<ICourseProject, '_id'>, Document {}

export interface ICourseMilestone {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  projectId?: string;
  studentId?: string;
  title: string;
  description?: string;
  status: CourseMilestoneStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseMilestoneDocument extends Omit<ICourseMilestone, '_id'>, Document {}

export interface ICourseWork {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  studentId: string;
  teamId?: string;
  projectId?: string;
  milestoneId?: string;
  kind: CourseWorkKind;
  title: string;
  description?: string;
  fileIds: string[];
  links: ICourseLink[];
  source: CourseWorkSource;
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
  versionOf?: string;
  portfolioState: CoursePortfolioState;
  aiSummary?: string;
  reflection?: string;
  metadata: CourseWorkMetadata;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseWorkDocument extends Omit<ICourseWork, '_id'>, Document {}

export interface ICourseTime {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  studentId: string;
  projectId?: string;
  milestoneId?: string;
  workId?: string;
  date: Date;
  minutes: number;
  category: CourseTimeCategory;
  customCategory?: string;
  description: string;
  outcome?: string;
  evidenceUrl?: string;
  reflection?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseTimeDocument extends Omit<ICourseTime, '_id'>, Document {}

export interface ICourseAiUse {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  studentId: string;
  projectId?: string;
  date: Date;
  tool: string;
  task: string;
  output: string;
  evidenceUrl?: string;
  reviewed: boolean;
  safetyNotes?: string;
  learning: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseAiUseDocument extends Omit<ICourseAiUse, '_id'>, Document {}

export interface ICourseActionItem {
  id: string;
  text: string;
  status: 'open' | 'addressed';
}

export interface ICourseFeedback {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  studentId: string;
  workId?: string;
  projectId?: string;
  authorId?: string;
  authorType: CourseFeedbackAuthor;
  visibility: CourseFeedbackVisibility;
  content: string;
  actionItems: ICourseActionItem[];
  studentResponse?: string;
  connectedRevisionId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseFeedbackDocument extends Omit<ICourseFeedback, '_id'>, Document {}

export interface ICoursePost {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  authorId: string;
  kind: CoursePostKind;
  title: string;
  body?: string;
  fileIds: string[];
  links: ICourseLink[];
  publishedAt: Date;
  startsAt?: Date;
  endsAt?: Date;
  dueAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICoursePostDocument extends Omit<ICoursePost, '_id'>, Document {}

export interface ICourseReportSection {
  key: string;
  title: string;
  content: string;
  evidenceIds: string[];
}

export interface ICourseReport {
  _id?: Types.ObjectId;
  tenantId?: string;
  courseId: string;
  studentId: string;
  kind: CourseReportKind;
  status: CourseReportStatus;
  sections: ICourseReportSection[];
  evidenceIds: string[];
  generatedAt?: Date;
  generatedBy?: string;
  releasedAt?: Date;
  releasedBy?: string;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICourseReportDocument extends Omit<ICourseReport, '_id'>, Document {}
