export type LearnLightCourseRef = {
  canvasCourseId: number;
  name: string;
};

export type LearnLightAssignmentLink = {
  title: string;
  type: 'file' | 'external' | 'link';
  canvasFileId?: number;
  url?: string;
};

export type LearnLightRubricLine = {
  criterion: string;
  pointsPossible: number;
  countsTowardScore: boolean;
  earnedPoints?: number | null;
  earnedRating?: string;
  teacherComment?: string;
  ratingScale?: Array<{ label: string; points: number; detail?: string }>;
};

export type LearnLightTeacherComment = {
  author: string | null;
  comment: string;
  at: string | null;
};

export type LearnLightSubmissionAttachment = {
  filename: string;
  contentType: string | null;
  size: number | null;
  materialId: string;
};

/** The student's own submitted work (text-entry body, submitted URL, uploaded files). */
export type LearnLightSubmission = {
  type: string | null;
  attempt: number | null;
  submittedAt: string | null;
  submittedUrl?: string;
  body?: string;
  bodyMaterialId?: string;
  attachments?: LearnLightSubmissionAttachment[];
};

export type LearnLightAssignment = {
  canvasAssignmentId: number;
  courseId: string;
  name: string;
  dueAt: string | null;
  pointsPossible: number | null;
  submissionStatus: string | null;
  score: number | null;
  grade: string | null;
  htmlUrl: string | null;
  assignmentGroup?: string;
  description?: string;
  links?: LearnLightAssignmentLink[];
  rubric?: LearnLightRubricLine[];
  teacherComments?: LearnLightTeacherComment[];
  submission?: LearnLightSubmission;
  courseName?: string | null;
};

export type LearnLightGradeSummary = {
  currentScore: number | null;
  currentGrade: string | null;
  weightedGrading: boolean;
  groupWeights: Array<{ name: string; weightPercent: number | null }> | null;
};

export type LearnLightAssignmentsResponse = {
  course?: LearnLightCourseRef;
  courses?: Array<LearnLightCourseRef & { currentScore?: number | null }>;
  gradeSummary?: LearnLightGradeSummary;
  totalMatching?: number;
  returned?: number;
  truncated?: boolean;
  assignments: LearnLightAssignment[];
};

export type LearnLightModuleItem = {
  title: string;
  type: string | null;
  canvasFileId?: number;
};

export type LearnLightModule = {
  name: string;
  position: number | null;
  items: LearnLightModuleItem[];
};

export type LearnLightModulesResponse = {
  course: LearnLightCourseRef;
  syllabus: string | null;
  modules: LearnLightModule[];
};

export type LearnLightAnnouncementPreview = {
  title: string;
  author: string | null;
  postedAt: string | null;
  preview: string | null;
};

export type LearnLightCourseContext = {
  course: LearnLightCourseRef & {
    courseCode: string | null;
    termName: string | null;
  };
  hasSyllabus: boolean;
  upcomingAssignments: LearnLightAssignment[];
  recentAnnouncements: LearnLightAnnouncementPreview[];
  materialCounts: {
    modules: number;
    files: number;
    pages: number;
    readableMaterials: number;
  };
  masteryOutcomeCount?: number;
  lastSyncAt: string | null;
  recentGradedWork?: LearnLightAssignment[];
  gradeSummary?: LearnLightGradeSummary;
  moduleNames?: string[];
};

export type LearnLightOutcome = {
  outcome: string;
  displayName: string | null;
  score: number | null;
  masteryPoints: number | null;
  pointsPossible: number | null;
  mastered: boolean | null;
  rating: string | null;
  ratingScale: string[] | null;
  timesAssessed: number | null;
  lastAssessed: { item: string; at: string | null } | null;
  calculationMethod: string | null;
  calculationWeight?: number;
};

export type LearnLightCourseMastery = {
  course: LearnLightCourseRef;
  outcomes: LearnLightOutcome[];
  note?: string;
};

export type LearnLightMasteryResponse =
  | LearnLightCourseMastery
  | { courses: LearnLightCourseMastery[]; note?: string };

export type LearnLightMaterialKind = 'file' | 'page' | 'syllabus' | 'submission';

export type LearnLightSearchHit = {
  materialId: string;
  kind: LearnLightMaterialKind;
  title: string;
  courseId: string;
  chunkIndex: number;
  snippet: string;
};

export type LearnLightSearchResponse = {
  query: string;
  hits: LearnLightSearchHit[];
};

export type LearnLightMaterialTextResponse = {
  materialId: string;
  kind: LearnLightMaterialKind;
  title: string;
  status: 'ok' | 'skipped' | 'error';
  error?: string | null;
  charCount?: number;
  page?: number;
  totalPages?: number;
  canvasUrl?: string;
  links?: LearnLightAssignmentLink[];
  text: string | null;
};

export type LearnLightAssignmentFilter = 'upcoming' | 'past' | 'undated' | 'all';

export type LearnLightAssignmentDetailResponse = {
  course: LearnLightCourseRef;
  assignment: LearnLightAssignment;
};

export type LearnLightTenantStatus = {
  tenantId: string;
  userName?: string | null;
  baseUrl?: string;
  lastSyncAt: string | null;
  syncing: boolean;
  courseCount: number;
};

export type LearnLightFeedbackResponse = {
  feedback?: { id: number; chatShared: boolean };
  updated?: number;
};
