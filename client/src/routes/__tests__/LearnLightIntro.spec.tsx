/** @jest-environment @happy-dom/jest-environment */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LearnLightIntro from '../LearnLightIntro';

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: () => '/chat',
}));

describe('LearnLightIntro basename handling', () => {
  it('keeps app links and product assets under the configured basename', () => {
    render(
      <MemoryRouter basename="/chat" initialEntries={['/chat/learnlight']}>
        <LearnLightIntro />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: /enter learnlight/i })).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: /enter learnlight/i })) {
      expect(link).toHaveAttribute('href', '/chat/login');
    }
    expect(screen.getByAltText(/LearnLight AP Calculus course hub/i)).toHaveAttribute(
      'src',
      '/chat/assets/learnlight/course-home.png',
    );
  });
});
