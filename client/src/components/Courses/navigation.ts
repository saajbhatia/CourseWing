export const teacherTabs = [
  'overview',
  'projects',
  'project',
  'students',
  'student',
  'review',
  'reports',
  'course',
] as const;

export type TeacherTab = (typeof teacherTabs)[number];

export const studentTabs = [
  'home',
  'project',
  'portfolio',
  'papers',
  'time',
  'ai-use',
  'feedback',
  'reports',
] as const;

export type StudentTab = (typeof studentTabs)[number];

export function isTeacherTab(value: string | null): value is TeacherTab {
  return value != null && (teacherTabs as readonly string[]).includes(value);
}

export function isStudentTab(value: string | null): value is StudentTab {
  return value != null && (studentTabs as readonly string[]).includes(value);
}
