const mockGetInvite = jest.fn();
const mockGetCourseInviteToken = jest.fn();
const mockGetCourseShareToken = jest.fn();
const mockDeleteTokens = jest.fn();
const mockIsCourseInvitationAvailable = jest.fn();

jest.mock('@librechat/api', () => ({
  COURSE_INVITE_TOKEN_TYPE: 'course_invite',
  COURSE_SHARE_TOKEN_TYPE: 'course_share',
  getInvite: (...args) => mockGetInvite(...args),
  getCourseInviteToken: (...args) => mockGetCourseInviteToken(...args),
  getCourseShareToken: (...args) => mockGetCourseShareToken(...args),
}));
jest.mock('~/models', () => ({
  createToken: jest.fn(),
  findToken: jest.fn(),
  deleteTokens: mockDeleteTokens,
}));
jest.mock('~/server/services/NativeCourseInvitations', () => ({
  isCourseInvitationAvailable: mockIsCourseInvitationAvailable,
}));

const checkInviteUser = require('./checkInviteUser');

function responseStub() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('checkInviteUser course claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCourseShareToken.mockResolvedValue(null);
    mockIsCourseInvitationAvailable.mockResolvedValue(true);
  });

  it('accepts a reusable course share link without binding the submitted email', async () => {
    const invite = {
      identifier: 'course-1',
      token: 'stored-share-hash',
      type: 'course_share',
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockGetCourseShareToken.mockResolvedValue(invite);
    const req = {
      body: { email: 'any.student@example.com', token: 'share-secret' },
    };
    const res = responseStub();
    const next = jest.fn();

    await checkInviteUser(req, res, next);

    expect(req.courseInvite).toBe(invite);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockGetInvite).not.toHaveBeenCalled();
    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('attaches a valid course invite without consuming it before registration', async () => {
    const invite = {
      email: 'student@example.com',
      identifier: 'course-1',
      token: 'stored-hash',
      type: 'course_invite',
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockGetInvite.mockResolvedValue(invite);
    mockGetCourseInviteToken.mockResolvedValue(invite);
    const req = {
      body: { email: invite.email, token: 'claim-secret' },
    };
    const res = responseStub();
    const next = jest.fn();

    await checkInviteUser(req, res, next);

    expect(req.courseInvite).toBe(invite);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('rejects a token after its course membership is no longer available', async () => {
    const invite = {
      email: 'student@example.com',
      identifier: 'course-1',
      token: 'stored-hash',
      type: 'course_invite',
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockGetInvite.mockResolvedValue(invite);
    mockGetCourseInviteToken.mockResolvedValue(invite);
    mockIsCourseInvitationAvailable.mockResolvedValue(false);
    const req = {
      body: { email: invite.email, token: 'claim-secret' },
    };
    const res = responseStub();
    const next = jest.fn();

    await checkInviteUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'This course invitation is no longer available',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired or mismatched course claim', async () => {
    mockGetInvite.mockResolvedValue({
      email: 'student@example.com',
      identifier: 'course-1',
      token: 'stored-hash',
      type: 'course_invite',
    });
    mockGetCourseInviteToken.mockResolvedValue(null);
    const req = {
      body: { email: 'student@example.com', token: 'expired-secret' },
    };
    const res = responseStub();
    const next = jest.fn();

    await checkInviteUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid or expired course invitation',
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });
});
