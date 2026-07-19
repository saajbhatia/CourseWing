/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { Check, Copy, Link2, RefreshCw } from 'lucide-react';
import { Button, Input, useToastContext } from '@librechat/client';
import type { CourseShareLink } from 'librechat-data-provider';
import { useCreateCourseShareLinkMutation } from '~/data-provider';
import { Modal } from './student/ui';

export function absoluteRegistrationUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return new URL(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
      window.location.origin,
    ).toString();
  } catch {
    return url;
  }
}

export default function TeacherInviteStudentsDialog({
  courseId,
  courseName,
  open,
  onClose,
}: {
  courseId: string;
  courseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToastContext();
  const createShareLink = useCreateCourseShareLinkMutation(courseId);
  const [shareLink, setShareLink] = useState<CourseShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  const generateLink = async () => {
    try {
      const result = await createShareLink.mutateAsync();
      setShareLink(result);
      setCopied(false);
      showToast({
        message: shareLink ? 'A new join link replaced the old one.' : 'Course join link created.',
        status: 'success',
      });
    } catch {
      showToast({ message: 'The course join link could not be created.', status: 'error' });
    }
  };

  const copyLink = async () => {
    if (!shareLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(absoluteRegistrationUrl(shareLink.url));
      setCopied(true);
      showToast({ message: 'Course join link copied.', status: 'success' });
    } catch {
      showToast({ message: 'The course join link could not be copied.', status: 'error' });
    }
  };

  const registrationUrl = shareLink ? absoluteRegistrationUrl(shareLink.url) : '';

  return (
    <Modal
      open={open}
      title="Share course"
      description={`Anyone with the link can create an account and join ${courseName}.`}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
          {shareLink ? (
            <Button type="button" variant="submit" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy join link'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="submit"
              disabled={createShareLink.isLoading}
              onClick={generateLink}
            >
              <Link2 className="size-4" />
              {createShareLink.isLoading ? 'Creating…' : 'Create join link'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {shareLink ? (
          <>
            <div>
              <label htmlFor="course-join-link" className="text-sm font-medium text-text-primary">
                Course join link
              </label>
              <div className="mt-2 flex gap-2">
                <Input id="course-join-link" readOnly value={registrationUrl} />
                <Button type="button" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  <span className="sr-only">Copy join link</span>
                </Button>
              </div>
              <p className="mt-2 text-xs text-text-tertiary">
                This link works for multiple students until{' '}
                {new Date(shareLink.expiresAt).toLocaleDateString()}.
              </p>
            </div>
            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <p className="text-sm font-medium text-text-primary">Need to stop sharing it?</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                Create a new link to immediately invalidate this one.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={createShareLink.isLoading}
                onClick={generateLink}
              >
                <RefreshCw className="size-3.5" />
                {createShareLink.isLoading ? 'Replacing…' : 'Replace link'}
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-border-light bg-surface-secondary p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-primary text-text-secondary">
              <Link2 className="size-5" />
            </span>
            <h4 className="mt-3 text-sm font-semibold text-text-primary">
              One link for the whole class
            </h4>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Post it in your class chat or send it in one email. Students enter their own email,
              create an account, and are added to the course automatically.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
