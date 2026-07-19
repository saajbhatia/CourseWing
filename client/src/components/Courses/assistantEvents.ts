export const NATIVE_COURSE_DATA_CHANGED_EVENT = 'native-course:data-changed';

const nativeCourseMutationTools = new Set([
  'native_course_update_profile',
  'native_course_create_project',
  'native_course_update_project',
  'native_course_delete_project',
  'native_course_record_work',
  'native_course_update_work',
  'native_course_delete_work',
  'native_course_log_time',
  'native_course_update_time',
  'native_course_delete_time',
  'native_course_record_ai_use',
  'native_course_update_ai_use',
  'native_course_delete_ai_use',
  'native_course_update_feedback',
  'native_course_save_ai_review',
  'native_course_teacher_publish_posts',
  'native_course_teacher_update_post',
  'native_course_teacher_delete_post',
  'native_course_teacher_create_feedback',
  'native_course_teacher_generate_report',
  'native_course_teacher_update_report',
  'native_course_teacher_release_report',
  'native_course_undo',
]);

export function isNativeCourseMutationTool(name: string): boolean {
  return nativeCourseMutationTools.has(name);
}

export type NativeCourseToolResult = 'pending' | 'success' | 'failure' | 'invalid';

export function getNativeCourseToolResult(output?: string | null): NativeCourseToolResult {
  if (!output?.trim()) {
    return 'pending';
  }
  try {
    const parsed = JSON.parse(output) as { ok?: unknown };
    if (parsed && typeof parsed === 'object' && parsed.ok === true) {
      return 'success';
    }
    if (parsed && typeof parsed === 'object' && parsed.ok === false) {
      return 'failure';
    }
  } catch {
    // Native course tools always return JSON receipts.
  }
  return 'invalid';
}

export function isNativeCourseDataChangedMessage(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === NATIVE_COURSE_DATA_CHANGED_EVENT
  );
}
