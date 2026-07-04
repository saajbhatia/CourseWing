export type LearnLinkCourseRef = {
  canvasCourseId: number;
  name: string;
};

export type LearnLinkAssignmentLink = {
  title: string;
  type: 'file' | 'external' | 'link';
  canvasFileId?: number;
  url?: string;
};

export type LearnLinkAssignment = {
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
  links?: LearnLinkAssignmentLink[];
  courseName?: string | null;
};

export type LearnLinkGradeSummary = {
  currentScore: number | null;
  currentGrade: string | null;
  weightedGrading: boolean;
  groupWeights: Array<{ name: string; weightPercent: number | null }> | null;
};

export type LearnLinkAssignmentsResponse = {
  course?: LearnLinkCourseRef;
  courses?: Array<LearnLinkCourseRef & { currentScore?: number | null }>;
  gradeSummary?: LearnLinkGradeSummary;
  totalMatching?: number;
  returned?: number;
  truncated?: boolean;
  assignments: LearnLinkAssignment[];
};

export type LearnLinkModuleItem = {
  title: string;
  type: string | null;
  canvasFileId?: number;
};

export type LearnLinkModule = {
  name: string;
  position: number | null;
  items: LearnLinkModuleItem[];
};

export type LearnLinkModulesResponse = {
  course: LearnLinkCourseRef;
  syllabus: string | null;
  modules: LearnLinkModule[];
};

export type LearnLinkAnnouncementPreview = {
  title: string;
  author: string | null;
  postedAt: string | null;
  preview: string | null;
};

export type LearnLinkCourseContext = {
  course: LearnLinkCourseRef & {
    courseCode: string | null;
    termName: string | null;
  };
  hasSyllabus: boolean;
  upcomingAssignments: LearnLinkAssignment[];
  recentAnnouncements: LearnLinkAnnouncementPreview[];
  materialCounts: {
    modules: number;
    files: number;
    pages: number;
    readableMaterials: number;
  };
  lastSyncAt: string | null;
};

export type LearnLinkMaterialKind = 'file' | 'page' | 'syllabus';

export type LearnLinkSearchHit = {
  materialId: string;
  kind: LearnLinkMaterialKind;
  title: string;
  courseId: string;
  chunkIndex: number;
  snippet: string;
};

export type LearnLinkSearchResponse = {
  query: string;
  hits: LearnLinkSearchHit[];
};

export type LearnLinkMaterialTextResponse = {
  materialId: string;
  kind: LearnLinkMaterialKind;
  title: string;
  status: 'ok' | 'skipped' | 'error';
  error?: string | null;
  charCount?: number;
  page?: number;
  totalPages?: number;
  canvasUrl?: string;
  links?: LearnLinkAssignmentLink[];
  text: string | null;
};

export type LearnLinkAssignmentFilter = 'upcoming' | 'past' | 'undated' | 'all';
