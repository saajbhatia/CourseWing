export type CourseWingCourseRef = {
  canvasCourseId: number;
  name: string;
};

export type CourseWingAssignmentLink = {
  title: string;
  type: 'file' | 'external' | 'link';
  canvasFileId?: number;
  url?: string;
};

export type CourseWingRubricLine = {
  criterion: string;
  pointsPossible: number;
  countsTowardScore: boolean;
  earnedPoints?: number | null;
  earnedRating?: string;
  teacherComment?: string;
  ratingScale?: Array<{ label: string; points: number; detail?: string }>;
};

export type CourseWingTeacherComment = {
  author: string | null;
  comment: string;
  at: string | null;
};

export type CourseWingSubmissionAttachment = {
  filename: string;
  contentType: string | null;
  size: number | null;
  materialId: string;
};

/** The student's own submitted work (text-entry body, submitted URL, uploaded files). */
export type CourseWingSubmission = {
  type: string | null;
  attempt: number | null;
  submittedAt: string | null;
  submittedUrl?: string;
  body?: string;
  bodyMaterialId?: string;
  attachments?: CourseWingSubmissionAttachment[];
};

export type CourseWingAssignment = {
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
  links?: CourseWingAssignmentLink[];
  rubric?: CourseWingRubricLine[];
  teacherComments?: CourseWingTeacherComment[];
  submission?: CourseWingSubmission;
  courseName?: string | null;
};

export type CourseWingGradeSummary = {
  currentScore: number | null;
  currentGrade: string | null;
  weightedGrading: boolean;
  groupWeights: Array<{ name: string; weightPercent: number | null }> | null;
};

export type CourseWingAssignmentsResponse = {
  course?: CourseWingCourseRef;
  courses?: Array<CourseWingCourseRef & { currentScore?: number | null }>;
  gradeSummary?: CourseWingGradeSummary;
  totalMatching?: number;
  returned?: number;
  truncated?: boolean;
  assignments: CourseWingAssignment[];
};

export type CourseWingModuleItem = {
  title: string;
  type: string | null;
  canvasFileId?: number;
};

export type CourseWingModule = {
  name: string;
  position: number | null;
  items: CourseWingModuleItem[];
};

export type CourseWingModulesResponse = {
  course: CourseWingCourseRef;
  syllabus: string | null;
  modules: CourseWingModule[];
};

export type CourseWingAnnouncementPreview = {
  title: string;
  author: string | null;
  postedAt: string | null;
  preview: string | null;
};

export type CourseWingCourseContext = {
  course: CourseWingCourseRef & {
    courseCode: string | null;
    termName: string | null;
  };
  hasSyllabus: boolean;
  upcomingAssignments: CourseWingAssignment[];
  recentAnnouncements: CourseWingAnnouncementPreview[];
  materialCounts: {
    modules: number;
    files: number;
    pages: number;
    readableMaterials: number;
  };
  masteryOutcomeCount?: number;
  lastSyncAt: string | null;
  recentGradedWork?: CourseWingAssignment[];
  gradeSummary?: CourseWingGradeSummary;
  moduleNames?: string[];
};

export type CourseWingOutcome = {
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

export type CourseWingCourseMastery = {
  course: CourseWingCourseRef;
  outcomes: CourseWingOutcome[];
  note?: string;
};

export type CourseWingMasteryResponse =
  | CourseWingCourseMastery
  | { courses: CourseWingCourseMastery[]; note?: string };

export type CourseWingMaterialKind = 'file' | 'page' | 'syllabus' | 'submission';

export type CourseWingSearchHit = {
  materialId: string;
  kind: CourseWingMaterialKind;
  title: string;
  courseId: string;
  chunkIndex: number;
  snippet: string;
};

export type CourseWingSearchResponse = {
  query: string;
  hits: CourseWingSearchHit[];
};

export type CourseWingMaterialTextResponse = {
  materialId: string;
  kind: CourseWingMaterialKind;
  title: string;
  status: 'ok' | 'skipped' | 'error';
  error?: string | null;
  charCount?: number;
  page?: number;
  totalPages?: number;
  canvasUrl?: string;
  links?: CourseWingAssignmentLink[];
  text: string | null;
};

export type CourseWingAssignmentFilter = 'upcoming' | 'past' | 'graded' | 'undated' | 'all';

export type CourseWingAssignmentDetailResponse = {
  course: CourseWingCourseRef;
  assignment: CourseWingAssignment;
};

export type CourseWingTenantStatus = {
  tenantId: string;
  userName?: string | null;
  baseUrl?: string;
  lastSyncAt: string | null;
  lastSyncError?: string | null;
  frozenNow?: string | null;
  syncing: boolean;
  courseCount: number;
  pendingExtraction?: number;
};

export type CourseWingFeedbackResponse = {
  feedback?: { id: number; chatShared: boolean };
  updated?: number;
};
