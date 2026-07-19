import { nanoid } from 'nanoid';
import { isValidObjectIdString, logger, tenantSafeBulkWrite } from '@librechat/data-schemas';

import type {
  ICourse,
  ICourseAiUse,
  ICourseFeedback,
  ICourseLink,
  ICourseMember,
  ICourseMilestone,
  ICoursePost,
  ICourseProject,
  ICourseReport,
  ICourseReportSection,
  ICourseTeam,
  ICourseTime,
  ICourseWork,
  IMongoFile,
  CourseFeedbackVisibility,
  CourseMilestoneStatus,
  CoursePortfolioState,
  CoursePostKind,
  CourseReportKind,
  CourseTimeCategory,
  CourseWorkMetadata,
  CourseJsonValue,
  CourseWorkKind,
  CourseWorkSource,
  createModels,
} from '@librechat/data-schemas';

type Models = Pick<
  ReturnType<typeof createModels>,
  | 'Course'
  | 'CourseMember'
  | 'CourseTeam'
  | 'CourseProject'
  | 'CourseMilestone'
  | 'CourseWork'
  | 'CourseTime'
  | 'CourseAiUse'
  | 'CourseFeedback'
  | 'CoursePost'
  | 'CourseReport'
  | 'File'
  | 'User'
>;

export type CourseAccess = {
  course: ICourse;
  membership: ICourseMember;
  isTeacher: boolean;
};

export type CreateCourseInput = {
  name: string;
  description?: string;
};

export type InviteCourseMemberInput = {
  emails: string[];
};

export type CourseProfile = {
  name: string;
  email: string;
  preferredName: string;
  interests: string[];
  bio: string;
  website: string;
  github: string;
};

export type UpdateCourseProfileInput = Partial<
  Pick<CourseProfile, 'preferredName' | 'interests' | 'bio' | 'website' | 'github'>
>;

type StoredUserProfile = {
  preferredName?: string;
  interests?: string[];
  bio?: string;
  website?: string;
  github?: string;
};

type ProfileUser = {
  name?: string;
  profile?: StoredUserProfile;
};

export type CreateCourseTeamInput = {
  name: string;
  description?: string;
  memberIds?: string[];
};

export type UpdateCourseProjectInput = {
  title?: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: ICourseProject['technicalRoute'];
  risks?: string[];
  links?: ICourseLink[];
  collaboratorEmails?: string[];
};

export type CreateCourseProjectInput = {
  title: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: ICourseProject['technicalRoute'];
  risks?: string[];
  links?: ICourseLink[];
  collaboratorEmails?: string[];
};

export type CreateCourseMilestoneInput = {
  title: string;
  description?: string;
  projectId?: string;
  studentId?: string;
  status?: CourseMilestoneStatus;
};

export type CreateCourseWorkInput = {
  studentId?: string;
  teamId?: string;
  projectId?: string;
  milestoneId?: string;
  kind?: CourseWorkKind;
  title: string;
  description?: string;
  fileIds?: string[];
  links?: ICourseLink[];
  source?: CourseWorkSource;
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
  versionOf?: string;
  portfolioState?: CoursePortfolioState;
  aiSummary?: string;
  reflection?: string;
  metadata?: CourseWorkMetadata;
};

export type CreateCourseTimeInput = {
  studentId?: string;
  projectId?: string;
  milestoneId?: string;
  workId?: string;
  date?: string | Date;
  minutes: number;
  category?: CourseTimeCategory;
  customCategory?: string;
  description: string;
  outcome?: string;
  evidenceUrl?: string;
  reflection?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
};

export type CreateCourseAiUseInput = {
  studentId?: string;
  projectId?: string;
  date?: string | Date;
  tool: string;
  task: string;
  output: string;
  evidenceUrl?: string;
  reviewed?: boolean;
  safetyNotes?: string;
  learning: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
};

export type CreateCourseFeedbackInput = {
  studentId: string;
  workId?: string;
  projectId?: string;
  visibility?: CourseFeedbackVisibility;
  content: string;
  actionItems?: Array<{ text: string }>;
};

export type CreateCourseAiFeedbackInput = Omit<CreateCourseFeedbackInput, 'visibility'>;

export type CreateCoursePostInput = {
  kind: CoursePostKind;
  title: string;
  body?: string;
  fileIds?: string[];
  links?: ICourseLink[];
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  dueAt?: string | Date | null;
};

export type UpdateCourseFeedbackInput = {
  studentResponse?: string;
  connectedRevisionId?: string;
  actionItemId?: string;
  actionStatus?: 'open' | 'addressed';
};

export type CourseOverview = {
  course: ICourse;
  membership: ICourseMember;
  teams: ICourseTeam[];
  projects: ICourseProject[];
  milestones: ICourseMilestone[];
  posts: Array<{
    _id?: object;
    kind: CoursePostKind;
    title: string;
    body?: string;
    fileIds: string[];
    links: ICourseLink[];
    publishedAt: Date;
    startsAt?: Date;
    endsAt?: Date;
    dueAt?: Date;
  }>;
  attention?: {
    unreviewedWork: number;
    activeStudents: number;
    reportDrafts: number;
  };
};

export type ListCourseWorkOptions = {
  studentId?: string;
  projectId?: string;
  kind?: CourseWorkKind;
  limit?: number;
};

export interface CourseService {
  listCourses(userId: string, email?: string): Promise<CourseAccess[]>;
  createCourse(userId: string, email: string, input: CreateCourseInput): Promise<CourseAccess>;
  deleteCourse(userId: string, courseId: string): Promise<void>;
  resolveAccess(userId: string, courseId: string): Promise<CourseAccess>;
  requireTeacher(userId: string, courseId: string): Promise<CourseAccess>;
  inviteMembers(
    userId: string,
    courseId: string,
    input: InviteCourseMemberInput,
  ): Promise<ICourseMember[]>;
  listMembers(userId: string, courseId: string): Promise<ICourseMember[]>;
  removeMember(userId: string, courseId: string, memberId: string): Promise<void>;
  getProfile(userId: string, courseId: string): Promise<CourseProfile>;
  updateProfile(
    userId: string,
    courseId: string,
    input: UpdateCourseProfileInput,
  ): Promise<CourseProfile>;
  createTeam(userId: string, courseId: string, input: CreateCourseTeamInput): Promise<ICourseTeam>;
  listTeams(userId: string, courseId: string): Promise<ICourseTeam[]>;
  updateTeamMembers(
    userId: string,
    courseId: string,
    teamId: string,
    memberIds: string[],
  ): Promise<ICourseTeam>;
  getOrCreateProject(userId: string, courseId: string, teamId: string): Promise<ICourseProject>;
  updateProject(
    userId: string,
    courseId: string,
    teamId: string,
    input: UpdateCourseProjectInput,
  ): Promise<ICourseProject>;
  createProject(
    userId: string,
    courseId: string,
    input: CreateCourseProjectInput,
  ): Promise<ICourseProject>;
  updateProjectById(
    userId: string,
    courseId: string,
    projectId: string,
    input: UpdateCourseProjectInput,
  ): Promise<ICourseProject>;
  deleteProject(userId: string, courseId: string, projectId: string): Promise<void>;
  createMilestone(
    userId: string,
    courseId: string,
    input: CreateCourseMilestoneInput,
  ): Promise<ICourseMilestone>;
  listMilestones(userId: string, courseId: string): Promise<ICourseMilestone[]>;
  updateMilestoneStatus(
    userId: string,
    courseId: string,
    milestoneId: string,
    status: CourseMilestoneStatus,
  ): Promise<ICourseMilestone>;
  createWork(userId: string, courseId: string, input: CreateCourseWorkInput): Promise<ICourseWork>;
  listWork(
    userId: string,
    courseId: string,
    options: ListCourseWorkOptions,
  ): Promise<ICourseWork[]>;
  updateWork(
    userId: string,
    courseId: string,
    workId: string,
    input: Partial<CreateCourseWorkInput>,
  ): Promise<ICourseWork>;
  deleteWork(userId: string, courseId: string, workId: string): Promise<void>;
  getWorkFile(
    userId: string,
    courseId: string,
    workId: string,
    fileId: string,
  ): Promise<IMongoFile>;
  getAccessibleFile(userId: string, courseId: string, fileId: string): Promise<IMongoFile>;
  createTime(userId: string, courseId: string, input: CreateCourseTimeInput): Promise<ICourseTime>;
  listTime(
    userId: string,
    courseId: string,
    studentId?: string,
    projectId?: string,
    limit?: number,
  ): Promise<ICourseTime[]>;
  updateTime(
    userId: string,
    courseId: string,
    entryId: string,
    input: Partial<CreateCourseTimeInput>,
  ): Promise<ICourseTime>;
  deleteTime(userId: string, courseId: string, entryId: string): Promise<void>;
  createAiUse(
    userId: string,
    courseId: string,
    input: CreateCourseAiUseInput,
  ): Promise<ICourseAiUse>;
  listAiUse(
    userId: string,
    courseId: string,
    studentId?: string,
    projectId?: string,
    limit?: number,
  ): Promise<ICourseAiUse[]>;
  updateAiUse(
    userId: string,
    courseId: string,
    entryId: string,
    input: Partial<CreateCourseAiUseInput>,
  ): Promise<ICourseAiUse>;
  deleteAiUse(userId: string, courseId: string, entryId: string): Promise<void>;
  createFeedback(
    userId: string,
    courseId: string,
    input: CreateCourseFeedbackInput,
  ): Promise<ICourseFeedback>;
  createAiFeedback(
    userId: string,
    courseId: string,
    input: CreateCourseAiFeedbackInput,
  ): Promise<ICourseFeedback>;
  listFeedback(userId: string, courseId: string, studentId?: string): Promise<ICourseFeedback[]>;
  updateFeedback(
    userId: string,
    courseId: string,
    feedbackId: string,
    input: UpdateCourseFeedbackInput,
  ): Promise<ICourseFeedback>;
  createPost(userId: string, courseId: string, input: CreateCoursePostInput): Promise<ICoursePost>;
  createPosts(
    userId: string,
    courseId: string,
    inputs: CreateCoursePostInput[],
  ): Promise<ICoursePost[]>;
  listPosts(userId: string, courseId: string): Promise<ICoursePost[]>;
  updatePost(
    userId: string,
    courseId: string,
    postId: string,
    input: Partial<CreateCoursePostInput>,
  ): Promise<ICoursePost>;
  deletePost(userId: string, courseId: string, postId: string): Promise<void>;
  getOverview(userId: string, courseId: string): Promise<CourseOverview>;
  generateReport(
    userId: string,
    courseId: string,
    studentId: string,
    kind: CourseReportKind,
  ): Promise<ICourseReport>;
  listReports(userId: string, courseId: string, studentId?: string): Promise<ICourseReport[]>;
  updateReport(
    userId: string,
    courseId: string,
    reportId: string,
    sections: ICourseReportSection[],
  ): Promise<ICourseReport>;
  releaseReport(userId: string, courseId: string, reportId: string): Promise<ICourseReport>;
  undoAutomaticSave(
    userId: string,
    courseId: string,
    sourceKey: string,
  ): Promise<{ undone: boolean }>;
}

const MAX_LIST_LIMIT = 100;
const MAX_POST_BATCH_SIZE = 50;
const MAX_OVERVIEW_RECENT_POSTS = 100;
const MAX_OVERVIEW_DATED_POSTS = 100;
const COURSE_WORK_KINDS = new Set<CourseWorkKind>([
  'paper',
  'presentation',
  'project',
  'portfolio',
  'reflection',
  'other',
]);
const COURSE_TIME_CATEGORIES = new Set<CourseTimeCategory>([
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
]);
const COURSE_POST_KINDS = new Set<CoursePostKind>([
  'announcement',
  'resource',
  'deadline',
  'schedule',
]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(Math.max(Math.floor(limit ?? 50), 1), MAX_LIST_LIMIT);
}

function objectId(value: string): string | null {
  return isValidObjectIdString(value) ? value : null;
}

function requireObjectId(value: string, label: string): string {
  if (!objectId(value)) {
    throw new CourseServiceError(404, `${label} not found`);
  }
  return value;
}

function cleanString(value: string | undefined, max: number): string {
  return value?.trim().slice(0, max) ?? '';
}

function cleanStrings(values: string[] | undefined, maxItems: number, maxLength: number): string[] {
  return [
    ...new Set((values ?? []).map((value) => cleanString(value, maxLength)).filter(Boolean)),
  ].slice(0, maxItems);
}

function cleanLinks(links: ICourseLink[] | undefined): ICourseLink[] {
  return (links ?? [])
    .filter((link) => /^https?:\/\//i.test(link.url.trim()))
    .slice(0, 20)
    .map((link) => ({
      url: link.url.trim().slice(0, 2048),
      ...(link.label?.trim() ? { label: link.label.trim().slice(0, 120) } : {}),
    }));
}

function cleanUrl(value: string | undefined): string {
  const trimmed = cleanString(value, 2048);
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function cleanOptionalDate(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CourseServiceError(400, 'Invalid date');
  }
  return parsed;
}

function courseDateOnly(value?: string | Date): Date {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const normalized = new Date(Date.UTC(year, month - 1, day));
      if (
        normalized.getUTCFullYear() !== year ||
        normalized.getUTCMonth() !== month - 1 ||
        normalized.getUTCDate() !== day
      ) {
        throw new CourseServiceError(400, 'Invalid time-entry date');
      }
      return normalized;
    }
  }
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    throw new CourseServiceError(400, 'Invalid time-entry date');
  }
  const year = value ? parsed.getUTCFullYear() : parsed.getFullYear();
  const month = value ? parsed.getUTCMonth() : parsed.getMonth();
  const day = value ? parsed.getUTCDate() : parsed.getDate();
  return new Date(Date.UTC(year, month, day));
}

function sanitizeJsonValue(value: unknown, depth = 0): CourseJsonValue | undefined {
  if (depth > 6) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.slice(0, 20_000);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item): item is CourseJsonValue => item !== undefined);
  }
  if (typeof value !== 'object' || value === undefined) {
    return undefined;
  }
  const result: Record<string, CourseJsonValue> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 100)) {
    const key = rawKey.trim().slice(0, 100);
    if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) {
      continue;
    }
    const sanitized = sanitizeJsonValue(rawValue, depth + 1);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }
  return result;
}

function cleanMetadata(value: CourseWorkMetadata | undefined): CourseWorkMetadata {
  const sanitized = sanitizeJsonValue(value ?? {});
  return sanitized && !Array.isArray(sanitized) && typeof sanitized === 'object' ? sanitized : {};
}

function cleanTechnicalRoute(
  value: ICourseProject['technicalRoute'] | undefined,
): ICourseProject['technicalRoute'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    capability: cleanString(value.capability, 2000),
    dataInput: cleanString(value.dataInput, 2000),
    output: cleanString(value.output, 2000),
    evaluation: cleanString(value.evaluation, 2000),
    safeguards: cleanString(value.safeguards, 2000),
  };
}

export class CourseServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CourseServiceError';
  }
}

export function createCourseService(models: Models): CourseService {
  async function ownedFileIds(userId: string, values?: string[]): Promise<string[]> {
    const fileIds = cleanStrings(values, 20, 200);
    if (fileIds.length === 0) {
      return [];
    }
    const files = await models.File.find(
      { file_id: { $in: fileIds }, user: userId },
      { file_id: 1, _id: 0 },
    ).lean<Array<{ file_id: string }>>();
    const owned = new Set(files.map((file) => file.file_id));
    if (fileIds.some((fileId) => !owned.has(fileId))) {
      throw new CourseServiceError(400, 'One or more files are unavailable');
    }
    return fileIds;
  }

  async function prepareCoursePost(
    userId: string,
    courseId: string,
    input: CreateCoursePostInput,
    publishedAt: Date,
  ): Promise<Omit<ICoursePost, '_id'>> {
    if (!COURSE_POST_KINDS.has(input.kind)) {
      throw new CourseServiceError(400, 'Invalid post kind');
    }
    const title = cleanString(input.title, 240);
    if (!title) {
      throw new CourseServiceError(400, 'Title is required');
    }
    const [fileIds, startsAt, endsAt, dueAt] = await Promise.all([
      ownedFileIds(userId, input.fileIds),
      Promise.resolve(cleanOptionalDate(input.startsAt)),
      Promise.resolve(cleanOptionalDate(input.endsAt)),
      Promise.resolve(cleanOptionalDate(input.dueAt)),
    ]);
    if (endsAt && !startsAt) {
      throw new CourseServiceError(400, 'A schedule end time requires a start time');
    }
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new CourseServiceError(400, 'Schedule end time must be after its start time');
    }
    return {
      courseId,
      authorId: userId,
      kind: input.kind,
      title,
      body: cleanString(input.body, 20000),
      fileIds,
      links: cleanLinks(input.links),
      publishedAt,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(dueAt ? { dueAt } : {}),
    };
  }

  async function overviewPosts(courseId: string): Promise<ICoursePost[]> {
    const now = Date.now();
    const currentWindowStart = new Date(now - 36 * 60 * 60 * 1000);
    const currentWindowEnd = new Date(now + 36 * 60 * 60 * 1000);
    const upcomingDeadlineEnd = new Date(now + 90 * 24 * 60 * 60 * 1000);
    const [recent, currentDated] = await Promise.all([
      models.CoursePost.find({ courseId })
        .sort({ publishedAt: -1 })
        .limit(MAX_OVERVIEW_RECENT_POSTS)
        .lean<ICoursePost[]>(),
      models.CoursePost.find({
        courseId,
        $or: [
          {
            kind: 'schedule',
            startsAt: { $gte: currentWindowStart, $lte: currentWindowEnd },
          },
          {
            kind: 'deadline',
            dueAt: { $gte: currentWindowStart, $lte: upcomingDeadlineEnd },
          },
        ],
      })
        .sort({ startsAt: 1, dueAt: 1 })
        .limit(MAX_OVERVIEW_DATED_POSTS)
        .lean<ICoursePost[]>(),
    ]);
    const byId = new Map<string, ICoursePost>();
    for (const post of [...recent, ...currentDated]) {
      byId.set(post._id?.toString() ?? '', post);
    }
    return [...byId.values()].sort(
      (left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0),
    );
  }

  async function profileFromMember(member: ICourseMember): Promise<CourseProfile> {
    const user = member.userId
      ? await models.User.findOne(
          { _id: member.userId },
          { name: 1, profile: 1 },
        ).lean<ProfileUser>()
      : null;
    return {
      name: cleanString(user?.name, 120) || member.email.split('@')[0] || 'Student',
      email: member.email,
      preferredName: user?.profile?.preferredName ?? member.preferredName ?? '',
      interests: user?.profile?.interests ?? member.interests ?? [],
      bio: user?.profile?.bio ?? member.bio ?? '',
      website: user?.profile?.website ?? member.website ?? '',
      github: user?.profile?.github ?? member.github ?? '',
    };
  }

  async function requireActiveStudent(courseId: string, studentId: string): Promise<void> {
    const student = await models.CourseMember.exists({
      courseId,
      userId: studentId,
      role: 'student',
      state: 'active',
    });
    if (!student) {
      throw new CourseServiceError(400, 'Student is not active in this course');
    }
  }

  async function resolveCollaborators(
    access: CourseAccess,
    courseId: string,
    requestedEmails?: string[],
  ): Promise<{ emails: string[]; memberIds: string[] }> {
    const emails = new Set(
      cleanStrings(requestedEmails, 100, 320)
        .map(normalizeEmail)
        .filter((email) => email.includes('@')),
    );
    if (!access.isTeacher) {
      emails.add(access.membership.normalizedEmail);
    }
    if (emails.size === 0) {
      throw new CourseServiceError(400, 'At least one student collaborator is required');
    }
    const members = await models.CourseMember.find({
      courseId,
      normalizedEmail: { $in: [...emails] },
      role: 'student',
      state: 'active',
      userId: { $exists: true },
    }).lean<ICourseMember[]>();
    const foundEmails = new Set(members.map((member) => member.normalizedEmail));
    const missing = [...emails].filter((email) => !foundEmails.has(email));
    if (missing.length > 0) {
      throw new CourseServiceError(
        400,
        `Every collaborator must be an active course student: ${missing.join(', ')}`,
      );
    }
    return {
      emails: [...emails].sort(),
      memberIds: members.map((member) => member.userId).filter(Boolean) as string[],
    };
  }

  async function getAuthorizedProject(
    userId: string,
    courseId: string,
    projectId: string,
    access?: CourseAccess,
  ): Promise<ICourseProject> {
    requireObjectId(projectId, 'Project');
    const resolved = access ?? (await resolveAccess(userId, courseId));
    const project = await models.CourseProject.findOne({
      _id: projectId,
      courseId,
    }).lean<ICourseProject>();
    if (!project) {
      throw new CourseServiceError(404, 'Project not found');
    }
    if (!resolved.isTeacher) {
      const membership = await models.CourseTeam.exists({
        _id: project.teamId,
        courseId,
        memberIds: userId,
      });
      if (!membership) {
        throw new CourseServiceError(404, 'Project not found');
      }
    }
    return project;
  }

  async function validateProjectReference(
    userId: string,
    courseId: string,
    projectId: string | undefined,
    access: CourseAccess,
  ): Promise<ICourseProject | undefined> {
    return projectId ? await getAuthorizedProject(userId, courseId, projectId, access) : undefined;
  }

  async function validateStudentProjectReference(
    userId: string,
    courseId: string,
    projectId: string | undefined,
    studentId: string,
    access: CourseAccess,
  ): Promise<ICourseProject | undefined> {
    const project = await validateProjectReference(userId, courseId, projectId, access);
    if (!project) {
      return undefined;
    }
    const belongs = await models.CourseTeam.exists({
      _id: project.teamId,
      courseId,
      memberIds: studentId,
    });
    if (!belongs) {
      throw new CourseServiceError(400, 'Student is not a collaborator on this project');
    }
    return project;
  }

  async function validateWorkReference(
    courseId: string,
    workId: string | undefined,
    studentId: string,
  ): Promise<void> {
    if (!workId) {
      return;
    }
    requireObjectId(workId, 'Work');
    const work = await models.CourseWork.exists({
      _id: workId,
      courseId,
      studentId,
      deletedAt: { $exists: false },
    });
    if (!work) {
      throw new CourseServiceError(404, 'Work not found');
    }
  }

  async function validateMilestoneReference(
    userId: string,
    courseId: string,
    milestoneId: string | undefined,
    studentId: string,
    access: CourseAccess,
  ): Promise<void> {
    if (!milestoneId) {
      return;
    }
    requireObjectId(milestoneId, 'Milestone');
    const milestone = await models.CourseMilestone.findOne({
      _id: milestoneId,
      courseId,
    }).lean<ICourseMilestone>();
    if (!milestone || (milestone.studentId && milestone.studentId !== studentId)) {
      throw new CourseServiceError(404, 'Milestone not found');
    }
    if (milestone.projectId) {
      await validateStudentProjectReference(
        userId,
        courseId,
        milestone.projectId,
        studentId,
        access,
      );
    }
  }

  async function resolveAccess(userId: string, courseId: string): Promise<CourseAccess> {
    requireObjectId(courseId, 'Course');
    const membership = await models.CourseMember.findOne({
      courseId,
      userId,
      state: 'active',
    }).lean<ICourseMember>();
    if (!membership) {
      throw new CourseServiceError(404, 'Course not found');
    }
    const course = await models.Course.findOne({ _id: courseId, status: 'active' }).lean<ICourse>();
    if (!course) {
      throw new CourseServiceError(404, 'Course not found');
    }
    return { course, membership, isTeacher: membership.role === 'teacher' };
  }

  async function requireTeacher(userId: string, courseId: string): Promise<CourseAccess> {
    const access = await resolveAccess(userId, courseId);
    if (!access.isTeacher) {
      throw new CourseServiceError(403, 'Teacher access required');
    }
    return access;
  }

  async function listCourses(userId: string, _email?: string): Promise<CourseAccess[]> {
    const memberships = await models.CourseMember.find({ userId, state: 'active' })
      .sort({ updatedAt: -1 })
      .limit(MAX_LIST_LIMIT)
      .lean<ICourseMember[]>();
    const courseIds = memberships.map((membership) => membership.courseId);
    const courses = await models.Course.find({ _id: { $in: courseIds }, status: 'active' }).lean<
      ICourse[]
    >();
    const courseById = new Map(courses.map((course) => [course._id?.toString() ?? '', course]));
    return memberships.flatMap((membership) => {
      const course = courseById.get(membership.courseId);
      return course ? [{ course, membership, isTeacher: membership.role === 'teacher' }] : [];
    });
  }

  async function createCourse(
    userId: string,
    email: string,
    input: CreateCourseInput,
  ): Promise<CourseAccess> {
    const name = cleanString(input.name, 160);
    if (!name) {
      throw new CourseServiceError(400, 'Course name is required');
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new CourseServiceError(400, 'Your account needs an email address');
    }

    const course = await models.Course.create({
      name,
      description: cleanString(input.description, 2000),
      createdBy: userId,
      status: 'active',
      origin: 'native',
    });
    try {
      const membership = await models.CourseMember.create({
        courseId: course._id.toString(),
        userId,
        email,
        normalizedEmail,
        role: 'teacher',
        state: 'active',
        invitedBy: userId,
        joinedAt: new Date(),
      });
      return {
        course: course.toObject() as ICourse,
        membership: membership.toObject() as ICourseMember,
        isTeacher: true,
      };
    } catch (error) {
      await models.Course.deleteOne({ _id: course._id });
      throw error;
    }
  }

  async function deleteCourse(userId: string, courseId: string): Promise<void> {
    await requireTeacher(userId, courseId);
    const archived = await models.Course.updateOne(
      { _id: courseId, status: 'active' },
      { $set: { status: 'archived' } },
    );
    if (archived.matchedCount === 0) {
      throw new CourseServiceError(404, 'Course not found');
    }

    await Promise.all([
      models.CourseTeam.deleteMany({ courseId }),
      models.CourseProject.deleteMany({ courseId }),
      models.CourseMilestone.deleteMany({ courseId }),
      models.CourseWork.deleteMany({ courseId }),
      models.CourseTime.deleteMany({ courseId }),
      models.CourseAiUse.deleteMany({ courseId }),
      models.CourseFeedback.deleteMany({ courseId }),
      models.CoursePost.deleteMany({ courseId }),
      models.CourseReport.deleteMany({ courseId }),
    ]);
    await models.CourseMember.deleteMany({ courseId });
    await models.Course.deleteOne({ _id: courseId });
  }

  async function inviteMembers(
    userId: string,
    courseId: string,
    input: InviteCourseMemberInput,
  ): Promise<ICourseMember[]> {
    await requireTeacher(userId, courseId);
    if (input.emails.length > 200) {
      throw new CourseServiceError(400, 'No more than 200 students can be invited at once');
    }
    const emails = [
      ...new Set(input.emails.map(normalizeEmail).filter((email) => email.includes('@'))),
    ];
    if (emails.length === 0) {
      throw new CourseServiceError(400, 'At least one valid email is required');
    }

    const [users, existingMemberships] = await Promise.all([
      models.User.find({ email: { $in: emails } }, '_id email').lean<
        Array<{ _id: object; email: string }>
      >(),
      models.CourseMember.find({
        courseId,
        normalizedEmail: { $in: emails },
      }).lean<ICourseMember[]>(),
    ]);
    const usersByEmail = new Map(
      users.map((user) => [normalizeEmail(user.email), user._id.toString()]),
    );
    const membershipsByEmail = new Map(
      existingMemberships.map((membership) => [membership.normalizedEmail, membership]),
    );
    const operations = emails.flatMap((normalizedEmail) => {
      const existingMembership = membershipsByEmail.get(normalizedEmail);
      if (existingMembership?.role === 'teacher') {
        return [];
      }
      const existingUserId = usersByEmail.get(normalizedEmail);
      const state: ICourseMember['state'] = existingUserId ? 'active' : 'pending';
      return [
        {
          updateOne: {
            filter: { courseId, normalizedEmail },
            update: {
              $set: {
                email: normalizedEmail,
                state,
                invitedBy: userId,
                ...(existingUserId ? { userId: existingUserId, joinedAt: new Date() } : {}),
              },
              $setOnInsert: { courseId, normalizedEmail, role: 'student' },
            },
            upsert: true,
          },
        },
      ];
    });
    if (operations.length > 0) {
      await tenantSafeBulkWrite(models.CourseMember, operations, { ordered: false });
    }
    return await models.CourseMember.find({
      courseId,
      normalizedEmail: { $in: emails },
      state: { $in: ['pending', 'active'] },
    })
      .sort({ normalizedEmail: 1 })
      .lean<ICourseMember[]>();
  }

  async function listMembers(userId: string, courseId: string): Promise<ICourseMember[]> {
    await requireTeacher(userId, courseId);
    return await models.CourseMember.find({ courseId, state: { $ne: 'removed' } })
      .sort({ role: 1, normalizedEmail: 1 })
      .lean<ICourseMember[]>();
  }

  async function removeMember(userId: string, courseId: string, memberId: string): Promise<void> {
    await requireTeacher(userId, courseId);
    const member = await models.CourseMember.findOne({ _id: memberId, courseId });
    if (!member) {
      throw new CourseServiceError(404, 'Student not found');
    }
    if (member.role !== 'student') {
      throw new CourseServiceError(400, 'Teachers cannot be removed here');
    }

    const courseStudentIds = [member._id.toString(), member.userId].filter(Boolean) as string[];
    await Promise.all([
      models.CourseMember.updateOne(
        { _id: member._id, courseId },
        { $set: { state: 'removed' } },
      ),
      models.CourseTeam.updateMany(
        { courseId, memberIds: { $in: courseStudentIds } },
        { $pull: { memberIds: { $in: courseStudentIds } } },
      ),
    ]);
  }

  async function getProfile(userId: string, courseId: string): Promise<CourseProfile> {
    const access = await resolveAccess(userId, courseId);
    if (access.membership.role !== 'student') {
      throw new CourseServiceError(403, 'Student access required');
    }
    return await profileFromMember(access.membership);
  }

  async function updateProfile(
    userId: string,
    courseId: string,
    input: UpdateCourseProfileInput,
  ): Promise<CourseProfile> {
    const access = await resolveAccess(userId, courseId);
    if (access.membership.role !== 'student') {
      throw new CourseServiceError(403, 'Student access required');
    }
    const user = await models.User.findOne({ _id: userId }, { profile: 1 }).lean<ProfileUser>();
    if (!user) {
      throw new CourseServiceError(404, 'Profile not found');
    }
    const update: StoredUserProfile = {
      preferredName: user.profile?.preferredName ?? access.membership.preferredName ?? '',
      interests: user.profile?.interests ?? access.membership.interests ?? [],
      bio: user.profile?.bio ?? access.membership.bio ?? '',
      website: user.profile?.website ?? access.membership.website ?? '',
      github: user.profile?.github ?? access.membership.github ?? '',
    };
    if (input.preferredName !== undefined) {
      update.preferredName = cleanString(input.preferredName, 120);
    }
    if (input.interests !== undefined) {
      update.interests = cleanStrings(input.interests, 30, 120);
    }
    if (input.bio !== undefined) {
      update.bio = cleanString(input.bio, 4000);
    }
    if (input.website !== undefined) {
      const website = cleanUrl(input.website);
      if (input.website.trim() && !website) {
        throw new CourseServiceError(400, 'Website must be an http(s) URL');
      }
      update.website = website;
    }
    if (input.github !== undefined) {
      const github = cleanUrl(input.github);
      if (input.github.trim() && !github) {
        throw new CourseServiceError(400, 'GitHub must be an http(s) URL');
      }
      update.github = github;
    }
    const updatedUser = await models.User.findOneAndUpdate(
      { _id: userId },
      { $set: { profile: update } },
      { new: true },
    ).lean<ProfileUser>();
    if (!updatedUser) {
      throw new CourseServiceError(404, 'Profile not found');
    }
    return {
      name:
        cleanString(updatedUser.name, 120) || access.membership.email.split('@')[0] || 'Student',
      email: access.membership.email,
      preferredName: updatedUser.profile?.preferredName ?? '',
      interests: updatedUser.profile?.interests ?? [],
      bio: updatedUser.profile?.bio ?? '',
      website: updatedUser.profile?.website ?? '',
      github: updatedUser.profile?.github ?? '',
    };
  }

  async function createTeam(
    userId: string,
    courseId: string,
    input: CreateCourseTeamInput,
  ): Promise<ICourseTeam> {
    await requireTeacher(userId, courseId);
    const name = cleanString(input.name, 120);
    if (!name) {
      throw new CourseServiceError(400, 'Group name is required');
    }
    const memberIds = cleanStrings(input.memberIds, 100, 80);
    if (memberIds.length > 0) {
      const activeStudents = await models.CourseMember.countDocuments({
        courseId,
        userId: { $in: memberIds },
        role: 'student',
        state: 'active',
      });
      if (activeStudents !== memberIds.length) {
        throw new CourseServiceError(400, 'Every group member must be an active student');
      }
    }
    const team = await models.CourseTeam.create({
      courseId,
      name,
      description: cleanString(input.description, 1000),
      memberIds,
      createdBy: userId,
    });
    return team.toObject() as ICourseTeam;
  }

  async function listTeams(userId: string, courseId: string): Promise<ICourseTeam[]> {
    const access = await resolveAccess(userId, courseId);
    const filter = access.isTeacher ? { courseId } : { courseId, memberIds: userId };
    return await models.CourseTeam.find(filter).sort({ name: 1 }).lean<ICourseTeam[]>();
  }

  async function updateTeamMembers(
    userId: string,
    courseId: string,
    teamId: string,
    memberIds: string[],
  ): Promise<ICourseTeam> {
    await requireTeacher(userId, courseId);
    requireObjectId(teamId, 'Group');
    const cleaned = cleanStrings(memberIds, 100, 80);
    const activeStudents = await models.CourseMember.countDocuments({
      courseId,
      userId: { $in: cleaned },
      role: 'student',
      state: 'active',
    });
    if (activeStudents !== cleaned.length) {
      throw new CourseServiceError(400, 'Every group member must be an active student');
    }
    const team = await models.CourseTeam.findOneAndUpdate(
      { _id: teamId, courseId },
      { $set: { memberIds: cleaned } },
      { new: true },
    ).lean<ICourseTeam>();
    if (!team) {
      throw new CourseServiceError(404, 'Group not found');
    }
    return team;
  }

  async function getOrCreateProject(
    userId: string,
    courseId: string,
    teamId: string,
  ): Promise<ICourseProject> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(teamId, 'Group');
    const teamFilter = access.isTeacher
      ? { _id: teamId, courseId }
      : { _id: teamId, courseId, memberIds: userId };
    const team = await models.CourseTeam.findOne(teamFilter).lean<ICourseTeam>();
    if (!team) {
      throw new CourseServiceError(404, 'Group not found');
    }
    const existing = await models.CourseProject.findOne({
      courseId,
      teamId,
    }).lean<ICourseProject>();
    if (existing) {
      return existing;
    }
    const project = await models.CourseProject.create({
      courseId,
      teamId,
      title: `${team.name} project`,
      risks: [],
      links: [],
      collaboratorEmails: [],
      createdBy: userId,
    });
    return project.toObject() as ICourseProject;
  }

  async function createProject(
    userId: string,
    courseId: string,
    input: CreateCourseProjectInput,
  ): Promise<ICourseProject> {
    const access = await resolveAccess(userId, courseId);
    const title = cleanString(input.title, 200);
    if (!title) {
      throw new CourseServiceError(400, 'Project title is required');
    }
    const collaborators = await resolveCollaborators(access, courseId, input.collaboratorEmails);
    const team = await models.CourseTeam.create({
      courseId,
      name: title,
      description: 'Project collaborators',
      memberIds: collaborators.memberIds,
      createdBy: userId,
    });
    try {
      const project = await models.CourseProject.create({
        courseId,
        teamId: team._id.toString(),
        title,
        problem: cleanString(input.problem, 4000),
        targetUser: cleanString(input.targetUser, 2000),
        valueProposition: cleanString(input.valueProposition, 2000),
        technicalRoute: cleanTechnicalRoute(input.technicalRoute),
        risks: cleanStrings(input.risks, 20, 500),
        links: cleanLinks(input.links),
        collaboratorEmails: collaborators.emails,
        createdBy: userId,
      });
      return project.toObject() as ICourseProject;
    } catch (error) {
      await models.CourseTeam.deleteOne({ _id: team._id, courseId });
      throw error;
    }
  }

  async function updateProject(
    userId: string,
    courseId: string,
    teamId: string,
    input: UpdateCourseProjectInput,
  ): Promise<ICourseProject> {
    const project = await getOrCreateProject(userId, courseId, teamId);
    return await updateProjectById(userId, courseId, project._id?.toString() ?? '', input);
  }

  async function updateProjectById(
    userId: string,
    courseId: string,
    projectId: string,
    input: UpdateCourseProjectInput,
  ): Promise<ICourseProject> {
    const access = await resolveAccess(userId, courseId);
    const existing = await getAuthorizedProject(userId, courseId, projectId, access);
    const update: Partial<ICourseProject> = {};
    if (input.title !== undefined) {
      const title = cleanString(input.title, 200);
      if (!title) {
        throw new CourseServiceError(400, 'Project title is required');
      }
      update.title = title;
    }
    if (input.problem !== undefined) {
      update.problem = cleanString(input.problem, 4000);
    }
    if (input.targetUser !== undefined) {
      update.targetUser = cleanString(input.targetUser, 2000);
    }
    if (input.valueProposition !== undefined) {
      update.valueProposition = cleanString(input.valueProposition, 2000);
    }
    if (input.risks !== undefined) {
      update.risks = cleanStrings(input.risks, 20, 500);
    }
    if (input.links !== undefined) {
      update.links = cleanLinks(input.links);
    }
    if (input.technicalRoute !== undefined) {
      update.technicalRoute = cleanTechnicalRoute(input.technicalRoute);
    }
    if (input.collaboratorEmails !== undefined) {
      if (!access.isTeacher && existing.createdBy !== userId) {
        throw new CourseServiceError(403, 'Only the project creator can change collaborators');
      }
      const collaborators = await resolveCollaborators(access, courseId, input.collaboratorEmails);
      update.collaboratorEmails = collaborators.emails;
      const team = await models.CourseTeam.findOneAndUpdate(
        { _id: existing.teamId, courseId },
        { $set: { memberIds: collaborators.memberIds } },
        { new: true },
      );
      if (!team) {
        throw new CourseServiceError(404, 'Project not found');
      }
    }
    const project = await models.CourseProject.findOneAndUpdate(
      { _id: projectId, courseId },
      { $set: update },
      { new: true },
    ).lean<ICourseProject>();
    if (!project) {
      throw new CourseServiceError(404, 'Project not found');
    }
    if (update.title) {
      await models.CourseTeam.updateOne(
        { _id: existing.teamId, courseId },
        { $set: { name: update.title } },
      );
    }
    return project;
  }

  async function deleteProject(userId: string, courseId: string, projectId: string): Promise<void> {
    const access = await resolveAccess(userId, courseId);
    const project = await getAuthorizedProject(userId, courseId, projectId, access);
    if (!access.isTeacher && project.createdBy !== userId) {
      throw new CourseServiceError(403, 'Only the project creator can delete this project');
    }
    const result = await models.CourseProject.deleteOne({ _id: projectId, courseId });
    if (result.deletedCount === 0) {
      throw new CourseServiceError(404, 'Project not found');
    }
    const deletedAt = new Date();
    await Promise.all([
      models.CourseTeam.deleteOne({ _id: project.teamId, courseId }),
      models.CourseMilestone.deleteMany({ courseId, projectId }),
      models.CourseWork.updateMany({ courseId, projectId }, { $set: { deletedAt } }),
      models.CourseTime.updateMany({ courseId, projectId }, { $set: { deletedAt } }),
      models.CourseAiUse.updateMany({ courseId, projectId }, { $set: { deletedAt } }),
      models.CourseFeedback.deleteMany({ courseId, projectId }),
    ]);
  }

  async function createMilestone(
    userId: string,
    courseId: string,
    input: CreateCourseMilestoneInput,
  ): Promise<ICourseMilestone> {
    const access = await resolveAccess(userId, courseId);
    const title = cleanString(input.title, 200);
    if (!title) {
      throw new CourseServiceError(400, 'Milestone title is required');
    }
    if (!access.isTeacher && input.studentId && input.studentId !== userId) {
      throw new CourseServiceError(403, 'You can only create your own next action');
    }
    await validateProjectReference(userId, courseId, input.projectId, access);
    if (access.isTeacher && input.studentId) {
      await requireActiveStudent(courseId, input.studentId);
    }
    const milestone = await models.CourseMilestone.create({
      courseId,
      title,
      description: cleanString(input.description, 2000),
      projectId: input.projectId,
      studentId: access.isTeacher ? input.studentId : userId,
      status: input.status ?? 'exploring',
      createdBy: userId,
    });
    return milestone.toObject() as ICourseMilestone;
  }

  async function listMilestones(userId: string, courseId: string): Promise<ICourseMilestone[]> {
    const access = await resolveAccess(userId, courseId);
    if (access.isTeacher) {
      return await models.CourseMilestone.find({ courseId })
        .sort({ updatedAt: -1 })
        .limit(MAX_LIST_LIMIT)
        .lean<ICourseMilestone[]>();
    }
    const teams = await models.CourseTeam.find({ courseId, memberIds: userId }, '_id').lean<
      Array<{ _id: object }>
    >();
    const projects = await models.CourseProject.find({
      courseId,
      teamId: { $in: teams.map((team) => team._id.toString()) },
    }).lean<Array<{ _id?: object }>>();
    return await models.CourseMilestone.find({
      courseId,
      $or: [
        { studentId: { $exists: false }, projectId: { $exists: false } },
        { studentId: userId },
        { projectId: { $in: projects.map((project) => project._id?.toString()).filter(Boolean) } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(MAX_LIST_LIMIT)
      .lean<ICourseMilestone[]>();
  }

  async function updateMilestoneStatus(
    userId: string,
    courseId: string,
    milestoneId: string,
    status: CourseMilestoneStatus,
  ): Promise<ICourseMilestone> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(milestoneId, 'Milestone');
    const ownership = access.isTeacher
      ? { _id: milestoneId, courseId }
      : { _id: milestoneId, courseId, studentId: userId };
    const milestone = await models.CourseMilestone.findOneAndUpdate(
      ownership,
      { $set: { status } },
      { new: true },
    ).lean<ICourseMilestone>();
    if (!milestone) {
      throw new CourseServiceError(404, 'Milestone not found');
    }
    return milestone;
  }

  async function createWork(
    userId: string,
    courseId: string,
    input: CreateCourseWorkInput,
  ): Promise<ICourseWork> {
    const access = await resolveAccess(userId, courseId);
    const studentId = access.isTeacher ? input.studentId : userId;
    if (!studentId) {
      throw new CourseServiceError(400, 'Student is required');
    }
    await requireActiveStudent(courseId, studentId);
    const kind = input.kind ?? 'other';
    if (!COURSE_WORK_KINDS.has(kind)) {
      throw new CourseServiceError(400, 'Invalid work kind');
    }
    const project = await validateStudentProjectReference(
      userId,
      courseId,
      input.projectId,
      studentId,
      access,
    );
    await validateWorkReference(courseId, input.versionOf, studentId);
    await validateMilestoneReference(userId, courseId, input.milestoneId, studentId, access);
    const title = cleanString(input.title, 240);
    if (!title) {
      throw new CourseServiceError(400, 'Work title is required');
    }
    const fileIds = await ownedFileIds(userId, input.fileIds);
    const payload = {
      courseId,
      studentId,
      teamId: project?.teamId ?? input.teamId,
      projectId: input.projectId,
      milestoneId: input.milestoneId,
      kind,
      title,
      description: cleanString(input.description, 10000),
      fileIds,
      links: cleanLinks(input.links),
      source: input.source ?? (access.isTeacher ? 'teacher' : 'student'),
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      sourceToolCallId: input.sourceToolCallId,
      sourceKey: input.sourceKey,
      versionOf: input.versionOf,
      portfolioState: input.portfolioState ?? 'none',
      aiSummary: cleanString(input.aiSummary, 10000),
      reflection: cleanString(input.reflection, 10000),
      metadata: cleanMetadata(input.metadata),
    };
    if (input.sourceKey) {
      const work = await models.CourseWork.findOneAndUpdate(
        { courseId, studentId, sourceKey: input.sourceKey },
        { $setOnInsert: payload },
        { new: true, upsert: true },
      ).lean<ICourseWork>();
      if (!work) {
        throw new CourseServiceError(500, 'Unable to save work');
      }
      return work;
    }
    const work = await models.CourseWork.create(payload);
    return work.toObject() as ICourseWork;
  }

  async function listWork(
    userId: string,
    courseId: string,
    options: ListCourseWorkOptions,
  ): Promise<ICourseWork[]> {
    const access = await resolveAccess(userId, courseId);
    if (!access.isTeacher && options.projectId) {
      await getAuthorizedProject(userId, courseId, options.projectId, access);
    }
    let studentId = access.isTeacher ? options.studentId : userId;
    if (!access.isTeacher && options.projectId) {
      studentId = undefined;
    }
    const filter: {
      courseId: string;
      deletedAt: { $exists: boolean };
      studentId?: string;
      projectId?: string;
      kind?: CourseWorkKind;
    } = { courseId, deletedAt: { $exists: false } };
    if (studentId) {
      filter.studentId = studentId;
    }
    if (options.projectId) {
      filter.projectId = options.projectId;
    }
    if (options.kind) {
      filter.kind = options.kind;
    }
    return await models.CourseWork.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(normalizeLimit(options.limit))
      .lean<ICourseWork[]>();
  }

  async function updateWork(
    userId: string,
    courseId: string,
    workId: string,
    input: Partial<CreateCourseWorkInput>,
  ): Promise<ICourseWork> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(workId, 'Work');
    const filter = access.isTeacher
      ? { _id: workId, courseId, deletedAt: { $exists: false } }
      : { _id: workId, courseId, studentId: userId, deletedAt: { $exists: false } };
    const existing = await models.CourseWork.findOne(filter).lean<ICourseWork>();
    if (!existing) {
      throw new CourseServiceError(404, 'Work not found');
    }
    const update: Partial<ICourseWork> = {};
    const unset: Record<string, 1> = {};
    if (input.title !== undefined) {
      const title = cleanString(input.title, 240);
      if (!title) {
        throw new CourseServiceError(400, 'Work title is required');
      }
      update.title = title;
    }
    if (input.kind !== undefined) {
      if (!COURSE_WORK_KINDS.has(input.kind)) {
        throw new CourseServiceError(400, 'Invalid work kind');
      }
      update.kind = input.kind;
    }
    if (input.description !== undefined) {
      update.description = cleanString(input.description, 10000);
    }
    if (input.fileIds !== undefined) {
      update.fileIds = await ownedFileIds(userId, input.fileIds);
    }
    if (input.links !== undefined) {
      update.links = cleanLinks(input.links);
    }
    if (input.reflection !== undefined) {
      update.reflection = cleanString(input.reflection, 10000);
    }
    if (input.metadata !== undefined) {
      update.metadata = cleanMetadata(input.metadata);
    }
    if (input.aiSummary !== undefined) {
      update.aiSummary = cleanString(input.aiSummary, 10000);
    }
    if (input.versionOf !== undefined) {
      if (input.versionOf) {
        await validateWorkReference(courseId, input.versionOf, existing.studentId);
        update.versionOf = input.versionOf;
      } else {
        unset.versionOf = 1;
      }
    }
    if (input.portfolioState !== undefined) {
      update.portfolioState = input.portfolioState;
    }
    if (input.milestoneId !== undefined) {
      if (input.milestoneId) {
        await validateMilestoneReference(
          userId,
          courseId,
          input.milestoneId,
          existing.studentId,
          access,
        );
        update.milestoneId = input.milestoneId;
      } else {
        unset.milestoneId = 1;
      }
    }
    if (input.projectId !== undefined) {
      if (input.projectId) {
        const project = await validateStudentProjectReference(
          userId,
          courseId,
          input.projectId,
          existing.studentId,
          access,
        );
        update.projectId = input.projectId;
        update.teamId = project?.teamId;
      } else {
        unset.projectId = 1;
        unset.teamId = 1;
      }
    }
    const work = await models.CourseWork.findOneAndUpdate(
      filter,
      {
        $set: update,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    ).lean<ICourseWork>();
    if (!work) {
      throw new CourseServiceError(404, 'Work not found');
    }
    return work;
  }

  async function deleteWork(userId: string, courseId: string, workId: string): Promise<void> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(workId, 'Work');
    const filter = access.isTeacher
      ? { _id: workId, courseId }
      : { _id: workId, courseId, studentId: userId };
    const result = await models.CourseWork.updateOne(filter, { $set: { deletedAt: new Date() } });
    if (result.matchedCount === 0) {
      throw new CourseServiceError(404, 'Work not found');
    }
  }

  async function getWorkFile(
    userId: string,
    courseId: string,
    workId: string,
    fileId: string,
  ): Promise<IMongoFile> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(workId, 'Work');
    const work = await models.CourseWork.findOne({
      _id: workId,
      courseId,
      fileIds: fileId,
      deletedAt: { $exists: false },
    }).lean<ICourseWork>();
    if (!work) {
      throw new CourseServiceError(404, 'File not found');
    }
    if (!access.isTeacher && work.studentId !== userId) {
      if (!work.projectId) {
        throw new CourseServiceError(404, 'File not found');
      }
      await getAuthorizedProject(userId, courseId, work.projectId, access);
    }
    const file = await models.File.findOne({ file_id: fileId }).lean<IMongoFile>();
    if (!file) {
      throw new CourseServiceError(404, 'File not found');
    }
    return file;
  }

  async function getAccessibleFile(
    userId: string,
    courseId: string,
    fileId: string,
  ): Promise<IMongoFile> {
    const access = await resolveAccess(userId, courseId);
    const normalizedFileId = cleanString(fileId, 200);
    if (!normalizedFileId) {
      throw new CourseServiceError(404, 'File not found');
    }
    const owned = await models.File.findOne({
      file_id: normalizedFileId,
      user: userId,
    }).lean<IMongoFile>();
    if (owned) {
      return owned;
    }

    const work = await models.CourseWork.findOne({
      courseId,
      fileIds: normalizedFileId,
      deletedAt: { $exists: false },
    }).lean<ICourseWork>();
    if (!work) {
      throw new CourseServiceError(404, 'File not found');
    }
    if (!access.isTeacher && work.studentId !== userId) {
      if (!work.projectId) {
        throw new CourseServiceError(404, 'File not found');
      }
      await getAuthorizedProject(userId, courseId, work.projectId, access);
    }
    const file = await models.File.findOne({ file_id: normalizedFileId }).lean<IMongoFile>();
    if (!file) {
      throw new CourseServiceError(404, 'File not found');
    }
    return file;
  }

  async function createTime(userId: string, courseId: string, input: CreateCourseTimeInput) {
    const access = await resolveAccess(userId, courseId);
    const studentId = access.isTeacher ? input.studentId : userId;
    if (!studentId) {
      throw new CourseServiceError(400, 'Student is required');
    }
    await requireActiveStudent(courseId, studentId);
    const category = input.category ?? 'other';
    if (!COURSE_TIME_CATEGORIES.has(category)) {
      throw new CourseServiceError(400, 'Invalid time category');
    }
    await validateStudentProjectReference(userId, courseId, input.projectId, studentId, access);
    await validateWorkReference(courseId, input.workId, studentId);
    await validateMilestoneReference(userId, courseId, input.milestoneId, studentId, access);
    const minutes = Math.floor(input.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      throw new CourseServiceError(400, 'Minutes must be between 1 and 1440');
    }
    const description = cleanString(input.description, 2000);
    if (!description) {
      throw new CourseServiceError(400, 'Time description is required');
    }
    const parsedDate = courseDateOnly(input.date);
    const evidenceUrl = cleanUrl(input.evidenceUrl);
    if (input.evidenceUrl?.trim() && !evidenceUrl) {
      throw new CourseServiceError(400, 'Evidence must be an http(s) URL');
    }
    const payload = {
      courseId,
      studentId,
      projectId: input.projectId,
      milestoneId: input.milestoneId,
      workId: input.workId,
      date: parsedDate,
      minutes,
      category,
      customCategory: category === 'other' ? cleanString(input.customCategory, 120) : '',
      description,
      outcome: cleanString(input.outcome, 2000),
      evidenceUrl,
      reflection: cleanString(input.reflection, 10000),
      sourceMessageId: input.sourceMessageId,
      sourceToolCallId: input.sourceToolCallId,
      sourceKey: input.sourceKey,
    };
    if (input.sourceKey) {
      const entry = await models.CourseTime.findOneAndUpdate(
        { courseId, studentId, sourceKey: input.sourceKey },
        { $setOnInsert: payload },
        { new: true, upsert: true },
      ).lean();
      if (!entry) {
        throw new CourseServiceError(500, 'Unable to save time');
      }
      return entry;
    }
    return (await models.CourseTime.create(payload)).toObject();
  }

  async function listTime(
    userId: string,
    courseId: string,
    studentId?: string,
    projectId?: string,
    limit?: number,
  ) {
    const access = await resolveAccess(userId, courseId);
    const ownerId = access.isTeacher ? studentId : userId;
    const filter = {
      courseId,
      deletedAt: { $exists: false },
      ...(ownerId ? { studentId: ownerId } : {}),
      ...(projectId ? { projectId } : {}),
    };
    return await models.CourseTime.find(filter)
      .sort({ date: -1, _id: -1 })
      .limit(normalizeLimit(limit))
      .lean();
  }

  async function updateTime(
    userId: string,
    courseId: string,
    entryId: string,
    input: Partial<CreateCourseTimeInput>,
  ): Promise<ICourseTime> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(entryId, 'Time entry');
    const filter = access.isTeacher
      ? { _id: entryId, courseId, deletedAt: { $exists: false } }
      : { _id: entryId, courseId, studentId: userId, deletedAt: { $exists: false } };
    const existing = await models.CourseTime.findOne(filter).lean<ICourseTime>();
    if (!existing) {
      throw new CourseServiceError(404, 'Time entry not found');
    }
    const update: Partial<ICourseTime> = {};
    const unset: Record<string, 1> = {};
    if (input.date !== undefined) {
      update.date = courseDateOnly(input.date);
    }
    if (input.minutes !== undefined) {
      const minutes = Math.floor(input.minutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        throw new CourseServiceError(400, 'Minutes must be between 1 and 1440');
      }
      update.minutes = minutes;
    }
    if (input.category !== undefined) {
      if (!COURSE_TIME_CATEGORIES.has(input.category)) {
        throw new CourseServiceError(400, 'Invalid time category');
      }
      update.category = input.category;
    }
    if (input.customCategory !== undefined || input.category !== undefined) {
      const nextCategory = input.category ?? existing.category;
      update.customCategory =
        nextCategory === 'other'
          ? cleanString(input.customCategory ?? existing.customCategory, 120)
          : '';
    }
    if (input.description !== undefined) {
      const description = cleanString(input.description, 2000);
      if (!description) {
        throw new CourseServiceError(400, 'Time description is required');
      }
      update.description = description;
    }
    if (input.outcome !== undefined) {
      update.outcome = cleanString(input.outcome, 2000);
    }
    if (input.evidenceUrl !== undefined) {
      const evidenceUrl = cleanUrl(input.evidenceUrl);
      if (input.evidenceUrl.trim() && !evidenceUrl) {
        throw new CourseServiceError(400, 'Evidence must be an http(s) URL');
      }
      update.evidenceUrl = evidenceUrl;
    }
    if (input.reflection !== undefined) {
      update.reflection = cleanString(input.reflection, 10000);
    }
    if (input.milestoneId !== undefined) {
      if (input.milestoneId) {
        await validateMilestoneReference(
          userId,
          courseId,
          input.milestoneId,
          existing.studentId,
          access,
        );
        update.milestoneId = input.milestoneId;
      } else {
        unset.milestoneId = 1;
      }
    }
    if (input.projectId !== undefined) {
      if (input.projectId) {
        await validateStudentProjectReference(
          userId,
          courseId,
          input.projectId,
          existing.studentId,
          access,
        );
        update.projectId = input.projectId;
      } else {
        unset.projectId = 1;
      }
    }
    if (input.workId !== undefined) {
      if (input.workId) {
        await validateWorkReference(courseId, input.workId, existing.studentId);
        update.workId = input.workId;
      } else {
        unset.workId = 1;
      }
    }
    const entry = await models.CourseTime.findOneAndUpdate(
      filter,
      {
        $set: update,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    ).lean<ICourseTime>();
    if (!entry) {
      throw new CourseServiceError(404, 'Time entry not found');
    }
    return entry;
  }

  async function deleteTime(userId: string, courseId: string, entryId: string): Promise<void> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(entryId, 'Time entry');
    const filter = access.isTeacher
      ? { _id: entryId, courseId, deletedAt: { $exists: false } }
      : { _id: entryId, courseId, studentId: userId, deletedAt: { $exists: false } };
    const result = await models.CourseTime.updateOne(filter, { $set: { deletedAt: new Date() } });
    if (result.matchedCount === 0) {
      throw new CourseServiceError(404, 'Time entry not found');
    }
  }

  async function createAiUse(
    userId: string,
    courseId: string,
    input: CreateCourseAiUseInput,
  ): Promise<ICourseAiUse> {
    const access = await resolveAccess(userId, courseId);
    const studentId = access.isTeacher ? input.studentId : userId;
    if (!studentId) {
      throw new CourseServiceError(400, 'Student is required');
    }
    await requireActiveStudent(courseId, studentId);
    await validateStudentProjectReference(userId, courseId, input.projectId, studentId, access);
    const tool = cleanString(input.tool, 120);
    const task = cleanString(input.task, 2000);
    const output = cleanString(input.output, 4000);
    const learning = cleanString(input.learning, 4000);
    if (!tool || !task || !output || !learning) {
      throw new CourseServiceError(400, 'Tool, task, output, and learning are required');
    }
    const evidenceUrl = cleanUrl(input.evidenceUrl);
    if (input.evidenceUrl?.trim() && !evidenceUrl) {
      throw new CourseServiceError(400, 'Evidence must be an http(s) URL');
    }
    const payload = {
      courseId,
      studentId,
      projectId: input.projectId,
      date: courseDateOnly(input.date),
      tool,
      task,
      output,
      evidenceUrl,
      reviewed: input.reviewed === true,
      safetyNotes: cleanString(input.safetyNotes, 2000),
      learning,
      sourceMessageId: input.sourceMessageId,
      sourceToolCallId: input.sourceToolCallId,
      sourceKey: input.sourceKey,
    };
    if (input.sourceKey) {
      const entry = await models.CourseAiUse.findOneAndUpdate(
        { courseId, studentId, sourceKey: input.sourceKey },
        { $setOnInsert: payload },
        { new: true, upsert: true },
      ).lean<ICourseAiUse>();
      if (!entry) {
        throw new CourseServiceError(500, 'Could not save AI use');
      }
      return entry;
    }
    const entry = await models.CourseAiUse.create(payload);
    return entry.toObject() as ICourseAiUse;
  }

  async function listAiUse(
    userId: string,
    courseId: string,
    studentId?: string,
    projectId?: string,
    limit?: number,
  ): Promise<ICourseAiUse[]> {
    const access = await resolveAccess(userId, courseId);
    const ownerId = access.isTeacher ? studentId : userId;
    const filter = {
      courseId,
      deletedAt: { $exists: false },
      ...(ownerId ? { studentId: ownerId } : {}),
      ...(projectId ? { projectId } : {}),
    };
    return await models.CourseAiUse.find(filter)
      .sort({ date: -1, _id: -1 })
      .limit(normalizeLimit(limit))
      .lean<ICourseAiUse[]>();
  }

  async function updateAiUse(
    userId: string,
    courseId: string,
    entryId: string,
    input: Partial<CreateCourseAiUseInput>,
  ): Promise<ICourseAiUse> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(entryId, 'AI use entry');
    const filter = access.isTeacher
      ? { _id: entryId, courseId, deletedAt: { $exists: false } }
      : { _id: entryId, courseId, studentId: userId, deletedAt: { $exists: false } };
    const existing = await models.CourseAiUse.findOne(filter).lean<ICourseAiUse>();
    if (!existing) {
      throw new CourseServiceError(404, 'AI use entry not found');
    }
    const update: Partial<ICourseAiUse> = {};
    const unset: Record<string, 1> = {};
    if (input.date !== undefined) {
      update.date = courseDateOnly(input.date);
    }
    const requiredTextFields = [
      ['tool', 120],
      ['task', 2000],
      ['output', 4000],
      ['learning', 4000],
    ] as const;
    for (const [field, max] of requiredTextFields) {
      if (input[field] === undefined) {
        continue;
      }
      const value = cleanString(input[field], max);
      if (!value) {
        throw new CourseServiceError(400, `${field} is required`);
      }
      update[field] = value;
    }
    if (input.evidenceUrl !== undefined) {
      const evidenceUrl = cleanUrl(input.evidenceUrl);
      if (input.evidenceUrl.trim() && !evidenceUrl) {
        throw new CourseServiceError(400, 'Evidence must be an http(s) URL');
      }
      update.evidenceUrl = evidenceUrl;
    }
    if (input.reviewed !== undefined) {
      update.reviewed = input.reviewed === true;
    }
    if (input.safetyNotes !== undefined) {
      update.safetyNotes = cleanString(input.safetyNotes, 2000);
    }
    if (input.projectId !== undefined) {
      if (input.projectId) {
        await validateStudentProjectReference(
          userId,
          courseId,
          input.projectId,
          existing.studentId,
          access,
        );
        update.projectId = input.projectId;
      } else {
        unset.projectId = 1;
      }
    }
    const entry = await models.CourseAiUse.findOneAndUpdate(
      filter,
      {
        $set: update,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    ).lean<ICourseAiUse>();
    if (!entry) {
      throw new CourseServiceError(404, 'AI use entry not found');
    }
    return entry;
  }

  async function deleteAiUse(userId: string, courseId: string, entryId: string): Promise<void> {
    const access = await resolveAccess(userId, courseId);
    requireObjectId(entryId, 'AI use entry');
    const filter = access.isTeacher
      ? { _id: entryId, courseId, deletedAt: { $exists: false } }
      : { _id: entryId, courseId, studentId: userId, deletedAt: { $exists: false } };
    const result = await models.CourseAiUse.updateOne(filter, { $set: { deletedAt: new Date() } });
    if (result.matchedCount === 0) {
      throw new CourseServiceError(404, 'AI use entry not found');
    }
  }

  async function createFeedback(
    userId: string,
    courseId: string,
    input: CreateCourseFeedbackInput,
  ) {
    const access = await requireTeacher(userId, courseId);
    await requireActiveStudent(courseId, input.studentId);
    await validateWorkReference(courseId, input.workId, input.studentId);
    await validateStudentProjectReference(
      userId,
      courseId,
      input.projectId,
      input.studentId,
      access,
    );
    const content = cleanString(input.content, 10000);
    if (!content) {
      throw new CourseServiceError(400, 'Feedback is required');
    }
    const feedback = await models.CourseFeedback.create({
      courseId,
      studentId: input.studentId,
      workId: input.workId,
      projectId: input.projectId,
      authorId: userId,
      authorType: 'teacher',
      visibility: input.visibility ?? 'student',
      content,
      actionItems: (input.actionItems ?? []).slice(0, 20).map((item) => ({
        id: nanoid(),
        text: cleanString(item.text, 1000),
        status: 'open',
      })),
    });
    return feedback.toObject();
  }

  async function createAiFeedback(
    userId: string,
    courseId: string,
    input: CreateCourseAiFeedbackInput,
  ) {
    const access = await resolveAccess(userId, courseId);
    const studentId = access.isTeacher ? input.studentId : userId;
    if (!studentId) {
      throw new CourseServiceError(400, 'Student is required');
    }
    await requireActiveStudent(courseId, studentId);
    await validateWorkReference(courseId, input.workId, studentId);
    await validateStudentProjectReference(userId, courseId, input.projectId, studentId, access);
    const content = cleanString(input.content, 20000);
    if (!content) {
      throw new CourseServiceError(400, 'Feedback content is required');
    }
    const feedback = await models.CourseFeedback.create({
      courseId,
      studentId,
      workId: input.workId,
      projectId: input.projectId,
      authorType: 'ai',
      visibility: 'student',
      content,
      actionItems: (input.actionItems ?? []).slice(0, 20).map((item) => ({
        id: nanoid(),
        text: cleanString(item.text, 1000),
        status: 'open',
      })),
    });
    return feedback.toObject();
  }

  async function listFeedback(userId: string, courseId: string, studentId?: string) {
    const access = await resolveAccess(userId, courseId);
    const filter = access.isTeacher
      ? { courseId, ...(studentId ? { studentId } : {}) }
      : { courseId, studentId: userId, visibility: 'student' };
    return await models.CourseFeedback.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }

  async function updateFeedback(
    userId: string,
    courseId: string,
    feedbackId: string,
    input: UpdateCourseFeedbackInput,
  ): Promise<ICourseFeedback> {
    const access = await resolveAccess(userId, courseId);
    if (access.isTeacher) {
      throw new CourseServiceError(403, 'Only the student can update their feedback response');
    }
    requireObjectId(feedbackId, 'Feedback');
    const feedback = await models.CourseFeedback.findOne({
      _id: feedbackId,
      courseId,
      studentId: userId,
      visibility: 'student',
    });
    if (!feedback) {
      throw new CourseServiceError(404, 'Feedback not found');
    }
    if (input.studentResponse !== undefined) {
      feedback.studentResponse = cleanString(input.studentResponse, 10000);
    }
    if (input.connectedRevisionId !== undefined) {
      if (input.connectedRevisionId) {
        await validateWorkReference(courseId, input.connectedRevisionId, userId);
        feedback.connectedRevisionId = input.connectedRevisionId;
      } else {
        feedback.connectedRevisionId = undefined;
      }
    }
    if (input.actionItemId !== undefined || input.actionStatus !== undefined) {
      if (!input.actionItemId || !input.actionStatus) {
        throw new CourseServiceError(400, 'Action item ID and status are both required');
      }
      if (!['open', 'addressed'].includes(input.actionStatus)) {
        throw new CourseServiceError(400, 'Invalid action-item status');
      }
      const actionItem = feedback.actionItems.find((item) => item.id === input.actionItemId);
      if (!actionItem) {
        throw new CourseServiceError(404, 'Action item not found');
      }
      actionItem.status = input.actionStatus;
      feedback.markModified('actionItems');
    }
    await feedback.save();
    return feedback.toObject() as ICourseFeedback;
  }

  async function createPost(userId: string, courseId: string, input: CreateCoursePostInput) {
    await requireTeacher(userId, courseId);
    const post = await models.CoursePost.create(
      await prepareCoursePost(userId, courseId, input, new Date()),
    );
    return post.toObject();
  }

  async function createPosts(
    userId: string,
    courseId: string,
    inputs: CreateCoursePostInput[],
  ): Promise<ICoursePost[]> {
    await requireTeacher(userId, courseId);
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new CourseServiceError(400, 'At least one course post is required');
    }
    if (inputs.length > MAX_POST_BATCH_SIZE) {
      throw new CourseServiceError(
        400,
        `A maximum of ${MAX_POST_BATCH_SIZE} course posts can be published at once`,
      );
    }
    const publishedAt = new Date();
    const posts = await Promise.all(
      inputs.map((input) => prepareCoursePost(userId, courseId, input, publishedAt)),
    );
    const created = await models.CoursePost.insertMany(posts, { ordered: true });
    return created.map((post) => post.toObject());
  }

  async function listPosts(userId: string, courseId: string) {
    await resolveAccess(userId, courseId);
    return await models.CoursePost.find({ courseId }).sort({ publishedAt: -1 }).limit(100).lean();
  }

  async function updatePost(
    userId: string,
    courseId: string,
    postId: string,
    input: Partial<CreateCoursePostInput>,
  ): Promise<ICoursePost> {
    await requireTeacher(userId, courseId);
    requireObjectId(postId, 'Post');
    const existing = await models.CoursePost.findOne({ _id: postId, courseId }).lean<ICoursePost>();
    if (!existing) {
      throw new CourseServiceError(404, 'Post not found');
    }
    const update: Partial<ICoursePost> = {};
    const unset: Record<string, 1> = {};
    if (input.kind !== undefined) {
      if (!COURSE_POST_KINDS.has(input.kind)) {
        throw new CourseServiceError(400, 'Invalid post kind');
      }
      update.kind = input.kind;
    }
    if (input.title !== undefined) {
      const title = cleanString(input.title, 240);
      if (!title) {
        throw new CourseServiceError(400, 'Title is required');
      }
      update.title = title;
    }
    if (input.body !== undefined) {
      update.body = cleanString(input.body, 20000);
    }
    if (input.fileIds !== undefined) {
      update.fileIds = await ownedFileIds(userId, input.fileIds);
    }
    if (input.links !== undefined) {
      update.links = cleanLinks(input.links);
    }
    if (input.startsAt !== undefined) {
      const startsAt = cleanOptionalDate(input.startsAt);
      if (startsAt) {
        update.startsAt = startsAt;
      } else {
        unset.startsAt = 1;
      }
    }
    if (input.endsAt !== undefined) {
      const endsAt = cleanOptionalDate(input.endsAt);
      if (endsAt) {
        update.endsAt = endsAt;
      } else {
        unset.endsAt = 1;
      }
    }
    if (input.dueAt !== undefined) {
      const dueAt = cleanOptionalDate(input.dueAt);
      if (dueAt) {
        update.dueAt = dueAt;
      } else {
        unset.dueAt = 1;
      }
    }
    const startsAt = input.startsAt !== undefined ? update.startsAt : existing.startsAt;
    const endsAt = input.endsAt !== undefined ? update.endsAt : existing.endsAt;
    if (endsAt && !startsAt) {
      throw new CourseServiceError(400, 'A schedule end time requires a start time');
    }
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new CourseServiceError(400, 'Schedule end time must be after its start time');
    }
    const post = await models.CoursePost.findOneAndUpdate(
      { _id: postId, courseId },
      {
        $set: update,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    ).lean<ICoursePost>();
    if (!post) {
      throw new CourseServiceError(404, 'Post not found');
    }
    return post;
  }

  async function deletePost(userId: string, courseId: string, postId: string): Promise<void> {
    await requireTeacher(userId, courseId);
    requireObjectId(postId, 'Post');
    const result = await models.CoursePost.deleteOne({ _id: postId, courseId });
    if (result.deletedCount === 0) {
      throw new CourseServiceError(404, 'Post not found');
    }
  }

  async function getOverview(userId: string, courseId: string): Promise<CourseOverview> {
    const access = await resolveAccess(userId, courseId);
    const [teams, projects, milestones, posts] = await Promise.all([
      listTeams(userId, courseId),
      models.CourseProject.find({ courseId }).sort({ updatedAt: -1 }).lean<ICourseProject[]>(),
      listMilestones(userId, courseId),
      overviewPosts(courseId),
    ]);
    if (!access.isTeacher) {
      const teamIds = new Set(teams.map((team) => team._id?.toString()));
      return {
        course: access.course,
        membership: access.membership,
        teams,
        projects: projects.filter((project) => teamIds.has(project.teamId)),
        milestones,
        posts,
      };
    }
    const [activeStudents, unreviewedWork, reportDrafts] = await Promise.all([
      models.CourseMember.countDocuments({ courseId, role: 'student', state: 'active' }),
      models.CourseWork.countDocuments({
        courseId,
        deletedAt: { $exists: false },
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      models.CourseReport.countDocuments({ courseId, status: { $ne: 'released' } }),
    ]);
    return {
      course: access.course,
      membership: access.membership,
      teams,
      projects,
      milestones,
      posts,
      attention: { activeStudents, unreviewedWork, reportDrafts },
    };
  }

  function buildReportSections(
    work: ICourseWork[],
    totalMinutes: number,
    feedback: Array<{ content: string; visibility: string; _id?: object }>,
    projects: ICourseProject[],
  ): ICourseReportSection[] {
    const evidenceIds = work.map((item) => item._id?.toString()).filter(Boolean) as string[];
    const papers = work.filter((item) => item.kind === 'paper');
    const presentations = work.filter((item) => item.kind === 'presentation');
    const selected = work.filter((item) => item.portfolioState !== 'none');
    const visibleFeedback = feedback.filter((item) => item.visibility === 'student');
    return [
      {
        key: 'project',
        title: 'Projects and current direction',
        content:
          projects.length > 0
            ? projects
                .map((project) => `${project.title}. ${project.problem ?? ''}`.trim())
                .join('\n\n')
            : 'No project record has been completed yet.',
        evidenceIds,
      },
      {
        key: 'learning',
        title: 'Learning evidence',
        content: `${papers.length} paper record${papers.length === 1 ? '' : 's'}, ${presentations.length} presentation record${presentations.length === 1 ? '' : 's'}, and ${work.length} total work item${work.length === 1 ? '' : 's'} are currently recorded.`,
        evidenceIds,
      },
      {
        key: 'time',
        title: 'Time and work habits',
        content: `${Math.round((totalMinutes / 60) * 10) / 10} student-reported hours are currently recorded.`,
        evidenceIds: [],
      },
      {
        key: 'feedback',
        title: 'Feedback and revision',
        content:
          visibleFeedback.length > 0
            ? visibleFeedback.map((item) => item.content).join('\n\n')
            : 'No released feedback has been recorded yet.',
        evidenceIds: visibleFeedback
          .map((item) => item._id?.toString())
          .filter(Boolean) as string[],
      },
      {
        key: 'portfolio',
        title: 'Portfolio readiness',
        content: `${selected.length} artifact${selected.length === 1 ? ' is' : 's are'} selected for the portfolio.`,
        evidenceIds: selected.map((item) => item._id?.toString()).filter(Boolean) as string[],
      },
      {
        key: 'teacher',
        title: 'Teacher narrative and next steps',
        content: '',
        evidenceIds: [],
      },
    ];
  }

  async function generateReport(
    userId: string,
    courseId: string,
    studentId: string,
    kind: CourseReportKind,
  ) {
    await requireTeacher(userId, courseId);
    const student = await models.CourseMember.exists({
      courseId,
      userId: studentId,
      role: 'student',
      state: 'active',
    });
    if (!student) {
      throw new CourseServiceError(404, 'Student not found');
    }
    const [work, time, feedback, teams, member] = await Promise.all([
      listWork(userId, courseId, { studentId, limit: MAX_LIST_LIMIT }),
      listTime(userId, courseId, studentId, undefined, MAX_LIST_LIMIT),
      listFeedback(userId, courseId, studentId),
      models.CourseTeam.find({ courseId, memberIds: studentId }).lean<ICourseTeam[]>(),
      models.CourseMember.findOne({ courseId, userId: studentId }).lean<ICourseMember>(),
    ]);
    const teamIds = teams.map((team) => team._id?.toString()).filter(Boolean) as string[];
    const projectFilters: Array<
      { createdBy: string } | { teamId: { $in: string[] } } | { collaboratorEmails: string }
    > = [{ createdBy: studentId }];
    if (teamIds.length > 0) {
      projectFilters.push({ teamId: { $in: teamIds } });
    }
    if (member?.normalizedEmail) {
      projectFilters.push({ collaboratorEmails: member.normalizedEmail });
    }
    const projects = await models.CourseProject.find({
      courseId,
      $or: projectFilters,
    }).lean<ICourseProject[]>();
    const latest = await models.CourseReport.findOne({ courseId, studentId, kind })
      .sort({ version: -1 })
      .lean<{ version: number }>();
    const sections = buildReportSections(
      work,
      time.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      feedback,
      projects,
    );
    const report = await models.CourseReport.create({
      courseId,
      studentId,
      kind,
      status: 'draft',
      sections,
      evidenceIds: [...new Set(sections.flatMap((section) => section.evidenceIds))],
      generatedAt: new Date(),
      generatedBy: userId,
      version: (latest?.version ?? 0) + 1,
    });
    return report.toObject();
  }

  async function listReports(userId: string, courseId: string, studentId?: string) {
    const access = await resolveAccess(userId, courseId);
    const filter = access.isTeacher
      ? { courseId, ...(studentId ? { studentId } : {}) }
      : { courseId, studentId: userId, status: 'released' };
    return await models.CourseReport.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  }

  async function updateReport(
    userId: string,
    courseId: string,
    reportId: string,
    sections: ICourseReportSection[],
  ) {
    await requireTeacher(userId, courseId);
    requireObjectId(reportId, 'Report');
    const sanitized = sections.slice(0, 20).map((section) => ({
      key: cleanString(section.key, 80),
      title: cleanString(section.title, 160),
      content: cleanString(section.content, 30000),
      evidenceIds: cleanStrings(section.evidenceIds, 200, 80),
    }));
    const report = await models.CourseReport.findOneAndUpdate(
      { _id: reportId, courseId, status: { $ne: 'released' } },
      {
        $set: {
          sections: sanitized,
          evidenceIds: [...new Set(sanitized.flatMap((section) => section.evidenceIds))],
          status: 'reviewed',
        },
      },
      { new: true },
    ).lean();
    if (!report) {
      throw new CourseServiceError(404, 'Editable report not found');
    }
    return report;
  }

  async function releaseReport(userId: string, courseId: string, reportId: string) {
    await requireTeacher(userId, courseId);
    requireObjectId(reportId, 'Report');
    const report = await models.CourseReport.findOneAndUpdate(
      { _id: reportId, courseId, status: { $ne: 'released' } },
      {
        $set: {
          status: 'released',
          releasedAt: new Date(),
          releasedBy: userId,
        },
      },
      { new: true },
    ).lean();
    if (!report) {
      throw new CourseServiceError(404, 'Report not found');
    }
    return report;
  }

  async function undoAutomaticSave(
    userId: string,
    courseId: string,
    sourceKey: string,
  ): Promise<{ undone: boolean }> {
    await resolveAccess(userId, courseId);
    const now = new Date();
    const [work, time, aiUse] = await Promise.all([
      models.CourseWork.updateOne(
        { courseId, studentId: userId, sourceKey, deletedAt: { $exists: false } },
        { $set: { deletedAt: now } },
      ),
      models.CourseTime.updateOne(
        { courseId, studentId: userId, sourceKey, deletedAt: { $exists: false } },
        { $set: { deletedAt: now } },
      ),
      models.CourseAiUse.updateOne(
        { courseId, studentId: userId, sourceKey, deletedAt: { $exists: false } },
        { $set: { deletedAt: now } },
      ),
    ]);
    return {
      undone: work.modifiedCount > 0 || time.modifiedCount > 0 || aiUse.modifiedCount > 0,
    };
  }

  return {
    listCourses,
    createCourse,
    deleteCourse,
    resolveAccess,
    requireTeacher,
    inviteMembers,
    listMembers,
    removeMember,
    getProfile,
    updateProfile,
    createTeam,
    listTeams,
    updateTeamMembers,
    getOrCreateProject,
    updateProject,
    createProject,
    updateProjectById,
    deleteProject,
    createMilestone,
    listMilestones,
    updateMilestoneStatus,
    createWork,
    listWork,
    updateWork,
    deleteWork,
    getWorkFile,
    getAccessibleFile,
    createTime,
    listTime,
    updateTime,
    deleteTime,
    createAiUse,
    listAiUse,
    updateAiUse,
    deleteAiUse,
    createFeedback,
    createAiFeedback,
    listFeedback,
    updateFeedback,
    createPost,
    createPosts,
    listPosts,
    updatePost,
    deletePost,
    getOverview,
    generateReport,
    listReports,
    updateReport,
    releaseReport,
    undoAutomaticSave,
  };
}

export function courseServiceError(error: Error): { status: number; message: string } {
  if (error instanceof CourseServiceError) {
    return { status: error.status, message: error.message };
  }
  logger.error('[courses] Unhandled service error', error);
  return { status: 500, message: 'Course service error' };
}
