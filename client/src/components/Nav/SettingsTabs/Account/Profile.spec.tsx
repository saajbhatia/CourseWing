import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import Profile from './Profile';

const mockMutate = jest.fn();
const mockUser = {
  name: 'Avery Student',
  email: 'avery@example.edu',
  profile: {
    preferredName: 'Avery',
    interests: ['AI', 'Design'],
    bio: 'I build research tools.',
    website: 'https://avery.example.edu',
    github: 'https://github.com/avery',
  },
};

jest.mock('~/data-provider', () => ({
  useUpdateUserProfileMutation: () => ({
    mutate: mockMutate,
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({
    user: mockUser,
  }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
  }) => <button {...props} />,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

describe('global profile settings', () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  it('loads the global profile and submits all editable fields', async () => {
    render(<Profile />);

    expect(screen.getByLabelText('Full name')).toHaveValue('Avery Student');
    expect(screen.getByLabelText('Email')).toHaveValue('avery@example.edu');
    expect(screen.getByLabelText('Interests')).toHaveValue('AI, Design');

    await userEvent.clear(screen.getByLabelText('Preferred name'));
    await userEvent.type(screen.getByLabelText('Preferred name'), 'Ave');
    await userEvent.clear(screen.getByLabelText('Interests'));
    await userEvent.type(screen.getByLabelText('Interests'), 'AI, HCI, AI');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        preferredName: 'Ave',
        interests: ['AI', 'HCI', 'AI'],
        bio: 'I build research tools.',
        website: 'https://avery.example.edu',
        github: 'https://github.com/avery',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
