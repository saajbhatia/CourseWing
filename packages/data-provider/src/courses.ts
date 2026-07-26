import request from './request';
import { apiBaseUrl } from './api-endpoints';

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
export type CoursePortfolioState = 'none' | 'selected' | 'approved';
export type CoursePostKind = 'announcement' | 'resource' | 'deadline' | 'schedule';
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
export type CourseJsonValue =
  | string
  | number
  | boolean
  | null
  | CourseJsonValue[]
  | { [key: string]: CourseJsonValue };
export type CourseWorkMetadata = Record<string, CourseJsonValue>;

export type CourseLink = {
  label?: string;
  url: string;
};

export type NativeCourse = {
  _id: string;
  name: string;
  description?: string;
  createdBy: string;
  status: 'active' | 'archived';
  origin: 'native';
  createdAt: string;
  updatedAt: string;
};

export type CourseMembership = {
  _id: string;
  courseId: string;
  userId?: string;
  email: string;
  normalizedEmail: string;
  role: CourseRole;
  state: CourseMemberState;
  joinedAt?: string;
  preferredName?: string;
  interests?: string[];
  bio?: string;
  website?: string;
  github?: string;
};

export type CourseMemberInvitationResult = {
  email: string;
  status: 'active' | 'pending' | 'error';
  member?: CourseMembership;
  registration?: {
    token: string;
    url: string;
    expiresAt: string;
  };
  error?: string;
};

export type CourseShareLink = {
  token: string;
  url: string;
  expiresAt: string;
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

export type CourseAccess = {
  course: NativeCourse;
  membership: CourseMembership;
  isTeacher: boolean;
};

export type CourseTeam = {
  _id: string;
  courseId: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdBy: string;
};

export type CourseProject = {
  _id: string;
  courseId: string;
  teamId: string;
  title: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: {
    capability?: string;
    dataInput?: string;
    output?: string;
    evaluation?: string;
    safeguards?: string;
  };
  risks: string[];
  links: CourseLink[];
  collaboratorEmails: string[];
  createdBy?: string;
};

export type CreateCourseProjectInput = {
  title: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: CourseProject['technicalRoute'];
  risks?: string[];
  links?: CourseLink[];
  collaboratorEmails?: string[];
};

export type UpdateCourseProjectInput = Partial<CreateCourseProjectInput>;

export type CourseMilestone = {
  _id: string;
  courseId: string;
  projectId?: string;
  studentId?: string;
  title: string;
  description?: string;
  status: CourseMilestoneStatus;
  updatedAt: string;
};

export type CourseWork = {
  _id: string;
  courseId: string;
  studentId: string;
  teamId?: string;
  projectId?: string;
  milestoneId?: string;
  kind: CourseWorkKind;
  title: string;
  description?: string;
  fileIds: string[];
  links: CourseLink[];
  source: 'student' | 'ai' | 'teacher';
  sourceKey?: string;
  versionOf?: string;
  portfolioState: CoursePortfolioState;
  aiSummary?: string;
  reflection?: string;
  metadata: CourseWorkMetadata;
  createdAt: string;
  updatedAt: string;
};

export type CourseTime = {
  _id: string;
  courseId: string;
  studentId: string;
  projectId?: string;
  milestoneId?: string;
  workId?: string;
  date: string;
  minutes: number;
  category: CourseTimeCategory;
  customCategory?: string;
  description: string;
  outcome?: string;
  evidenceUrl?: string;
  reflection?: string;
};

export type CourseAiUse = {
  _id: string;
  courseId: string;
  studentId: string;
  projectId?: string;
  date: string;
  tool: string;
  task: string;
  output: string;
  evidenceUrl?: string;
  reviewed: boolean;
  safetyNotes?: string;
  learning: string;
  createdAt: string;
  updatedAt: string;
};

export type CourseFeedback = {
  _id: string;
  courseId: string;
  studentId: string;
  workId?: string;
  projectId?: string;
  authorId?: string;
  authorType: 'ai' | 'teacher';
  visibility: 'student' | 'teacher';
  content: string;
  actionItems: Array<{ id: string; text: string; status: 'open' | 'addressed' }>;
  studentResponse?: string;
  connectedRevisionId?: string;
  createdAt: string;
};

export type CoursePost = {
  _id: string;
  courseId: string;
  kind: CoursePostKind;
  title: string;
  body?: string;
  fileIds: string[];
  links: CourseLink[];
  publishedAt: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
};

export type CreateCoursePostInput = {
  kind: CoursePost['kind'];
  title: string;
  body?: string;
  fileIds?: string[];
  links?: CourseLink[];
  startsAt?: string | null;
  endsAt?: string | null;
  dueAt?: string | null;
};

export type CourseReportSection = {
  key: string;
  title: string;
  content: string;
  evidenceIds: string[];
};

export type CourseReport = {
  _id: string;
  courseId: string;
  studentId: string;
  kind: 'progress' | 'final';
  status: 'draft' | 'reviewed' | 'released';
  sections: CourseReportSection[];
  evidenceIds: string[];
  version: number;
  releasedAt?: string;
  updatedAt: string;
};

export type CourseOverview = {
  course: NativeCourse;
  membership: CourseMembership;
  teams: CourseTeam[];
  projects: CourseProject[];
  milestones: CourseMilestone[];
  posts: CoursePost[];
  attention?: {
    unreviewedWork: number;
    activeStudents: number;
    reportDrafts: number;
  };
};

const root = () => `${apiBaseUrl()}/api/courses`;
const courseRoot = (courseId: string) => `${root()}/${encodeURIComponent(courseId)}`;

export const getCourses = (): Promise<CourseAccess[]> => request.get(root());

export const createCourse = (input: {
  name: string;
  description?: string;
}): Promise<CourseAccess> => request.post(root(), input);

export const deleteCourse = (courseId: string): Promise<{ deleted: boolean }> =>
  request.delete(courseRoot(courseId));

export const getCourseOverview = (courseId: string): Promise<CourseOverview> =>
  request.get(`${courseRoot(courseId)}/overview`);

export const getCourseMembers = (courseId: string): Promise<CourseMembership[]> =>
  request.get(`${courseRoot(courseId)}/members`);

export const deleteCourseMember = (
  courseId: string,
  memberId: string,
): Promise<{ deleted: boolean }> =>
  request.delete(`${courseRoot(courseId)}/members/${encodeURIComponent(memberId)}`);

export const inviteCourseMembers = (
  courseId: string,
  emails: string[],
): Promise<CourseMemberInvitationResult[]> =>
  request.post(`${courseRoot(courseId)}/members`, { emails });

export const createCourseShareLink = (courseId: string): Promise<CourseShareLink> =>
  request.post(`${courseRoot(courseId)}/share-link`);

export const joinCourseFromInvitation = (
  token: string,
): Promise<{ joined: true; courseId: string }> => request.post(`${root()}/join`, { token });

export const getCourseProfile = (courseId: string): Promise<CourseProfile> =>
  request.get(`${courseRoot(courseId)}/profile`);

export const updateCourseProfile = (
  courseId: string,
  input: UpdateCourseProfileInput,
): Promise<CourseProfile> => request.patch(`${courseRoot(courseId)}/profile`, input);

export const getCourseTeams = (courseId: string): Promise<CourseTeam[]> =>
  request.get(`${courseRoot(courseId)}/teams`);

export const createCourseTeam = (
  courseId: string,
  input: { name: string; description?: string; memberIds?: string[] },
): Promise<CourseTeam> => request.post(`${courseRoot(courseId)}/teams`, input);

export const updateCourseTeamMembers = (
  courseId: string,
  teamId: string,
  memberIds: string[],
): Promise<CourseTeam> =>
  request.patch(`${courseRoot(courseId)}/teams/${encodeURIComponent(teamId)}/members`, {
    memberIds,
  });

export const getCourseProject = (courseId: string, teamId: string): Promise<CourseProject> =>
  request.get(`${courseRoot(courseId)}/teams/${encodeURIComponent(teamId)}/project`);

export const updateCourseProject = (
  courseId: string,
  teamId: string,
  input: UpdateCourseProjectInput,
): Promise<CourseProject> =>
  request.patch(`${courseRoot(courseId)}/teams/${encodeURIComponent(teamId)}/project`, input);

export const createCourseProject = (
  courseId: string,
  input: CreateCourseProjectInput,
): Promise<CourseProject> => request.post(`${courseRoot(courseId)}/projects`, input);

export const updateCourseProjectById = (
  courseId: string,
  projectId: string,
  input: UpdateCourseProjectInput,
): Promise<CourseProject> =>
  request.patch(`${courseRoot(courseId)}/projects/${encodeURIComponent(projectId)}`, input);

export const deleteCourseProject = (courseId: string, projectId: string): Promise<void> =>
  request.delete(`${courseRoot(courseId)}/projects/${encodeURIComponent(projectId)}`);

export const getCourseMilestones = (courseId: string): Promise<CourseMilestone[]> =>
  request.get(`${courseRoot(courseId)}/milestones`);

export const createCourseMilestone = (
  courseId: string,
  input: {
    title: string;
    description?: string;
    projectId?: string;
    studentId?: string;
    status?: CourseMilestoneStatus;
  },
): Promise<CourseMilestone> => request.post(`${courseRoot(courseId)}/milestones`, input);

export const updateCourseMilestone = (
  courseId: string,
  milestoneId: string,
  status: CourseMilestoneStatus,
): Promise<CourseMilestone> =>
  request.patch(`${courseRoot(courseId)}/milestones/${encodeURIComponent(milestoneId)}`, {
    status,
  });

export const getCourseWork = (
  courseId: string,
  params: { studentId?: string; projectId?: string; kind?: CourseWorkKind; limit?: number } = {},
): Promise<CourseWork[]> => {
  const query = new URLSearchParams();
  if (params.studentId) {
    query.set('studentId', params.studentId);
  }
  if (params.projectId) {
    query.set('projectId', params.projectId);
  }
  if (params.kind) {
    query.set('kind', params.kind);
  }
  if (params.limit) {
    query.set('limit', String(params.limit));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request.get(`${courseRoot(courseId)}/work${suffix}`);
};

export const extractCourseFileText = (
  courseId: string,
  fileId: string,
): Promise<{
  fileId: string;
  filename: string;
  extracted: boolean;
  characters: number;
}> => request.post(`${courseRoot(courseId)}/files/${encodeURIComponent(fileId)}/extract`);

export const createCourseWork = (
  courseId: string,
  input: {
    studentId?: string;
    teamId?: string;
    projectId?: string;
    milestoneId?: string;
    kind?: CourseWorkKind;
    title: string;
    description?: string;
    fileIds?: string[];
    links?: CourseLink[];
    versionOf?: string;
    portfolioState?: CoursePortfolioState;
    reflection?: string;
    metadata?: CourseWorkMetadata;
  },
): Promise<CourseWork> => request.post(`${courseRoot(courseId)}/work`, input);

export const updateCourseWork = (
  courseId: string,
  workId: string,
  input: Partial<
    Pick<
      CourseWork,
      | 'kind'
      | 'title'
      | 'description'
      | 'fileIds'
      | 'links'
      | 'reflection'
      | 'metadata'
      | 'portfolioState'
      | 'milestoneId'
      | 'projectId'
    >
  >,
): Promise<CourseWork> =>
  request.patch(`${courseRoot(courseId)}/work/${encodeURIComponent(workId)}`, input);

export const deleteCourseWork = (courseId: string, workId: string): Promise<void> =>
  request.delete(`${courseRoot(courseId)}/work/${encodeURIComponent(workId)}`);

export const getCourseTime = (
  courseId: string,
  studentId?: string,
  projectId?: string,
): Promise<CourseTime[]> => {
  const query = new URLSearchParams();
  if (studentId) {
    query.set('studentId', studentId);
  }
  if (projectId) {
    query.set('projectId', projectId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request.get(`${courseRoot(courseId)}/time${suffix}`);
};

export const createCourseTime = (
  courseId: string,
  input: {
    studentId?: string;
    projectId?: string;
    milestoneId?: string;
    workId?: string;
    date?: string;
    minutes: number;
    category?: CourseTime['category'];
    customCategory?: string;
    description: string;
    outcome?: string;
    evidenceUrl?: string;
    reflection?: string;
  },
): Promise<CourseTime> => request.post(`${courseRoot(courseId)}/time`, input);

export type UpdateCourseTimeInput = Partial<
  Pick<
    CourseTime,
    | 'projectId'
    | 'milestoneId'
    | 'workId'
    | 'date'
    | 'minutes'
    | 'category'
    | 'customCategory'
    | 'description'
    | 'outcome'
    | 'evidenceUrl'
    | 'reflection'
  >
>;

export const updateCourseTime = (
  courseId: string,
  timeId: string,
  input: UpdateCourseTimeInput,
): Promise<CourseTime> =>
  request.patch(`${courseRoot(courseId)}/time/${encodeURIComponent(timeId)}`, input);

export const deleteCourseTime = (courseId: string, timeId: string): Promise<void> =>
  request.delete(`${courseRoot(courseId)}/time/${encodeURIComponent(timeId)}`);

export const getCourseAiUse = (
  courseId: string,
  studentId?: string,
  projectId?: string,
): Promise<CourseAiUse[]> => {
  const query = new URLSearchParams();
  if (studentId) {
    query.set('studentId', studentId);
  }
  if (projectId) {
    query.set('projectId', projectId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request.get(`${courseRoot(courseId)}/ai-use${suffix}`);
};

export type CreateCourseAiUseInput = {
  studentId?: string;
  projectId?: string;
  date?: string;
  tool: string;
  task: string;
  output: string;
  evidenceUrl?: string;
  reviewed?: boolean;
  safetyNotes?: string;
  learning: string;
};

export const createCourseAiUse = (
  courseId: string,
  input: CreateCourseAiUseInput,
): Promise<CourseAiUse> => request.post(`${courseRoot(courseId)}/ai-use`, input);

export type UpdateCourseAiUseInput = Partial<
  Pick<
    CourseAiUse,
    | 'projectId'
    | 'date'
    | 'tool'
    | 'task'
    | 'output'
    | 'evidenceUrl'
    | 'reviewed'
    | 'safetyNotes'
    | 'learning'
  >
>;

export const updateCourseAiUse = (
  courseId: string,
  aiUseId: string,
  input: UpdateCourseAiUseInput,
): Promise<CourseAiUse> =>
  request.patch(`${courseRoot(courseId)}/ai-use/${encodeURIComponent(aiUseId)}`, input);

export const deleteCourseAiUse = (courseId: string, aiUseId: string): Promise<void> =>
  request.delete(`${courseRoot(courseId)}/ai-use/${encodeURIComponent(aiUseId)}`);

export const getCourseFeedback = (
  courseId: string,
  studentId?: string,
): Promise<CourseFeedback[]> =>
  request.get(
    `${courseRoot(courseId)}/feedback${
      studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
    }`,
  );

export const createCourseFeedback = (
  courseId: string,
  input: {
    studentId: string;
    workId?: string;
    projectId?: string;
    visibility?: CourseFeedback['visibility'];
    content: string;
    actionItems?: Array<{ text: string }>;
  },
): Promise<CourseFeedback> => request.post(`${courseRoot(courseId)}/feedback`, input);

export type UpdateCourseFeedbackInput = {
  actionItemId?: string;
  actionStatus?: 'open' | 'addressed';
  studentResponse?: string;
  connectedRevisionId?: string;
};

export const updateCourseFeedback = (
  courseId: string,
  feedbackId: string,
  input: UpdateCourseFeedbackInput,
): Promise<CourseFeedback> =>
  request.patch(`${courseRoot(courseId)}/feedback/${encodeURIComponent(feedbackId)}`, input);

export const createCoursePost = (
  courseId: string,
  input: CreateCoursePostInput,
): Promise<CoursePost> => request.post(`${courseRoot(courseId)}/posts`, input);

export const createCoursePostsBatch = (
  courseId: string,
  posts: CreateCoursePostInput[],
): Promise<CoursePost[]> => request.post(`${courseRoot(courseId)}/posts/batch`, { posts });

export const updateCoursePost = (
  courseId: string,
  postId: string,
  input: Partial<{
    kind: CoursePost['kind'];
    title: string;
    body: string;
    fileIds: string[];
    links: CourseLink[];
    startsAt: string | null;
    endsAt: string | null;
    dueAt: string | null;
  }>,
): Promise<CoursePost> =>
  request.patch(`${courseRoot(courseId)}/posts/${encodeURIComponent(postId)}`, input);

export const deleteCoursePost = (courseId: string, postId: string): Promise<{ deleted: boolean }> =>
  request.delete(`${courseRoot(courseId)}/posts/${encodeURIComponent(postId)}`);

export const getCourseReports = (courseId: string, studentId?: string): Promise<CourseReport[]> =>
  request.get(
    `${courseRoot(courseId)}/reports${
      studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
    }`,
  );

export const generateCourseReport = (
  courseId: string,
  studentId: string,
  kind: CourseReport['kind'],
): Promise<CourseReport> =>
  request.post(`${courseRoot(courseId)}/reports/${encodeURIComponent(studentId)}/generate`, {
    kind,
  });

export const updateCourseReport = (
  courseId: string,
  reportId: string,
  sections: CourseReportSection[],
): Promise<CourseReport> =>
  request.patch(`${courseRoot(courseId)}/reports/${encodeURIComponent(reportId)}`, { sections });

export const releaseCourseReport = (courseId: string, reportId: string): Promise<CourseReport> =>
  request.post(`${courseRoot(courseId)}/reports/${encodeURIComponent(reportId)}/release`);

export const undoCourseAutomaticSave = (
  courseId: string,
  sourceKey: string,
): Promise<{ undone: boolean }> => request.post(`${courseRoot(courseId)}/undo`, { sourceKey });
