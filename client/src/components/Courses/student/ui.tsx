import { useRef, type ReactNode } from 'react';
import { Upload, X, type LucideIcon } from 'lucide-react';
import { v4 } from 'uuid';
import { Button, useToastContext } from '@librechat/client';
import { extractCourseFileText, type TFileUpload } from 'librechat-data-provider';
import { useUploadFileMutation } from '~/data-provider';
import { cn } from '~/utils';

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border-medium bg-surface-primary', className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border-light pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-border-medium bg-surface-primary shadow-2xl',
          maxWidth,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-light px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm leading-5 text-text-secondary">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={`Close ${title}`}
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-border-light bg-surface-secondary px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Surface className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-3 font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-5 text-text-secondary">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Surface>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-text-tertiary">{hint}</span> : null}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-10 w-full rounded-lg border border-border-medium bg-surface-primary px-3 text-sm text-text-primary outline-none focus:border-border-heavy focus:ring-2 focus:ring-border-light',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-surface-secondary px-2 py-1 text-xs font-medium text-text-secondary">
      {children}
    </span>
  );
}

export function formatCourseDate(value?: string | Date): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(value?: string | Date): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) {
    return `${hours}h ${remainder}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remainder}m`;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error != null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response != null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data != null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error;
  }
  return fallback;
}

const AI_READABLE_COURSE_FILE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
]);

export function CourseFileButton({
  onUploaded,
  accept,
  multiple = true,
  label = 'Upload files',
  variant = 'outline',
  courseId,
  prepareForAI = false,
}: {
  onUploaded: (files: TFileUpload[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  variant?: 'outline' | 'submit';
  courseId?: string;
  prepareForAI?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFileMutation();
  const { showToast } = useToastContext();

  const uploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }
    const uploaded: TFileUpload[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append('endpoint', 'agents');
      body.append('endpointType', 'agents');
      body.append('message_file', 'true');
      body.append('file_id', v4());
      body.append('file', file, encodeURIComponent(file.name));
      try {
        const result = await uploadMutation.mutateAsync(body);
        if (prepareForAI && courseId && AI_READABLE_COURSE_FILE_TYPES.has(file.type)) {
          try {
            await extractCourseFileText(courseId, result.file_id);
          } catch {
            showToast({
              message: `${file.name} was uploaded, but AI could not read its text. You can still complete the record manually.`,
              status: 'warning',
            });
          }
        }
        uploaded.push(result);
      } catch (error) {
        showToast({
          message: errorMessage(error, `Could not upload ${file.name}`),
          status: 'error',
        });
      }
    }
    if (uploaded.length > 0) {
      onUploaded(uploaded);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => void uploadFiles(event.target.files)}
      />
      <Button
        type="button"
        variant={variant}
        disabled={uploadMutation.isLoading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {uploadMutation.isLoading ? 'Uploading…' : label}
      </Button>
    </>
  );
}
