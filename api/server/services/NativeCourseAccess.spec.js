const mockMemberExists = jest.fn();

jest.mock('mongoose', () => ({}));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({
    CourseMember: { exists: mockMemberExists },
  }),
}));

const { hasNativeCourseAccess } = require('./NativeCourseAccess');

describe('hasNativeCourseAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires an active user-bound membership and never grants access by pending email', async () => {
    mockMemberExists.mockResolvedValue(null);

    await expect(hasNativeCourseAccess('user-1', 'pending@example.com')).resolves.toBe(false);
    expect(mockMemberExists).toHaveBeenCalledWith({
      userId: 'user-1',
      state: 'active',
    });
  });
});
