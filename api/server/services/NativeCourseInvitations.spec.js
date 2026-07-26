const mockCourseExists = jest.fn();
const mockMemberFindOne = jest.fn();
const mockMemberFindOneAndUpdate = jest.fn();
const mockMemberExists = jest.fn();
const mockDeleteTokens = jest.fn();
const mockFindToken = jest.fn();
const mockGetCourseInviteToken = jest.fn();
const mockGetCourseShareToken = jest.fn();

jest.mock('mongoose', () => ({}));
jest.mock('@librechat/api', () => ({
  COURSE_INVITE_TOKEN_TYPE: 'course_invite',
  COURSE_SHARE_TOKEN_TYPE: 'course_share',
  getCourseInviteToken: (...args) => mockGetCourseInviteToken(...args),
  getCourseShareToken: (...args) => mockGetCourseShareToken(...args),
}));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({
    Course: { exists: mockCourseExists },
    CourseMember: {
      exists: mockMemberExists,
      findOne: mockMemberFindOne,
      findOneAndUpdate: mockMemberFindOneAndUpdate,
    },
  }),
}));
jest.mock('~/models', () => ({
  deleteTokens: mockDeleteTokens,
  findToken: mockFindToken,
}));

const {
  claimCourseInvitation,
  completeCourseInvitation,
  isCourseInvitationAvailable,
} = require('./NativeCourseInvitations');

describe('completeCourseInvitation', () => {
  const invite = {
    email: 'Student@Example.com',
    type: 'course_invite',
    identifier: 'course-1',
    token: 'stored-hash',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCourseExists.mockResolvedValue(true);
    mockMemberExists.mockResolvedValue(true);
    mockDeleteTokens.mockResolvedValue({ deletedCount: 1 });
    mockGetCourseInviteToken.mockResolvedValue(null);
    mockGetCourseShareToken.mockResolvedValue(null);
  });

  it('activates the exact pending student before consuming the one-time token', async () => {
    const member = {
      state: 'pending',
      userId: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockMemberFindOne.mockResolvedValue(member);

    await completeCourseInvitation(invite, 'user-1', invite.email);

    expect(mockMemberFindOne).toHaveBeenCalledWith({
      courseId: 'course-1',
      normalizedEmail: 'student@example.com',
      role: 'student',
      state: { $in: ['pending', 'active'] },
    });
    expect(member).toMatchObject({
      state: 'active',
      userId: 'user-1',
      joinedAt: expect.any(Date),
    });
    expect(member.save).toHaveBeenCalledTimes(1);
    expect(mockDeleteTokens).toHaveBeenCalledWith({
      token: 'stored-hash',
      email: 'student@example.com',
      type: 'course_invite',
      identifier: 'course-1',
    });
    expect(member.save.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteTokens.mock.invocationCallOrder[0],
    );
  });

  it('retains the token when membership activation fails', async () => {
    mockMemberFindOne.mockResolvedValue({
      state: 'pending',
      userId: undefined,
      save: jest.fn().mockRejectedValue(new Error('write failed')),
    });

    await expect(completeCourseInvitation(invite, 'user-1', invite.email)).rejects.toThrow(
      'write failed',
    );
    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('requires both an active course and its exact pending or active student membership', async () => {
    await expect(isCourseInvitationAvailable(invite)).resolves.toBe(true);
    expect(mockMemberExists).toHaveBeenCalledWith({
      courseId: 'course-1',
      normalizedEmail: 'student@example.com',
      role: 'student',
      state: { $in: ['pending', 'active'] },
    });

    mockMemberExists.mockResolvedValueOnce(null);
    await expect(isCourseInvitationAvailable(invite)).resolves.toBe(false);
  });

  it('uses a reusable share token to create an active membership for the submitted email', async () => {
    const shareInvite = {
      userId: 'teacher-1',
      type: 'course_share',
      identifier: 'course-1',
      token: 'stored-share-hash',
    };
    mockMemberFindOne.mockResolvedValue(null);
    mockMemberFindOneAndUpdate.mockResolvedValue({
      state: 'active',
      userId: 'user-2',
    });

    await expect(
      completeCourseInvitation(shareInvite, 'user-2', 'New.Student@Example.com'),
    ).resolves.toMatchObject({ state: 'active', userId: 'user-2' });

    expect(mockMemberFindOneAndUpdate).toHaveBeenCalledWith(
      {
        courseId: 'course-1',
        normalizedEmail: 'new.student@example.com',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          email: 'new.student@example.com',
          userId: 'user-2',
          role: 'student',
          state: 'active',
          invitedBy: 'teacher-1',
        }),
      }),
      { new: true, upsert: true },
    );
    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('only requires an active course for a reusable share link', async () => {
    const shareInvite = {
      type: 'course_share',
      identifier: 'course-1',
      token: 'stored-share-hash',
    };

    await expect(isCourseInvitationAvailable(shareInvite)).resolves.toBe(true);
    expect(mockMemberExists).not.toHaveBeenCalled();
  });

  it('claims a reusable share link for an authenticated user', async () => {
    const shareInvite = {
      userId: 'teacher-1',
      type: 'course_share',
      identifier: 'course-1',
      token: 'stored-share-hash',
    };
    mockGetCourseShareToken.mockResolvedValue(shareInvite);
    mockMemberFindOne.mockResolvedValue(null);
    mockMemberFindOneAndUpdate.mockResolvedValue({ state: 'active', userId: 'user-2' });

    await expect(
      claimCourseInvitation('share-secret', 'user-2', 'Student@Example.com'),
    ).resolves.toEqual({ courseId: 'course-1' });

    expect(mockGetCourseShareToken).toHaveBeenCalledWith('share-secret', {
      findToken: mockFindToken,
    });
    expect(mockGetCourseInviteToken).not.toHaveBeenCalled();
    expect(mockMemberFindOneAndUpdate).toHaveBeenCalledWith(
      { courseId: 'course-1', normalizedEmail: 'student@example.com' },
      expect.any(Object),
      { new: true, upsert: true },
    );
  });

  it('rejects an invalid authenticated invitation claim', async () => {
    await expect(
      claimCourseInvitation('expired-secret', 'user-2', 'student@example.com'),
    ).rejects.toThrow('invalid or has expired');

    expect(mockGetCourseInviteToken).toHaveBeenCalledWith('expired-secret', 'student@example.com', {
      findToken: mockFindToken,
    });
    expect(mockMemberFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
