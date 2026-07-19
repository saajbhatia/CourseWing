import {
  COURSE_INVITE_EXPIRES_IN_SECONDS,
  COURSE_INVITE_TOKEN_TYPE,
  COURSE_SHARE_EXPIRES_IN_SECONDS,
  COURSE_SHARE_TOKEN_TYPE,
  createCourseInviteToken,
  createCourseShareToken,
  getCourseInviteToken,
  getCourseShareToken,
  type CourseInviteTokenRecord,
} from './courseInvite';

describe('course registration invite tokens', () => {
  test('creates a seven-day, course-scoped token and resolves it only for the bound email', async () => {
    let stored:
      | (CourseInviteTokenRecord & {
          expiresIn: number;
          metadata: { courseId: string };
        })
      | undefined;
    const createToken = jest.fn(async (record) => {
      stored = {
        ...record,
        expiresAt: new Date(Date.now() + record.expiresIn * 1000),
      };
      return stored;
    });
    const deleteTokens = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const findToken = jest.fn(async (filter) => {
      if (
        stored &&
        stored.token === filter.token &&
        stored.email === filter.email &&
        stored.type === filter.type
      ) {
        return stored;
      }
      return null;
    });

    const created = await createCourseInviteToken(
      {
        email: '  Student@Example.com ',
        courseId: 'course-123',
        invitedBy: '507f1f77bcf86cd799439011',
      },
      { createToken, deleteTokens },
    );

    expect(created.token).toBeTruthy();
    expect(Date.parse(created.expiresAt)).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@example.com',
        identifier: 'course-123',
        type: COURSE_INVITE_TOKEN_TYPE,
        expiresIn: COURSE_INVITE_EXPIRES_IN_SECONDS,
        metadata: { courseId: 'course-123' },
      }),
    );
    expect(deleteTokens).toHaveBeenCalledWith({
      email: 'student@example.com',
      identifier: 'course-123',
      type: COURSE_INVITE_TOKEN_TYPE,
    });
    await expect(
      getCourseInviteToken(created.token, 'student@example.com', { findToken }),
    ).resolves.toMatchObject({
      email: 'student@example.com',
      identifier: 'course-123',
      type: COURSE_INVITE_TOKEN_TYPE,
    });
    await expect(
      getCourseInviteToken(created.token, 'someone-else@example.com', { findToken }),
    ).resolves.toBeNull();
  });

  test('rejects an expired token even before TTL cleanup removes its record', async () => {
    const invite: CourseInviteTokenRecord = {
      userId: '507f1f77bcf86cd799439011',
      email: 'student@example.com',
      type: COURSE_INVITE_TOKEN_TYPE,
      identifier: 'course-123',
      token: 'stored-hash',
      expiresAt: new Date(Date.now() - 1000),
    };
    const findToken = jest.fn().mockResolvedValue(invite);

    await expect(
      getCourseInviteToken('expired-secret', 'student@example.com', { findToken }),
    ).resolves.toBeNull();
  });

  test('creates one reusable course-wide share token without binding an email', async () => {
    let stored:
      | (CourseInviteTokenRecord & {
          expiresIn: number;
          metadata: { courseId: string };
        })
      | undefined;
    const createToken = jest.fn(async (record) => {
      stored = {
        ...record,
        expiresAt: new Date(Date.now() + record.expiresIn * 1000),
      };
      return stored;
    });
    const deleteTokens = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const findToken = jest.fn(async (filter) =>
      stored && stored.token === filter.token && stored.type === filter.type ? stored : null,
    );

    const created = await createCourseShareToken(
      {
        courseId: 'course-123',
        invitedBy: '507f1f77bcf86cd799439011',
      },
      { createToken, deleteTokens },
    );

    expect(createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'course-123',
        type: COURSE_SHARE_TOKEN_TYPE,
        expiresIn: COURSE_SHARE_EXPIRES_IN_SECONDS,
      }),
    );
    expect(createToken.mock.calls[0][0]).not.toHaveProperty('email');
    expect(deleteTokens).toHaveBeenCalledWith({
      identifier: 'course-123',
      type: COURSE_SHARE_TOKEN_TYPE,
    });
    await expect(getCourseShareToken(created.token, { findToken })).resolves.toMatchObject({
      identifier: 'course-123',
      type: COURSE_SHARE_TOKEN_TYPE,
    });
  });
});
