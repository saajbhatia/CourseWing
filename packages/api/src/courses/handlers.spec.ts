import type { Response } from 'express';
import { CourseServiceError, type CourseService } from './service';
import { createCourseHandlers } from './handlers';

function responseStub(): {
  response: Response;
  status: jest.Mock;
  json: jest.Mock;
} {
  const target: { status: jest.Mock; json: jest.Mock } = {
    status: jest.fn(),
    json: jest.fn(),
  };
  target.status.mockReturnValue(target);
  target.json.mockReturnValue(target);
  return {
    response: target as unknown as Response,
    status: target.status,
    json: target.json,
  };
}

describe('native course account roles', () => {
  test('student accounts cannot create courses', async () => {
    const createCourse = jest.fn();
    const handlers = createCourseHandlers({ createCourse } as unknown as CourseService);
    const { response, status, json } = responseStub();

    await handlers.createCourse(
      {
        user: {
          id: 'student-1',
          email: 'student@example.edu',
          role: 'USER',
          courseRole: 'student',
        },
        body: { name: 'Unauthorized course' },
      } as never,
      response,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'A teacher account is required to create courses',
    });
    expect(createCourse).not.toHaveBeenCalled();
  });

  test('teacher accounts can create courses', async () => {
    const access = {
      course: { _id: 'course-1', name: 'Studio' },
      membership: { role: 'teacher' },
      isTeacher: true,
    };
    const createCourse = jest.fn().mockResolvedValue(access);
    const handlers = createCourseHandlers({ createCourse } as unknown as CourseService);
    const { response, status, json } = responseStub();

    await handlers.createCourse(
      {
        user: {
          id: 'teacher-1',
          email: 'teacher@example.edu',
          role: 'USER',
          courseRole: 'teacher',
        },
        body: { name: 'Studio' },
      } as never,
      response,
    );

    expect(createCourse).toHaveBeenCalledWith('teacher-1', 'teacher@example.edu', {
      name: 'Studio',
      description: undefined,
    });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(access);
  });
});

describe('native course work handlers', () => {
  test('forwards every editable AI work field to the service', async () => {
    const updateWork = jest.fn().mockResolvedValue({ _id: 'work-1' });
    const handlers = createCourseHandlers({ updateWork } as unknown as CourseService);
    const { response, status, json } = responseStub();

    await handlers.updateWork(
      {
        user: { id: 'student-1' },
        params: { courseId: 'course-1', workId: 'work-1' },
        body: {
          aiSummary: 'Grounded summary',
          versionOf: 'work-original',
          milestoneId: 'milestone-1',
          projectId: 'project-1',
        },
      } as never,
      response,
    );

    expect(updateWork).toHaveBeenCalledWith('student-1', 'course-1', 'work-1', {
      kind: undefined,
      title: undefined,
      description: undefined,
      fileIds: undefined,
      links: undefined,
      reflection: undefined,
      metadata: undefined,
      aiSummary: 'Grounded summary',
      versionOf: 'work-original',
      portfolioState: undefined,
      milestoneId: 'milestone-1',
      projectId: 'project-1',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ _id: 'work-1' });
  });
});

describe('native course invitation handlers', () => {
  test('creates one course-wide registration link without an email parameter', async () => {
    const requireTeacher = jest.fn().mockResolvedValue({
      course: { name: 'Example Studio' },
      membership: { role: 'teacher' },
      isTeacher: true,
    });
    const createShareRegistrationClaim = jest.fn().mockResolvedValue({
      token: 'share-secret',
      expiresAt: '2030-02-01T00:00:00.000Z',
    });
    const handlers = createCourseHandlers(
      { requireTeacher } as unknown as CourseService,
      {
        createShareRegistrationClaim,
        registrationBaseUrl: 'https://courses.example.edu/app',
      },
    );
    const { response, status, json } = responseStub();

    await handlers.createShareLink(
      {
        user: { id: 'teacher-1' },
        params: { courseId: 'course-1' },
        body: {},
      } as never,
      response,
    );

    expect(requireTeacher).toHaveBeenCalledWith('teacher-1', 'course-1');
    expect(createShareRegistrationClaim).toHaveBeenCalledWith({
      courseId: 'course-1',
      invitedBy: 'teacher-1',
    });
    expect(status).toHaveBeenCalledWith(201);
    const result = json.mock.calls[0][0];
    expect(result).toMatchObject({
      token: 'share-secret',
      expiresAt: '2030-02-01T00:00:00.000Z',
    });
    expect(result.url).toContain('/app/register?');
    expect(result.url).toContain('course=course-1');
    expect(result.url).toContain('courseName=Example+Studio');
    expect(result.url).not.toContain('email=');
  });

  test('returns active accounts and pending registration claims per email', async () => {
    const inviteMembers = jest.fn().mockResolvedValue([
      {
        _id: 'member-active',
        normalizedEmail: 'active@example.com',
        email: 'active@example.com',
        state: 'active',
        role: 'student',
      },
      {
        _id: 'member-pending',
        normalizedEmail: 'new@example.com',
        email: 'new@example.com',
        state: 'pending',
        role: 'student',
      },
    ]);
    const requireTeacher = jest.fn().mockResolvedValue({
      course: { name: 'Example Studio' },
      membership: { role: 'teacher' },
      isTeacher: true,
    });
    const createRegistrationClaim = jest.fn().mockResolvedValue({
      token: 'claim-secret',
      expiresAt: '2030-01-02T00:00:00.000Z',
    });
    const handlers = createCourseHandlers(
      { inviteMembers, requireTeacher } as unknown as CourseService,
      {
        createRegistrationClaim,
        registrationBaseUrl: 'https://courses.example.edu/app',
      },
    );
    const { response, status, json } = responseStub();

    await handlers.inviteMembers(
      {
        user: { id: 'teacher-1' },
        params: { courseId: 'course-1' },
        body: {
          emails: [' Active@Example.com ', 'new@example.com', 'not-an-email'],
        },
      } as never,
      response,
    );

    expect(inviteMembers).toHaveBeenCalledWith('teacher-1', 'course-1', {
      emails: ['active@example.com', 'new@example.com'],
    });
    expect(createRegistrationClaim).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith([
      expect.objectContaining({ email: 'active@example.com', status: 'active' }),
      expect.objectContaining({
        email: 'new@example.com',
        status: 'pending',
        registration: expect.objectContaining({
          token: 'claim-secret',
          url: expect.stringContaining('/app/register?'),
        }),
      }),
      {
        email: 'not-an-email',
        status: 'error',
        error: 'Enter a valid email address',
      },
    ]);
    const result = json.mock.calls[0][0][1];
    expect(result.registration.url).toContain('courseName=Example+Studio');
    expect(result.registration.url).toContain('email=new%40example.com');
  });

  test('rejects batches larger than 200 before changing memberships', async () => {
    const inviteMembers = jest.fn();
    const handlers = createCourseHandlers({ inviteMembers } as unknown as CourseService);
    const { response, status } = responseStub();

    await handlers.inviteMembers(
      {
        user: { id: 'teacher-1' },
        params: { courseId: 'course-1' },
        body: { emails: Array.from({ length: 201 }, (_, index) => `s${index}@example.com`) },
      } as never,
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(inviteMembers).not.toHaveBeenCalled();
  });

  test('checks teacher access even when every submitted email is invalid', async () => {
    const requireTeacher = jest
      .fn()
      .mockRejectedValue(new CourseServiceError(403, 'Teacher access required'));
    const inviteMembers = jest.fn();
    const handlers = createCourseHandlers({
      requireTeacher,
      inviteMembers,
    } as unknown as CourseService);
    const { response, status } = responseStub();

    await handlers.inviteMembers(
      {
        user: { id: 'student-1' },
        params: { courseId: 'course-1' },
        body: { emails: ['invalid'] },
      } as never,
      response,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(inviteMembers).not.toHaveBeenCalled();
  });
});
