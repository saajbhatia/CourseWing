/* eslint-disable i18next/no-literal-string */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Input, Textarea, useToastContext } from '@librechat/client';
import { useUpdateUserProfileMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks';

type ProfileForm = {
  preferredName: string;
  interests: string;
  bio: string;
  website: string;
  github: string;
};

const emptyForm: ProfileForm = {
  preferredName: '',
  interests: '',
  bio: '',
  website: '',
  github: '',
};

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <p className="mt-1 text-xs text-text-tertiary">{hint}</p> : null}
    </label>
  );
}

export default function Profile() {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const updateProfile = useUpdateUserProfileMutation();
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  useEffect(() => {
    setForm({
      preferredName: user?.profile?.preferredName ?? '',
      interests: (user?.profile?.interests ?? []).join(', '),
      bio: user?.profile?.bio ?? '',
      website: user?.profile?.website ?? '',
      github: user?.profile?.github ?? '',
    });
  }, [user]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProfile.mutate(
      {
        preferredName: form.preferredName,
        interests: form.interests
          .split(',')
          .map((interest) => interest.trim())
          .filter(Boolean),
        bio: form.bio,
        website: form.website,
        github: form.github,
      },
      {
        onSuccess: () => showToast({ message: 'Profile saved', status: 'success' }),
        onError: () => showToast({ message: 'Could not save profile', status: 'error' }),
      },
    );
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <p className="font-medium">Profile details</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          This information stays the same across all of your courses.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input aria-label="Full name" value={user?.name ?? ''} readOnly />
        </Field>
        <Field label="Email">
          <Input aria-label="Email" value={user?.email ?? ''} readOnly />
        </Field>
        <Field label="Preferred name">
          <Input
            aria-label="Preferred name"
            value={form.preferredName}
            onChange={(event) =>
              setForm((current) => ({ ...current, preferredName: event.target.value }))
            }
          />
        </Field>
        <Field label="Interests" hint="Separate interests with commas.">
          <Input
            aria-label="Interests"
            value={form.interests}
            onChange={(event) =>
              setForm((current) => ({ ...current, interests: event.target.value }))
            }
          />
        </Field>
        <Field label="Short bio" className="sm:col-span-2">
          <Textarea
            aria-label="Short bio"
            rows={3}
            value={form.bio}
            onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
          />
        </Field>
        <Field label="Personal website">
          <Input
            aria-label="Personal website"
            type="url"
            value={form.website}
            onChange={(event) =>
              setForm((current) => ({ ...current, website: event.target.value }))
            }
            placeholder="https://…"
          />
        </Field>
        <Field label="GitHub">
          <Input
            aria-label="GitHub"
            type="url"
            value={form.github}
            onChange={(event) => setForm((current) => ({ ...current, github: event.target.value }))}
            placeholder="https://github.com/…"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="submit" disabled={updateProfile.isLoading}>
          {updateProfile.isLoading ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
