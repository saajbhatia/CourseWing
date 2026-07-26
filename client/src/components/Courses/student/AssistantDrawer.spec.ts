import { buildCourseChatUrl } from './AssistantDrawer';
import { consumeCourseChatHandoff } from '~/components/CourseWing/utils';
import {
  NATIVE_COURSE_DATA_CHANGED_EVENT,
  getNativeCourseToolResult,
  isNativeCourseDataChangedMessage,
  isNativeCourseMutationTool,
} from '../assistantEvents';

describe('buildCourseChatUrl', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 18, 12));
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pins the tool-capable model while keeping private IDs out of the visible prompt', () => {
    const url = new URL(
      buildCourseChatUrl({
        courseId: 'course-123',
        courseName: 'INNOVARES',
        projectId: 'project-456',
        projectName: 'Evidence Assistant',
        context: 'Research',
        request: '  Create a paper record  ',
        privateContext: 'Use file ID private-file-789.',
      }),
      'http://localhost',
    );

    expect(url.pathname).toBe('/c/new');
    expect(url.searchParams.get('endpoint')).toBe('bedrock');
    expect(url.searchParams.get('model')).toBe('us.anthropic.claude-sonnet-4-6');
    expect(url.searchParams.get('agent_id')).toBeNull();
    expect(url.searchParams.get('embed')).toBe('course');
    expect(url.searchParams.get('submit')).toBeNull();
    expect(url.searchParams.get('q')).toBeNull();

    const handoff = consumeCourseChatHandoff(url.searchParams.get('coursewing'));
    expect(handoff?.prompt).toBe('Create a paper record');
    expect(handoff?.prompt).not.toContain('course-123');
    expect(handoff?.prompt).not.toContain('project-456');
    expect(handoff?.promptPrefix).toContain('Verified internal course ID: course-123.');
    expect(handoff?.promptPrefix).toContain('Verified internal project ID: project-456.');
    expect(handoff?.promptPrefix).toContain('Current project: "Evidence Assistant".');
    expect(handoff?.promptPrefix).toContain(`The student's current local date is 2026-07-18.`);
    expect(handoff?.promptPrefix).toContain('Use file ID private-file-789.');
    expect(handoff?.promptPrefix).toContain('never print them in a student-facing response');
  });

  it('omits project scope when the student opens course-level AI', () => {
    const url = new URL(
      buildCourseChatUrl({
        courseId: 'course-123',
        courseName: 'INNOVARES',
        context: 'Course Home',
        request: 'Summarize today',
      }),
      'http://localhost',
    );

    const handoff = consumeCourseChatHandoff(url.searchParams.get('coursewing'));
    expect(handoff?.prompt).toBe('Summarize today');
    expect(handoff?.promptPrefix).not.toContain('internal project ID');
  });

  it('tells the teacher assistant how to preserve local schedule times', () => {
    const url = new URL(
      buildCourseChatUrl({
        courseId: 'course-123',
        courseName: 'INNOVARES',
        context: 'Course',
        request: 'Schedule studio at 9 AM',
        role: 'teacher',
      }),
      'http://localhost',
    );

    const handoff = consumeCourseChatHandoff(url.searchParams.get('coursewing'));
    expect(handoff?.promptPrefix).toContain(`The teacher's current local date is 2026-07-18.`);
    expect(handoff?.promptPrefix).toContain(`The authenticated user's IANA timezone is`);
    expect(handoff?.promptPrefix).toContain('Never default an unspecified local time to UTC or Z.');
    expect(handoff?.promptPrefix).toContain(
      'use the analytics returned by native_course_teacher_get_context as authoritative',
    );
  });
});

describe('native course assistant events', () => {
  it('recognizes mutation tools and the data-changed event without carrying record IDs', () => {
    expect(isNativeCourseMutationTool('native_course_log_time')).toBe(true);
    expect(isNativeCourseMutationTool('native_course_update_time')).toBe(true);
    expect(isNativeCourseMutationTool('native_course_record_ai_use')).toBe(true);
    expect(isNativeCourseMutationTool('native_course_update_ai_use')).toBe(true);
    expect(isNativeCourseMutationTool('native_course_delete_ai_use')).toBe(true);
    expect(isNativeCourseMutationTool('native_course_get_context')).toBe(false);
    expect(getNativeCourseToolResult('{"ok":true}')).toBe('success');
    expect(getNativeCourseToolResult('{"ok":false}')).toBe('failure');
    expect(getNativeCourseToolResult('not json')).toBe('invalid');
    expect(getNativeCourseToolResult(null)).toBe('pending');
    expect(isNativeCourseDataChangedMessage({ type: NATIVE_COURSE_DATA_CHANGED_EVENT })).toBe(true);
    expect(isNativeCourseDataChangedMessage({ type: 'other-event' })).toBe(false);
  });
});
