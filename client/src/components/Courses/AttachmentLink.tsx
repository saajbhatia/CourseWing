import { useState, type ReactNode } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';

export default function AttachmentLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isOpening, setIsOpening] = useState(false);

  const openAttachment = async () => {
    if (isOpening) {
      return;
    }

    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = localize('com_course_opening_attachment');
      previewWindow.document.body.textContent = localize('com_course_opening_attachment');
    }

    setIsOpening(true);
    try {
      const authorization = getTokenHeader();
      const response = await fetch(href, {
        headers: authorization ? { Authorization: authorization } : undefined,
      });
      if (!response.ok) {
        throw new Error(`Unable to open attachment (${response.status})`);
      }

      const objectUrl = window.URL.createObjectURL(await response.blob());
      if (previewWindow) {
        previewWindow.location.replace(objectUrl);
      } else {
        window.location.assign(objectUrl);
      }
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      console.error('[courses] Unable to open attachment', error);
      showToast({
        message: localize('com_course_open_attachment_error'),
        status: 'error',
      });
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openAttachment}
      disabled={isOpening}
      aria-busy={isOpening}
      className={className}
    >
      {children}
    </button>
  );
}
