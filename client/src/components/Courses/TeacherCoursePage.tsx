/* eslint-disable i18next/no-literal-string */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Clock3,
  ExternalLink,
  Megaphone,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Input, Textarea, useToastContext } from '@librechat/client';
import type { CourseOverview, CoursePost } from 'librechat-data-provider';
import {
  useCreateCoursePostMutation,
  useCreateCoursePostsMutation,
  useDeleteCoursePostMutation,
} from '~/data-provider';
import { cn } from '~/utils';
import { Field, PageHeader, Surface, Tag, formatShortDate } from './student/ui';

type CourseAssistantRequest = (message?: string, privateContext?: string) => void;
type CoursePostFilter = 'all' | CoursePost['kind'];

type ScheduleRow = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  body: string;
  link: string;
};

const postTypes: Array<{
  kind: CoursePost['kind'];
  label: string;
  icon: typeof Bell;
}> = [
  { kind: 'announcement', label: 'Announcement', icon: Bell },
  { kind: 'deadline', label: 'Do by', icon: CalendarDays },
  { kind: 'resource', label: 'Resource', icon: BookOpen },
  { kind: 'schedule', label: 'Schedule', icon: Clock3 },
];

const singlePostCopy = {
  announcement: {
    title: 'Write an announcement',
    aiPrompt: 'Help me write and publish a course announcement.',
    titleLabel: 'Announcement title',
    bodyLabel: 'Message',
    bodyPlaceholder: 'Write the announcement for students',
    submitLabel: 'Publish announcement',
    icon: Bell,
  },
  deadline: {
    title: 'Set a deadline',
    aiPrompt: 'Help me create and publish a course deadline.',
    titleLabel: 'What should be done?',
    bodyLabel: 'Instructions',
    bodyPlaceholder: 'Add the details students need',
    submitLabel: 'Publish deadline',
    icon: CalendarDays,
  },
  resource: {
    title: 'Share a resource',
    aiPrompt: 'Help me share a course resource.',
    titleLabel: 'Resource title',
    bodyLabel: 'Note',
    bodyPlaceholder: 'Explain how students should use it',
    submitLabel: 'Share resource',
    icon: BookOpen,
  },
} as const;

function localDateValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createScheduleRow(index = 0): ScheduleRow {
  const startHour = Math.min(9 + index, 22);
  const endHour = Math.min(startHour + 1, 23);
  return {
    id: `${Date.now()}-${Math.random()}`,
    title: '',
    startsAt: `${String(startHour).padStart(2, '0')}:00`,
    endsAt: `${String(endHour).padStart(2, '0')}:00`,
    body: '',
    link: '',
  };
}

function asIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function postLabel(kind: CoursePost['kind']): string {
  return postTypes.find((item) => item.kind === kind)?.label ?? kind;
}

function postIcon(kind: CoursePost['kind']) {
  if (kind === 'announcement') {
    return Bell;
  }
  if (kind === 'deadline') {
    return CalendarDays;
  }
  if (kind === 'schedule') {
    return Clock3;
  }
  return BookOpen;
}

function postDate(post: CoursePost): string {
  if (post.kind === 'deadline') {
    return `Due ${formatShortDate(post.dueAt || post.publishedAt)}`;
  }
  if (post.kind === 'schedule') {
    const startsAt = new Date(post.startsAt || post.publishedAt);
    const endsAt = post.endsAt ? new Date(post.endsAt) : null;
    const date = formatShortDate(post.startsAt || post.publishedAt);
    const startTime = Number.isNaN(startsAt.getTime())
      ? ''
      : startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime =
      endsAt && !Number.isNaN(endsAt.getTime())
        ? endsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';
    const timeRange = startTime && endTime ? `${startTime} – ${endTime}` : startTime;
    return `${date}${timeRange ? ` · ${timeRange}` : ''}`;
  }
  return formatShortDate(post.publishedAt);
}

function ComposerHeader({ title, onAskAI }: { title: string; onAskAI: CourseAssistantRequest }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Button type="button" variant="outline" size="sm" onClick={() => onAskAI()}>
        <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
        Do with AI
      </Button>
    </div>
  );
}

function ScheduleComposer({
  date,
  rows,
  submitting,
  onDateChange,
  onRowsChange,
  onSubmit,
  onAskAI,
}: {
  date: string;
  rows: ScheduleRow[];
  submitting: boolean;
  onDateChange: (date: string) => void;
  onRowsChange: Dispatch<SetStateAction<ScheduleRow[]>>;
  onSubmit: () => void;
  onAskAI: CourseAssistantRequest;
}) {
  const updateRow = (rowId: string, update: Partial<ScheduleRow>) => {
    onRowsChange((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...update } : row)),
    );
  };

  return (
    <div>
      <ComposerHeader
        title="Build a day schedule"
        onAskAI={() =>
          onAskAI(
            'Create a schedule with multiple time blocks from the plan I provide. Ask only for details that are required to publish it.',
          )
        }
      />
      <Field label="Date">
        <Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
      </Field>
      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl border border-border-medium p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-tertiary">
                Time block {index + 1}
              </span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove time block ${index + 1}`}
                  onClick={() =>
                    onRowsChange((currentRows) => currentRows.filter((item) => item.id !== row.id))
                  }
                  className="rounded-lg p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Starts">
                <Input
                  type="time"
                  value={row.startsAt}
                  onChange={(event) => updateRow(row.id, { startsAt: event.target.value })}
                />
              </Field>
              <Field label="Ends">
                <Input
                  type="time"
                  value={row.endsAt}
                  onChange={(event) => updateRow(row.id, { endsAt: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Activity" className="mt-3">
              <Input
                value={row.title}
                placeholder="What is happening?"
                onChange={(event) => updateRow(row.id, { title: event.target.value })}
              />
            </Field>
            <Field label="Details" hint="Optional" className="mt-3">
              <Textarea
                rows={2}
                value={row.body}
                placeholder="Agenda, location, or preparation"
                onChange={(event) => updateRow(row.id, { body: event.target.value })}
              />
            </Field>
            <Field label="Meeting or resource link" hint="Optional" className="mt-3">
              <Input
                type="url"
                value={row.link}
                placeholder="https://"
                onChange={(event) => updateRow(row.id, { link: event.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={() =>
          onRowsChange((currentRows) => [...currentRows, createScheduleRow(currentRows.length)])
        }
      >
        <Plus className="size-4" />
        Add time block
      </Button>
      <Button
        type="button"
        variant="submit"
        className="mt-3 w-full"
        disabled={submitting}
        onClick={onSubmit}
      >
        <Clock3 className="size-4" />
        {submitting
          ? 'Publishing…'
          : `Publish ${rows.length} time block${rows.length === 1 ? '' : 's'}`}
      </Button>
    </div>
  );
}

export default function TeacherCoursePage({
  courseId,
  overview,
  onAskAI,
}: {
  courseId: string;
  overview: CourseOverview;
  onAskAI: CourseAssistantRequest;
}) {
  const { showToast } = useToastContext();
  const createPost = useCreateCoursePostMutation(courseId);
  const createPosts = useCreateCoursePostsMutation(courseId);
  const deletePost = useDeleteCoursePostMutation(courseId);
  const [kind, setKind] = useState<CoursePost['kind']>('deadline');
  const [feedFilter, setFeedFilter] = useState<CoursePostFilter>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [scheduleDate, setScheduleDate] = useState(localDateValue);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([createScheduleRow()]);

  const visiblePosts = useMemo(
    () =>
      feedFilter === 'all'
        ? overview.posts
        : overview.posts.filter((post) => post.kind === feedFilter),
    [feedFilter, overview.posts],
  );

  const resetSinglePost = () => {
    setTitle('');
    setBody('');
    setLink('');
    setDueAt('');
  };

  const publishSinglePost = async () => {
    if (!title.trim()) {
      showToast({ message: 'Add a title before publishing.', status: 'warning' });
      return;
    }
    if (kind === 'deadline' && !dueAt) {
      showToast({ message: 'Choose a due date and time.', status: 'warning' });
      return;
    }
    if (kind === 'resource' && !link.trim()) {
      showToast({ message: 'Add the resource link.', status: 'warning' });
      return;
    }
    try {
      await createPost.mutateAsync({
        kind,
        title: title.trim(),
        body: body.trim(),
        links: link.trim()
          ? [{ label: kind === 'resource' ? title.trim() : undefined, url: link.trim() }]
          : [],
        dueAt: kind === 'deadline' ? new Date(dueAt).toISOString() : null,
      });
      resetSinglePost();
      showToast({ message: `${postLabel(kind)} published.`, status: 'success' });
    } catch {
      showToast({ message: 'The course update could not be published.', status: 'error' });
    }
  };

  const publishSchedule = async () => {
    const incomplete = scheduleRows.some(
      (row) => !row.title.trim() || !row.startsAt || !row.endsAt,
    );
    if (!scheduleDate || incomplete) {
      showToast({
        message: 'Every time block needs a date, start time, end time, and activity.',
        status: 'warning',
      });
      return;
    }
    const invalidRange = scheduleRows.some(
      (row) =>
        new Date(`${scheduleDate}T${row.endsAt}`) <= new Date(`${scheduleDate}T${row.startsAt}`),
    );
    if (invalidRange) {
      showToast({ message: 'Each end time must be after its start time.', status: 'warning' });
      return;
    }
    try {
      await createPosts.mutateAsync(
        scheduleRows.map((row) => ({
          kind: 'schedule',
          title: row.title.trim(),
          body: row.body.trim(),
          links: row.link.trim() ? [{ label: 'Open', url: row.link.trim() }] : [],
          startsAt: asIso(scheduleDate, row.startsAt),
          endsAt: asIso(scheduleDate, row.endsAt),
        })),
      );
      setScheduleRows([createScheduleRow()]);
      showToast({
        message: `${scheduleRows.length} schedule item${scheduleRows.length === 1 ? '' : 's'} published.`,
        status: 'success',
      });
    } catch {
      showToast({ message: 'The schedule could not be fully published.', status: 'error' });
    }
  };

  const removePost = async (post: CoursePost) => {
    if (!window.confirm(`Delete “${post.title}”?`)) {
      return;
    }
    try {
      await deletePost.mutateAsync(post._id);
      showToast({ message: 'Course update deleted.', status: 'success' });
    } catch {
      showToast({ message: 'The course update could not be deleted.', status: 'error' });
    }
  };

  const composerCopy = kind === 'schedule' ? singlePostCopy.resource : singlePostCopy[kind];
  const ComposerIcon = composerCopy.icon;

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Course"
        actions={
          <Button type="button" variant="outline" onClick={() => onAskAI()}>
            <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
            Ask Course AI
          </Button>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[27rem_minmax(0,1fr)]">
        <Surface className="overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-border-light px-4 py-3">
            <Plus className="size-4 text-text-secondary" />
            <h3 className="text-sm font-semibold">Add to course</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-border-light p-3">
            {postTypes.map(({ kind: optionKind, label, icon: Icon }) => (
              <button
                key={optionKind}
                type="button"
                aria-pressed={kind === optionKind}
                onClick={() => setKind(optionKind)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors',
                  kind === optionKind
                    ? 'border-border-heavy bg-surface-active-alt text-text-primary'
                    : 'border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {kind === 'schedule' ? (
              <ScheduleComposer
                date={scheduleDate}
                rows={scheduleRows}
                submitting={createPosts.isLoading}
                onDateChange={setScheduleDate}
                onRowsChange={setScheduleRows}
                onSubmit={publishSchedule}
                onAskAI={onAskAI}
              />
            ) : (
              <div>
                <ComposerHeader
                  title={composerCopy.title}
                  onAskAI={() => onAskAI(composerCopy.aiPrompt)}
                />
                <div className="space-y-4">
                  <Field label={composerCopy.titleLabel}>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={
                        kind === 'deadline'
                          ? 'e.g. Finish the project outline'
                          : 'Add a clear title'
                      }
                    />
                  </Field>
                  {kind === 'resource' ? (
                    <Field label="Resource link">
                      <Input
                        type="url"
                        value={link}
                        onChange={(event) => setLink(event.target.value)}
                        placeholder="https://"
                      />
                    </Field>
                  ) : null}
                  <Field
                    label={composerCopy.bodyLabel}
                    hint={kind === 'resource' ? 'Optional' : undefined}
                  >
                    <Textarea
                      rows={kind === 'announcement' ? 6 : 4}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder={composerCopy.bodyPlaceholder}
                    />
                  </Field>
                  {kind === 'deadline' ? (
                    <Field label="Due date and time">
                      <Input
                        type="datetime-local"
                        value={dueAt}
                        onChange={(event) => setDueAt(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {kind !== 'resource' ? (
                    <Field label={kind === 'deadline' ? 'Resource link' : 'Link'} hint="Optional">
                      <Input
                        type="url"
                        value={link}
                        onChange={(event) => setLink(event.target.value)}
                        placeholder="https://"
                      />
                    </Field>
                  ) : null}
                  <Button
                    type="button"
                    variant="submit"
                    className="w-full"
                    disabled={createPost.isLoading}
                    onClick={publishSinglePost}
                  >
                    <ComposerIcon className="size-4" />
                    {createPost.isLoading ? 'Publishing…' : composerCopy.submitLabel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Surface>

        <Surface className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-border-light px-4 py-3">
            <Megaphone className="size-4 text-text-secondary" />
            <h3 className="text-sm font-semibold">Course feed</h3>
            <span className="ml-auto text-xs text-text-tertiary">{visiblePosts.length}</span>
          </div>
          <div className="overflow-x-auto border-b border-border-light px-3 py-2">
            <div className="flex w-max gap-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  ...postTypes.map((item) => ({ id: item.kind, label: item.label })),
                ] as Array<{ id: CoursePostFilter; label: string }>
              ).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setFeedFilter(filter.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium',
                    feedFilter === filter.id
                      ? 'bg-surface-active-alt text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover',
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border-light">
            {visiblePosts.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-tertiary">Nothing published yet.</p>
            ) : (
              visiblePosts.map((post) => {
                const Icon = postIcon(post.kind);
                return (
                  <article key={post._id} className="flex gap-3 px-4 py-4">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                      <Icon className="size-4 text-text-secondary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {post.title}
                        </h3>
                        <Tag>{postLabel(post.kind)}</Tag>
                        <button
                          type="button"
                          aria-label={`Delete ${post.title}`}
                          onClick={() => removePost(post)}
                          className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {post.body ? (
                        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
                          {post.body}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-xs text-text-tertiary">{postDate(post)}</span>
                        {(post.links ?? [])
                          .filter((item) => item?.url)
                          .slice(0, 2)
                          .map((item, index) => (
                            <a
                              key={`${post._id}-${item.url}`}
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                            >
                              {item.label || `Open link ${index + 1}`}
                              <ExternalLink className="size-3" />
                            </a>
                          ))}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
