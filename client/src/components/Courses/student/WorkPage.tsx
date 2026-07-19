/* eslint-disable i18next/no-literal-string */
import { useMemo, useState, type FormEvent } from 'react';
import {
  Bot,
  CalendarDays,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { Button, Input, Spinner, Textarea, useToastContext } from '@librechat/client';
import type { CourseLink, CourseWork, CourseWorkKind, TFileUpload } from 'librechat-data-provider';
import {
  useCourseWorkQuery,
  useCreateCourseWorkMutation,
  useDeleteCourseWorkMutation,
  useUpdateCourseWorkMutation,
} from '~/data-provider';
import AttachmentLink from '../AttachmentLink';
import {
  CourseFileButton,
  EmptyState,
  Field,
  Modal,
  NativeSelect,
  PageHeader,
  Surface,
  Tag,
  errorMessage,
  formatCourseDate,
} from './ui';

type WorkPageProps = {
  courseId: string;
  projectId?: string;
  studentId?: string;
  onAskAI: (message: string, privateContext?: string) => void;
};

type AttachmentMetadata = {
  fileId: string;
  name: string;
  type?: string;
};

type WorkMetadata = {
  date?: string;
  attachments?: AttachmentMetadata[];
  presentationScope?: 'individual' | 'team';
  videoLinks?: CourseLink[];
  [key: string]: unknown;
};

type EditableWork = CourseWork & {
  metadata?: WorkMetadata;
};

const workKinds: Array<{ value: Exclude<CourseWorkKind, 'paper'>; label: string }> = [
  { value: 'presentation', label: 'Presentation' },
  { value: 'project', label: 'Project work' },
  { value: 'portfolio', label: 'Portfolio item' },
  { value: 'reflection', label: 'Reflection' },
  { value: 'other', label: 'Other' },
];

function metadataFor(work?: CourseWork): WorkMetadata {
  const metadata = (work as EditableWork | undefined)?.metadata;
  return metadata && typeof metadata === 'object' ? metadata : {};
}

function attachmentMetadata(work?: CourseWork): AttachmentMetadata[] {
  if (!work) {
    return [];
  }
  const saved = metadataFor(work).attachments;
  const byId = new Map((Array.isArray(saved) ? saved : []).map((file) => [file.fileId, file]));
  return work.fileIds.map(
    (fileId, index) =>
      byId.get(fileId) ?? {
        fileId,
        name: `Attachment ${index + 1}`,
      },
  );
}

function uploadedAttachments(files: TFileUpload[]): AttachmentMetadata[] {
  return files.map((file, index) => ({
    fileId: file.file_id,
    name: file.filename || `Uploaded file ${index + 1}`,
    type: file.type,
  }));
}

function dedupeAttachments(files: AttachmentMetadata[]): AttachmentMetadata[] {
  return [...new Map(files.map((file) => [file.fileId, file])).values()];
}

function linkFor(work?: CourseWork): CourseLink {
  return work?.links[0] ?? { label: '', url: '' };
}

function videoLinksFor(work?: CourseWork): CourseLink[] {
  const value = metadataFor(work).videoLinks;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (link): link is CourseLink =>
        typeof link === 'object' &&
        link !== null &&
        typeof (link as { url?: unknown }).url === 'string',
    )
    .map((link) => ({
      url: link.url,
      ...(typeof link.label === 'string' ? { label: link.label } : {}),
    }));
}

function kindLabel(kind: CourseWorkKind): string {
  return workKinds.find((item) => item.value === kind)?.label ?? 'Other';
}

function todayDateInput(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formatRecordDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return formatCourseDate(typeof value === 'string' ? value : fallback);
}

function attachmentHref(courseId: string, workId: string, fileId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/work/${encodeURIComponent(
    workId,
  )}/files/${encodeURIComponent(fileId)}`;
}

function WorkEditor({
  courseId,
  projectId,
  work,
  onClose,
}: {
  courseId: string;
  projectId?: string;
  work?: CourseWork;
  onClose: () => void;
}) {
  const { showToast } = useToastContext();
  const createWork = useCreateCourseWorkMutation(courseId);
  const updateWork = useUpdateCourseWorkMutation(courseId);
  const existingMetadata = metadataFor(work);
  const existingLink = linkFor(work);
  const [title, setTitle] = useState(work?.title ?? '');
  const [kind, setKind] = useState<Exclude<CourseWorkKind, 'paper'>>(
    work?.kind && work.kind !== 'paper' ? work.kind : 'presentation',
  );
  const [date, setDate] = useState(
    typeof existingMetadata.date === 'string'
      ? existingMetadata.date.slice(0, 10)
      : todayDateInput(),
  );
  const [description, setDescription] = useState(work?.description ?? '');
  const [reflection, setReflection] = useState(work?.reflection ?? '');
  const [linkLabel, setLinkLabel] = useState(existingLink.label ?? '');
  const [linkUrl, setLinkUrl] = useState(existingLink.url ?? '');
  const [presentationScope, setPresentationScope] = useState<'individual' | 'team'>(
    existingMetadata.presentationScope === 'team' ? 'team' : 'individual',
  );
  const savedVideoLinks = videoLinksFor(work);
  const [videoLinks, setVideoLinks] = useState<CourseLink[]>(
    savedVideoLinks.length > 0 ? savedVideoLinks : [{ label: '', url: '' }],
  );
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>(attachmentMetadata(work));
  const isSaving = createWork.isLoading || updateWork.isLoading;
  const formId = `work-editor-${work?._id ?? 'new'}`;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || isSaving) {
      return;
    }
    const otherLinks = work?.links.slice(1) ?? [];
    const links = linkUrl.trim()
      ? [{ label: linkLabel.trim() || undefined, url: linkUrl.trim() }, ...otherLinks]
      : otherLinks;
    const metadata: WorkMetadata = {
      ...existingMetadata,
      date: date || undefined,
      attachments,
    };
    if (kind === 'presentation') {
      metadata.presentationScope = presentationScope;
      metadata.videoLinks = videoLinks
        .filter((link) => link.url.trim())
        .map((link) => ({
          label: link.label?.trim() || undefined,
          url: link.url.trim(),
        }));
    } else {
      delete metadata.presentationScope;
      delete metadata.videoLinks;
    }
    const payload = {
      projectId,
      kind,
      title: title.trim(),
      description: description.trim() || undefined,
      reflection: reflection.trim() || undefined,
      fileIds: attachments.map((file) => file.fileId),
      links,
      metadata,
    };

    try {
      if (work) {
        await updateWork.mutateAsync({
          workId: work._id,
          input: payload,
        } as unknown as Parameters<typeof updateWork.mutateAsync>[0]);
      } else {
        await createWork.mutateAsync(
          payload as unknown as Parameters<typeof createWork.mutateAsync>[0],
        );
      }
      showToast({ message: work ? 'Work updated' : 'Work added' });
      onClose();
    } catch (error) {
      showToast({
        message: errorMessage(error, 'Could not save this work'),
        status: 'error',
      });
    }
  };

  return (
    <Modal
      open={true}
      title={work ? 'Edit work' : 'Add work'}
      description="Keep the useful context with the file or link so you can find it later."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="submit" disabled={!title.trim() || isSaving}>
            {isSaving ? <Spinner className="size-4" /> : null}
            {work ? 'Save changes' : 'Add work'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label="Title">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Project pitch, prototype demo…"
            />
          </Field>
          <Field label="Type">
            <NativeSelect value={kind} onChange={(value) => setKind(value as typeof kind)}>
              {workKinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>

        {kind === 'presentation' ? (
          <Field label="Presentation scope">
            <NativeSelect
              value={presentationScope}
              onChange={(value) => setPresentationScope(value === 'team' ? 'team' : 'individual')}
            >
              <option value="individual">Individual</option>
              <option value="team">Team</option>
            </NativeSelect>
          </Field>
        ) : null}

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this, and what changed in this version?"
            rows={3}
          />
        </Field>

        <Field label="Reflection">
          <Textarea
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="What did you learn or decide while making it?"
            rows={3}
          />
        </Field>

        <Surface className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Files</h4>
              <p className="mt-0.5 text-xs text-text-secondary">
                Upload a deck, document, image, or video.
              </p>
            </div>
            <CourseFileButton
              label="Upload"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.mp4,.mov"
              courseId={courseId}
              prepareForAI={true}
              onUploaded={(files) =>
                setAttachments((current) =>
                  dedupeAttachments([...current, ...uploadedAttachments(files)]),
                )
              }
            />
          </div>
          {attachments.length > 0 ? (
            <ul className="mt-3 divide-y divide-border-light rounded-lg border border-border-light">
              {attachments.map((file) => (
                <li key={file.fileId} className="flex min-w-0 items-center gap-3 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-red-600"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.fileId !== file.fileId),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Surface>

        <Surface className="grid gap-4 p-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Link label">
            <Input
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              placeholder="Google Slides"
            />
          </Field>
          <Field label="Link">
            <Input
              type="url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        </Surface>

        {kind === 'presentation' ? (
          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Video links</h4>
                <p className="mt-0.5 text-xs text-text-secondary">
                  Add recordings, walkthroughs, or demo videos for these slides.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVideoLinks((current) => [...current, { label: '', url: '' }])}
              >
                <Plus className="size-4" />
                Add video
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {videoLinks.map((videoLink, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-border-light p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
                >
                  <Field label={`Video ${index + 1} label`}>
                    <Input
                      value={videoLink.label ?? ''}
                      onChange={(event) =>
                        setVideoLinks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Final demo"
                    />
                  </Field>
                  <Field label={`Video ${index + 1} link`}>
                    <Input
                      type="url"
                      value={videoLink.url}
                      onChange={(event) =>
                        setVideoLinks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, url: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="https://…"
                    />
                  </Field>
                  <button
                    type="button"
                    className="self-end rounded-md p-2.5 text-text-secondary hover:bg-surface-hover hover:text-red-600"
                    aria-label={`Remove video ${index + 1}`}
                    disabled={videoLinks.length === 1}
                    onClick={() =>
                      setVideoLinks((current) =>
                        current.filter((_item, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </Surface>
        ) : null}
      </form>
    </Modal>
  );
}

export default function WorkPage({ courseId, projectId, studentId, onAskAI }: WorkPageProps) {
  const { showToast } = useToastContext();
  const {
    data: allWork = [],
    isLoading,
    isError,
  } = useCourseWorkQuery(courseId, {
    projectId,
  });
  const deleteWork = useDeleteCourseWorkMutation(courseId);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [editor, setEditor] = useState<CourseWork | 'new' | null>(null);

  const work = useMemo(
    () =>
      allWork
        .filter((item) => item.kind !== 'paper')
        .filter((item) => kind === 'all' || item.kind === kind)
        .filter((item) => {
          const needle = query.trim().toLowerCase();
          if (!needle) {
            return true;
          }
          return [item.title, item.description, item.reflection, kindLabel(item.kind)]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(needle));
        }),
    [allWork, kind, query],
  );

  const remove = async (item: CourseWork) => {
    if (!window.confirm(`Delete “${item.title}”?`)) {
      return;
    }
    try {
      await deleteWork.mutateAsync(item._id);
      showToast({ message: 'Work deleted' });
    } catch (error) {
      showToast({
        message: errorMessage(error, 'Could not delete this work'),
        status: 'error',
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Work"
        description="Slides, demos, drafts, and other things you make for this project."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAskAI('Help me organize or update my work records.')}
            >
              <Bot className="size-4" />
              Ask AI
            </Button>
            <Button type="button" variant="submit" onClick={() => setEditor('new')}>
              <Plus className="size-4" />
              Add work
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative">
          <span className="sr-only">Search work</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search work"
            className="pl-9"
          />
        </label>
        <NativeSelect value={kind} onChange={setKind} ariaLabel="Filter work by type">
          <option value="all">All types</option>
          {workKinds.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-5 text-text-secondary" />
        </div>
      ) : null}
      {!isLoading && isError ? (
        <EmptyState
          icon={FileText}
          title="Work is unavailable"
          description="The work list could not be loaded. Try refreshing the page."
        />
      ) : null}
      {!isLoading && !isError && work.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={query || kind !== 'all' ? 'No matching work' : 'No work yet'}
          description={
            query || kind !== 'all'
              ? 'Try a different search or filter.'
              : 'Add a file, link, or manual record when you have something to keep.'
          }
          action={
            query || kind !== 'all' ? undefined : (
              <Button type="button" variant="submit" onClick={() => setEditor('new')}>
                <Plus className="size-4" />
                Add work
              </Button>
            )
          }
        />
      ) : null}
      {!isLoading && !isError && work.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {work.map((item) => {
            const metadata = metadataFor(item);
            const attachments = attachmentMetadata(item);
            const videoLinks = videoLinksFor(item);
            const canEdit = !studentId || item.studentId === studentId;
            return (
              <Surface key={item._id} className="flex min-w-0 flex-col p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate font-semibold text-text-primary">
                        {item.title}
                      </h3>
                      <Tag>{kindLabel(item.kind)}</Tag>
                      {item.kind === 'presentation' && metadata.presentationScope ? (
                        <Tag>{metadata.presentationScope === 'team' ? 'Team' : 'Individual'}</Tag>
                      ) : null}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {formatRecordDate(metadata.date, item.createdAt)}
                    </p>
                  </div>
                </div>

                {item.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-5 text-text-secondary">
                    {item.description}
                  </p>
                ) : null}

                {attachments.length > 0 || item.links.length > 0 || videoLinks.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border-light pt-3">
                    {attachments.map((file) => (
                      <AttachmentLink
                        key={file.fileId}
                        href={attachmentHref(courseId, item._id, file.fileId)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{file.name}</span>
                      </AttachmentLink>
                    ))}
                    {item.links.map((link, index) => (
                      <a
                        key={`${link.url}-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{link.label || 'Open link'}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    ))}
                    {videoLinks.map((link, index) => (
                      <a
                        key={`video-${link.url}-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <Video className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{link.label || `Video ${index + 1}`}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap justify-end gap-1 border-t border-border-light pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onAskAI(
                        `Help me review or update “${item.title}”.`,
                        `Use the exact work record ID ${item._id}.`,
                      )
                    }
                  >
                    <Bot className="size-4" />
                    Ask AI
                  </Button>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditor(item)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                        disabled={deleteWork.isLoading}
                        onClick={() => void remove(item)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </Surface>
            );
          })}
        </div>
      ) : null}

      {editor ? (
        <WorkEditor
          key={editor === 'new' ? 'new' : editor._id}
          courseId={courseId}
          projectId={projectId}
          work={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
