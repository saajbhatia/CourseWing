import { absoluteRegistrationUrl } from './TeacherInviteStudentsDialog';

describe('course share links', () => {
  it('keeps copied registration links on the app origin', () => {
    const result = absoluteRegistrationUrl(
      'http://localhost:3080/register?token=secret&course=course-1',
    );

    expect(result).toBe(`${window.location.origin}/register?token=secret&course=course-1`);
  });
});
