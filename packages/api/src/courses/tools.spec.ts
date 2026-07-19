import type { CourseService } from './service';
import { nativeCourseToolDefinitions } from './definitions';
import {
  NATIVE_COURSE_CREATE_PROJECT,
  NATIVE_COURSE_DELETE_AI_USE,
  NATIVE_COURSE_DELETE_PROJECT,
  NATIVE_COURSE_DELETE_TIME,
  NATIVE_COURSE_DELETE_WORK,
  NATIVE_COURSE_GET_CONTEXT,
  NATIVE_COURSE_GET_PROFILE,
  NATIVE_COURSE_READ_FILE,
  NATIVE_COURSE_LOG_TIME,
  NATIVE_COURSE_RECORD_AI_USE,
  NATIVE_COURSE_RECORD_WORK,
  NATIVE_COURSE_SAVE_AI_REVIEW,
  NATIVE_COURSE_TEACHER_CREATE_FEEDBACK,
  NATIVE_COURSE_TEACHER_DELETE_POST,
  NATIVE_COURSE_TEACHER_GENERATE_REPORT,
  NATIVE_COURSE_TEACHER_GET_CONTEXT,
  NATIVE_COURSE_TEACHER_PUBLISH_POSTS,
  NATIVE_COURSE_TEACHER_RELEASE_REPORT,
  NATIVE_COURSE_TEACHER_UPDATE_POST,
  NATIVE_COURSE_TEACHER_UPDATE_REPORT,
  NATIVE_COURSE_UNDO,
  NATIVE_COURSE_UPDATE_FEEDBACK,
  NATIVE_COURSE_UPDATE_AI_USE,
  NATIVE_COURSE_UPDATE_PROFILE,
  NATIVE_COURSE_UPDATE_PROJECT,
  NATIVE_COURSE_UPDATE_TIME,
  NATIVE_COURSE_UPDATE_WORK,
  createNativeCourseTool,
  nativeCourseToolKeys,
} from './tools';

function mockService(): jest.Mocked<CourseService> {
  return {
    listCourses: jest.fn().mockResolvedValue([]),
    resolveAccess: jest.fn().mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'student' },
      isTeacher: false,
    }),
    requireTeacher: jest.fn().mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'teacher' },
      isTeacher: true,
    }),
    inviteMembers: jest.fn().mockResolvedValue([]),
    listMembers: jest.fn().mockResolvedValue([]),
    getProfile: jest.fn().mockResolvedValue({
      preferredName: 'Student',
      interests: [],
      bio: '',
      website: '',
      github: '',
    }),
    updateProfile: jest.fn().mockResolvedValue({ preferredName: 'Saaj' }),
    getAccessibleFile: jest.fn().mockResolvedValue({
      file_id: 'file-paper',
      filename: 'paper.pdf',
      type: 'application/pdf',
      text: 'Extracted paper content',
    }),
    createProject: jest.fn().mockResolvedValue({ _id: 'project-created' }),
    updateProjectById: jest.fn().mockResolvedValue({ _id: 'project-1', title: 'Updated' }),
    deleteProject: jest.fn().mockResolvedValue(undefined),
    createWork: jest.fn().mockResolvedValue({ _id: 'work-created' }),
    listWork: jest.fn().mockResolvedValue([]),
    updateWork: jest.fn().mockResolvedValue({ _id: 'work-1' }),
    deleteWork: jest.fn().mockResolvedValue(undefined),
    createTime: jest.fn().mockResolvedValue({ _id: 'time-created' }),
    listTime: jest.fn().mockResolvedValue([]),
    updateTime: jest.fn().mockResolvedValue({ _id: 'time-1' }),
    deleteTime: jest.fn().mockResolvedValue(undefined),
    createAiUse: jest.fn().mockResolvedValue({ _id: 'ai-use-created' }),
    listAiUse: jest.fn().mockResolvedValue([]),
    updateAiUse: jest.fn().mockResolvedValue({ _id: 'ai-use-1' }),
    deleteAiUse: jest.fn().mockResolvedValue(undefined),
    createFeedback: jest.fn().mockResolvedValue({ _id: 'feedback-teacher' }),
    createAiFeedback: jest.fn().mockResolvedValue({ _id: 'feedback-ai' }),
    listFeedback: jest.fn().mockResolvedValue([]),
    updateFeedback: jest.fn().mockResolvedValue({ _id: 'feedback-1' }),
    createPost: jest.fn().mockResolvedValue({ _id: 'post-created' }),
    createPosts: jest.fn().mockResolvedValue([]),
    updatePost: jest.fn().mockResolvedValue({ _id: 'post-1' }),
    deletePost: jest.fn().mockResolvedValue(undefined),
    listReports: jest.fn().mockResolvedValue([]),
    generateReport: jest.fn().mockResolvedValue({ _id: 'report-created', status: 'draft' }),
    updateReport: jest.fn().mockResolvedValue({ _id: 'report-1', status: 'reviewed' }),
    releaseReport: jest.fn().mockResolvedValue({ _id: 'report-1', status: 'released' }),
    getOverview: jest.fn().mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'student' },
      teams: [],
      projects: [],
      milestones: [],
      posts: [],
    }),
    undoAutomaticSave: jest.fn().mockResolvedValue({ undone: true }),
  } as unknown as jest.Mocked<CourseService>;
}

function options(service: CourseService, overrides: Record<string, unknown> = {}) {
  return {
    service,
    userId: 'student-auth-id',
    userEmail: 'student@example.com',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    ...overrides,
  };
}

async function invoke(
  service: CourseService,
  toolKey: (typeof nativeCourseToolKeys)[number],
  input: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const output = await createNativeCourseTool(toolKey, options(service, overrides)).invoke(input);
  return JSON.parse(String(output)) as Record<string, unknown>;
}

describe('native course chat tools', () => {
  test('registers a unique factory for every native course tool key', () => {
    const service = mockService();
    expect(new Set(nativeCourseToolKeys).size).toBe(nativeCourseToolKeys.length);
    for (const key of nativeCourseToolKeys) {
      expect(createNativeCourseTool(key, options(service)).name).toBe(key);
      expect(nativeCourseToolDefinitions[key]?.name).toBe(key);
    }
  });

  test('records work as the authenticated student with scoped idempotency and request files', async () => {
    const service = mockService();
    service.createWork.mockImplementation(
      async (_userId, courseId, input) =>
        ({
          _id: `work-${courseId}`,
          courseId,
          ...input,
        }) as never,
    );
    const input = {
      courseId: 'course-a',
      projectId: 'project-1',
      title: 'Paper presentation',
      kind: 'presentation',
      links: [{ label: 'Slides', url: 'https://example.com/slides' }],
      metadata: { presentationDate: '2026-07-18', topics: ['vision'] },
      fileIds: ['file-ui-handoff'],
    };
    const overrides = { requestFileIds: ['file-a', 'file-a', 'file-b'] };

    const first = await invoke(service, NATIVE_COURSE_RECORD_WORK, input, overrides);
    const repeated = await invoke(service, NATIVE_COURSE_RECORD_WORK, input, overrides);
    const otherCourse = await invoke(
      service,
      NATIVE_COURSE_RECORD_WORK,
      { ...input, courseId: 'course-b' },
      overrides,
    );

    expect(service.createWork).toHaveBeenNthCalledWith(
      1,
      'student-auth-id',
      'course-a',
      expect.objectContaining({
        projectId: 'project-1',
        title: 'Paper presentation',
        fileIds: ['file-ui-handoff', 'file-a', 'file-b'],
        source: 'ai',
        sourceConversationId: 'conversation-1',
        sourceMessageId: 'message-1',
      }),
    );
    expect(service.createWork.mock.calls[0][2]).not.toHaveProperty('studentId');
    expect(first.sourceKey).toBe(repeated.sourceKey);
    expect(otherCourse.sourceKey).not.toBe(first.sourceKey);
    expect(first).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_RECORD_WORK,
      entityType: 'work',
    });
  });

  test('merges server-known request attachments when updating owned work', async () => {
    const service = mockService();
    service.listWork.mockResolvedValue([{ _id: 'work-1', fileIds: ['file-existing'] }] as never);

    await invoke(
      service,
      NATIVE_COURSE_UPDATE_WORK,
      {
        courseId: 'course-1',
        workId: 'work-1',
        title: 'Revised title',
        metadata: { abstract: 'Updated' },
        fileIds: ['file-ui-handoff'],
      },
      { requestFileIds: ['file-new', 'file-existing'] },
    );

    expect(service.listWork).toHaveBeenCalledWith('student-auth-id', 'course-1', {
      limit: 100,
    });
    expect(service.updateWork).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'work-1',
      expect.objectContaining({
        title: 'Revised title',
        metadata: { abstract: 'Updated' },
        fileIds: ['file-existing', 'file-ui-handoff', 'file-new'],
      }),
    );
  });

  test('loads context only through the authenticated student identity', async () => {
    const service = mockService();
    const context = await invoke(service, NATIVE_COURSE_GET_CONTEXT, {
      courseId: 'course-1',
      projectId: 'project-1',
    });

    expect(service.getProfile).toHaveBeenCalledWith('student-auth-id', 'course-1');
    expect(service.resolveAccess).toHaveBeenCalledWith('student-auth-id', 'course-1');
    expect(service.listWork).toHaveBeenCalledWith('student-auth-id', 'course-1', {
      projectId: 'project-1',
      limit: 100,
    });
    expect(service.listTime).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      undefined,
      'project-1',
      100,
    );
    expect(service.listAiUse).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      undefined,
      'project-1',
      100,
    );
    expect(service.listFeedback).toHaveBeenCalledWith('student-auth-id', 'course-1');
    expect(service.listReports).toHaveBeenCalledWith('student-auth-id', 'course-1');
    expect(context).toMatchObject({ ok: true, role: 'student', aiUse: [], reports: [] });
  });

  test('reads only a server-verified owned file and returns its extracted text', async () => {
    const service = mockService();
    const output = await invoke(service, NATIVE_COURSE_READ_FILE, {
      courseId: 'course-1',
      fileId: 'file-paper',
    });

    expect(service.getAccessibleFile).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'file-paper',
    );
    expect(output).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_READ_FILE,
      fileId: 'file-paper',
      filename: 'paper.pdf',
      text: 'Extracted paper content',
      hasMore: false,
      untrustedContent: true,
    });
  });

  test('paginates long extracted files without exceeding the requested bound', async () => {
    const service = mockService();
    service.getAccessibleFile.mockResolvedValue({
      file_id: 'file-long',
      filename: 'long-paper.pdf',
      type: 'application/pdf',
      text: 'A'.repeat(60_000),
    } as never);

    const output = await invoke(service, NATIVE_COURSE_READ_FILE, {
      courseId: 'course-1',
      fileId: 'file-long',
      offset: 10_000,
      maxCharacters: 5_000,
    });

    expect(String(output.text)).toHaveLength(5_000);
    expect(output).toMatchObject({
      offset: 10_000,
      totalCharacters: 60_000,
      hasMore: true,
      nextOffset: 15_000,
    });
  });

  test('loads teacher course context without dumping unscoped student records', async () => {
    const service = mockService();
    service.resolveAccess.mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'teacher' },
      isTeacher: true,
    } as never);
    service.getOverview.mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'teacher' },
      teams: [],
      projects: [{ _id: 'project-1', title: 'Project' }],
      milestones: [],
      posts: [],
    } as never);

    const context = await invoke(service, NATIVE_COURSE_GET_CONTEXT, {
      courseId: 'course-1',
    });

    expect(context).toMatchObject({
      ok: true,
      role: 'teacher',
      profile: null,
      work: [],
      time: [],
      aiUse: [],
      feedback: [],
    });
    expect(service.getProfile).not.toHaveBeenCalled();
    expect(service.listWork).not.toHaveBeenCalled();
    expect(service.listTime).not.toHaveBeenCalled();
    expect(service.listAiUse).not.toHaveBeenCalled();
    expect(service.listFeedback).not.toHaveBeenCalled();
  });

  test('loads full teacher context with scoped records and calculated analytics', async () => {
    const service = mockService();
    service.listMembers.mockResolvedValue([
      {
        _id: 'member-1',
        userId: 'student-1',
        role: 'student',
        state: 'active',
        email: 'student@example.com',
      },
    ] as never);
    service.getOverview.mockResolvedValue({
      course: { _id: 'course-1', name: 'Course' },
      membership: { role: 'teacher' },
      teams: [{ _id: 'team-1', memberIds: ['student-1'] }],
      projects: [{ _id: 'project-1', title: 'Evidence Assistant' }],
      milestones: [],
      posts: [{ _id: 'post-1', kind: 'announcement', title: 'Welcome' }],
    } as never);
    service.listWork.mockResolvedValue([
      { _id: 'work-paper', kind: 'paper', studentId: 'student-1', projectId: 'project-1' },
      {
        _id: 'work-slides',
        kind: 'presentation',
        studentId: 'student-1',
        projectId: 'project-1',
      },
    ] as never);
    service.listTime.mockResolvedValue([
      { _id: 'time-1', minutes: 90, category: 'reading', studentId: 'student-1' },
      { _id: 'time-2', minutes: 30, category: 'coding', studentId: 'student-1' },
    ] as never);
    service.listAiUse.mockResolvedValue([
      { _id: 'ai-1', reviewed: true, studentId: 'student-1' },
    ] as never);
    service.listFeedback.mockResolvedValue([
      {
        _id: 'feedback-1',
        studentId: 'student-1',
        projectId: 'project-1',
        visibility: 'student',
        actionItems: [{ id: 'action-1', text: 'Revise', status: 'open' }],
      },
      {
        _id: 'feedback-private',
        studentId: 'student-1',
        projectId: 'project-1',
        visibility: 'teacher',
        actionItems: [],
      },
    ] as never);
    service.listReports.mockResolvedValue([
      { _id: 'report-1', studentId: 'student-1', status: 'draft' },
    ] as never);

    const context = await invoke(
      service,
      NATIVE_COURSE_TEACHER_GET_CONTEXT,
      {
        courseId: 'course-1',
        studentId: 'student-1',
        projectId: 'project-1',
      },
      { userId: 'teacher-auth-id', userEmail: 'teacher@example.com' },
    );

    expect(service.requireTeacher).toHaveBeenCalledWith('teacher-auth-id', 'course-1');
    expect(service.listWork).toHaveBeenCalledWith('teacher-auth-id', 'course-1', {
      studentId: 'student-1',
      projectId: 'project-1',
      limit: 100,
    });
    expect(service.listTime).toHaveBeenCalledWith(
      'teacher-auth-id',
      'course-1',
      'student-1',
      'project-1',
      100,
    );
    expect(service.listReports).toHaveBeenCalledWith('teacher-auth-id', 'course-1', 'student-1');
    expect(context).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_GET_CONTEXT,
      role: 'teacher',
      analytics: {
        activeStudents: 1,
        workItems: 2,
        workByKind: { paper: 1, presentation: 1 },
        totalMinutes: 120,
        minutesByCategory: { reading: 90, coding: 30 },
        aiUseRecords: 1,
        reviewedAiUseRecords: 1,
        feedbackRecords: 2,
        studentVisibleFeedback: 1,
        teacherPrivateFeedback: 1,
        openFeedbackActions: 1,
        reports: { draft: 1 },
      },
    });
  });

  test('rejects teacher context before reading student records when the caller is not a teacher', async () => {
    const service = mockService();
    service.requireTeacher.mockRejectedValue(new Error('Teacher access required'));

    const context = await invoke(service, NATIVE_COURSE_TEACHER_GET_CONTEXT, {
      courseId: 'course-1',
    });

    expect(context).toMatchObject({
      ok: false,
      action: NATIVE_COURSE_TEACHER_GET_CONTEXT,
      error: 'Teacher access required',
    });
    expect(service.listMembers).not.toHaveBeenCalled();
    expect(service.listWork).not.toHaveBeenCalled();
    expect(service.listFeedback).not.toHaveBeenCalled();
  });

  test('publishes a multi-item schedule and updates or deletes exact posts as a teacher', async () => {
    const service = mockService();
    service.createPosts.mockResolvedValueOnce([
      { _id: 'schedule-1', title: 'Paper discussion' },
      { _id: 'schedule-2', title: 'Project studio' },
    ] as never);

    const published = await invoke(
      service,
      NATIVE_COURSE_TEACHER_PUBLISH_POSTS,
      {
        courseId: 'course-1',
        posts: [
          {
            kind: 'schedule',
            title: 'Paper discussion',
            startsAt: '2026-07-19T09:00:00-04:00',
          },
          {
            kind: 'schedule',
            title: 'Project studio',
            body: 'Bring your current slides.',
            startsAt: '2026-07-19T13:30:00-04:00',
          },
        ],
      },
      { userId: 'teacher-auth-id' },
    );
    const updated = await invoke(
      service,
      NATIVE_COURSE_TEACHER_UPDATE_POST,
      {
        courseId: 'course-1',
        postId: 'schedule-2',
        title: 'Extended project studio',
        startsAt: '2026-07-19T14:00:00-04:00',
      },
      { userId: 'teacher-auth-id' },
    );
    const deleted = await invoke(
      service,
      NATIVE_COURSE_TEACHER_DELETE_POST,
      {
        courseId: 'course-1',
        postId: 'schedule-1',
        confirmed: true,
      },
      { userId: 'teacher-auth-id' },
    );

    expect(service.createPosts).toHaveBeenCalledWith(
      'teacher-auth-id',
      'course-1',
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'schedule',
          title: 'Project studio',
          startsAt: '2026-07-19T13:30:00-04:00',
        }),
      ]),
    );
    expect(service.updatePost).toHaveBeenCalledWith('teacher-auth-id', 'course-1', 'schedule-2', {
      title: 'Extended project studio',
      startsAt: '2026-07-19T14:00:00-04:00',
    });
    expect(service.deletePost).toHaveBeenCalledWith('teacher-auth-id', 'course-1', 'schedule-1');
    expect(published).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_PUBLISH_POSTS,
      entityIds: ['schedule-1', 'schedule-2'],
    });
    expect(updated).toMatchObject({ ok: true, action: NATIVE_COURSE_TEACHER_UPDATE_POST });
    expect(deleted).toMatchObject({ ok: true, action: NATIVE_COURSE_TEACHER_DELETE_POST });
  });

  test('creates teacher feedback for exact work and project recipients', async () => {
    const service = mockService();
    service.createFeedback
      .mockResolvedValueOnce({ _id: 'feedback-work' } as never)
      .mockResolvedValueOnce({ _id: 'feedback-project' } as never);

    const output = await invoke(
      service,
      NATIVE_COURSE_TEACHER_CREATE_FEEDBACK,
      {
        courseId: 'course-1',
        feedback: [
          {
            studentId: 'student-1',
            workId: 'work-paper',
            projectId: 'project-1',
            content: 'The evidence is strong; clarify the comparison.',
            actionItems: ['Add one sentence explaining the comparison metric.'],
          },
          {
            studentId: 'student-2',
            projectId: 'project-1',
            visibility: 'teacher',
            content: 'Private project-level planning note.',
          },
        ],
      },
      { userId: 'teacher-auth-id' },
    );

    expect(service.createFeedback).toHaveBeenNthCalledWith(1, 'teacher-auth-id', 'course-1', {
      studentId: 'student-1',
      workId: 'work-paper',
      projectId: 'project-1',
      visibility: 'student',
      content: 'The evidence is strong; clarify the comparison.',
      actionItems: [{ text: 'Add one sentence explaining the comparison metric.' }],
    });
    expect(service.createFeedback).toHaveBeenNthCalledWith(
      2,
      'teacher-auth-id',
      'course-1',
      expect.objectContaining({
        studentId: 'student-2',
        projectId: 'project-1',
        visibility: 'teacher',
      }),
    );
    expect(output).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_CREATE_FEEDBACK,
      entityIds: ['feedback-work', 'feedback-project'],
    });
  });

  test('generates, edits, and explicitly releases teacher reports', async () => {
    const service = mockService();
    const sections = [
      {
        key: 'learning',
        title: 'Learning',
        content: 'The student connected three papers to the prototype.',
        evidenceIds: ['work-paper'],
      },
    ];

    const generated = await invoke(
      service,
      NATIVE_COURSE_TEACHER_GENERATE_REPORT,
      { courseId: 'course-1', studentId: 'student-1', kind: 'progress' },
      { userId: 'teacher-auth-id' },
    );
    const updated = await invoke(
      service,
      NATIVE_COURSE_TEACHER_UPDATE_REPORT,
      { courseId: 'course-1', reportId: 'report-1', sections },
      { userId: 'teacher-auth-id' },
    );
    const released = await invoke(
      service,
      NATIVE_COURSE_TEACHER_RELEASE_REPORT,
      { courseId: 'course-1', reportId: 'report-1', confirmed: true },
      { userId: 'teacher-auth-id' },
    );

    expect(service.generateReport).toHaveBeenCalledWith(
      'teacher-auth-id',
      'course-1',
      'student-1',
      'progress',
    );
    expect(service.updateReport).toHaveBeenCalledWith(
      'teacher-auth-id',
      'course-1',
      'report-1',
      sections,
    );
    expect(service.releaseReport).toHaveBeenCalledWith('teacher-auth-id', 'course-1', 'report-1');
    expect(generated).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_GENERATE_REPORT,
    });
    expect(updated).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_UPDATE_REPORT,
    });
    expect(released).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_TEACHER_RELEASE_REPORT,
    });
  });

  test('dispatches student profile, project, time, AI use, feedback, review, delete, and undo actions', async () => {
    const service = mockService();

    await invoke(service, NATIVE_COURSE_GET_PROFILE, { courseId: 'course-1' });
    await invoke(service, NATIVE_COURSE_UPDATE_PROFILE, {
      courseId: 'course-1',
      preferredName: 'Saaj',
      interests: ['AI'],
    });
    await invoke(service, NATIVE_COURSE_CREATE_PROJECT, {
      courseId: 'course-1',
      title: 'Tutor',
      collaboratorEmails: ['partner@example.com'],
    });
    await invoke(service, NATIVE_COURSE_UPDATE_PROJECT, {
      courseId: 'course-1',
      projectId: 'project-1',
      problem: 'Updated problem',
    });
    await invoke(service, NATIVE_COURSE_DELETE_PROJECT, {
      courseId: 'course-1',
      projectId: 'project-1',
    });
    const logged = await invoke(service, NATIVE_COURSE_LOG_TIME, {
      courseId: 'course-1',
      projectId: 'project-1',
      minutes: 90,
      category: 'coding',
      description: 'Built the API',
      outcome: 'Working endpoint',
    });
    await invoke(service, NATIVE_COURSE_UPDATE_TIME, {
      courseId: 'course-1',
      entryId: 'time-1',
      minutes: 120,
      reflection: 'Learned about authentication',
    });
    await invoke(service, NATIVE_COURSE_DELETE_TIME, {
      courseId: 'course-1',
      entryId: 'time-1',
    });
    const recordedAiUse = await invoke(service, NATIVE_COURSE_RECORD_AI_USE, {
      courseId: 'course-1',
      projectId: 'project-1',
      tool: 'ChatGPT',
      task: 'Compare two API designs',
      output: 'A list of tradeoffs',
      reviewed: true,
      safetyNotes: 'Removed private data and verified the claims',
      learning: 'I chose the simpler endpoint shape',
    });
    await invoke(service, NATIVE_COURSE_UPDATE_AI_USE, {
      courseId: 'course-1',
      entryId: 'ai-use-1',
      learning: 'I chose the simpler endpoint shape after testing both options',
    });
    await invoke(service, NATIVE_COURSE_DELETE_AI_USE, {
      courseId: 'course-1',
      entryId: 'ai-use-1',
    });
    await invoke(service, NATIVE_COURSE_UPDATE_FEEDBACK, {
      courseId: 'course-1',
      feedbackId: 'feedback-1',
      studentResponse: 'I revised this.',
      connectedRevisionId: 'work-2',
      actionItemId: 'action-1',
      actionItemStatus: 'addressed',
    });
    await invoke(service, NATIVE_COURSE_SAVE_AI_REVIEW, {
      courseId: 'course-1',
      projectId: 'project-1',
      workId: 'work-1',
      content: 'The argument is clear. Add evidence.',
      actionItems: ['Add a source'],
    });
    await invoke(service, NATIVE_COURSE_DELETE_WORK, {
      courseId: 'course-1',
      workId: 'work-1',
    });
    await invoke(service, NATIVE_COURSE_UNDO, {
      courseId: 'course-1',
      sourceKey: String(logged.sourceKey),
    });

    expect(service.updateProfile).toHaveBeenCalledWith('student-auth-id', 'course-1', {
      preferredName: 'Saaj',
      interests: ['AI'],
    });
    expect(service.createProject).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      expect.objectContaining({ title: 'Tutor' }),
    );
    expect(service.updateProjectById).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'project-1',
      { problem: 'Updated problem' },
    );
    expect(service.deleteProject).toHaveBeenCalledWith('student-auth-id', 'course-1', 'project-1');
    expect(service.createTime).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      expect.objectContaining({
        minutes: 90,
        sourceMessageId: 'message-1',
        sourceKey: expect.any(String),
      }),
    );
    expect(service.updateTime).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'time-1',
      expect.objectContaining({ minutes: 120 }),
    );
    expect(service.deleteTime).toHaveBeenCalledWith('student-auth-id', 'course-1', 'time-1');
    expect(service.createAiUse).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      expect.objectContaining({
        projectId: 'project-1',
        tool: 'ChatGPT',
        task: 'Compare two API designs',
        output: 'A list of tradeoffs',
        reviewed: true,
        sourceMessageId: 'message-1',
        sourceKey: expect.any(String),
      }),
    );
    expect(recordedAiUse).toMatchObject({
      ok: true,
      action: NATIVE_COURSE_RECORD_AI_USE,
      entityType: 'ai-use',
      sourceKey: expect.any(String),
    });
    expect(service.updateAiUse).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'ai-use-1',
      expect.objectContaining({
        learning: 'I chose the simpler endpoint shape after testing both options',
      }),
    );
    expect(service.deleteAiUse).toHaveBeenCalledWith('student-auth-id', 'course-1', 'ai-use-1');
    expect(service.updateFeedback).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      'feedback-1',
      {
        studentResponse: 'I revised this.',
        connectedRevisionId: 'work-2',
        actionItemId: 'action-1',
        actionStatus: 'addressed',
      },
    );
    expect(service.createAiFeedback).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      expect.objectContaining({
        studentId: 'student-auth-id',
        workId: 'work-1',
        actionItems: [{ text: 'Add a source' }],
      }),
    );
    expect(service.deleteWork).toHaveBeenCalledWith('student-auth-id', 'course-1', 'work-1');
    expect(service.undoAutomaticSave).toHaveBeenCalledWith(
      'student-auth-id',
      'course-1',
      logged.sourceKey,
    );
  });

  test('returns a failure receipt and never reports a rejected mutation as saved', async () => {
    const service = mockService();
    service.deleteWork.mockRejectedValue(new Error('Work not found'));

    const output = await invoke(service, NATIVE_COURSE_DELETE_WORK, {
      courseId: 'course-1',
      workId: 'missing-work',
    });

    expect(output).toMatchObject({
      ok: false,
      action: NATIVE_COURSE_DELETE_WORK,
      error: 'Work not found',
    });
  });
});
