/** @jest-environment @happy-dom/jest-environment */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseWingIntro from '../CourseWingIntro';

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: () => '/chat',
}));

describe('CourseWingIntro basename handling', () => {
  it('keeps app links and product assets under the configured basename', () => {
    render(
      <MemoryRouter basename="/chat" initialEntries={['/chat/coursewing']}>
        <CourseWingIntro />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: /enter coursewing/i })).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: /enter coursewing/i })) {
      expect(link).toHaveAttribute('href', '/chat/login');
    }
    expect(screen.getByAltText(/CourseWing AP Calculus course hub/i)).toHaveAttribute(
      'src',
      '/chat/assets/coursewing/course-home.png',
    );
  });
});
