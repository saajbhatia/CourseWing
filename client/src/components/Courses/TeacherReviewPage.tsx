/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FolderKanban,
  Sparkles,
} from 'lucide-react';
import { Button, Textarea, useToastContext } from '@librechat/client';
import type { CourseMembership, CourseWork } from 'librechat-data-provider';
import { useCreateCourseFeedbackMutation } from '~/data-provider';
import { cn } from '~/utils';
import { EmptyState, PageHeader, Surface, Tag, formatShortDate } from './student/ui';

type CourseAssistantRequest = (message?: string, privateContext?: string) => void;

function studentId(student: CourseMembership): string {
  return student.userId || student._id;
}

function studentName(student?: CourseMembership): string {
  if (!student) {
    return 'Student';
  }
  return student.preferredName || student.email.split('@')[0] || student.email;
}

function workIcon(kind: CourseWork['kind']) {
  if (kind === 'paper') {
    return BookOpen;
  }
  if (kind === 'presentation') {
    return FileText;
  }
  if (kind === 'project') {
    return FolderKanban;
  }
  return ClipboardCheck;
}

export default function TeacherReviewPage({
  courseId,
  work,
  students,
  initialWorkId,
  onAskAI,
}: {
  courseId: string;
  work: CourseWork[];
  students: CourseMembership[];
  initialWorkId?: string;
  onAskAI: CourseAssistantRequest;
}) {
  const { showToast } = useToastContext();
  const createFeedback = useCreateCourseFeedbackMutation(courseId);
  const [selectedId, setSelectedId] = useState(initialWorkId ?? '');
  const [content, setContent] = useState('');
  const [actionItems, setActionItems] = useState('');
  const [privateNote, setPrivateNote] = useState(false);
  const studentsById = useMemo(
    () => new Map(students.map((student) => [studentId(student), student])),
    [students],
  );
  const selected = work.find((item) => item._id === selectedId) ?? work[0];

  useEffect(() => {
    if (initialWorkId && work.some((item) => item._id === initialWorkId)) {
      setSelectedId(initialWorkId);
    }
  }, [initialWorkId, work]);

  useEffect(() => {
    setContent('');
    setActionItems('');
    setPrivateNote(false);
  }, [selected?._id]);

  const saveFeedback = async () => {
    if (!selected || !content.trim()) {
      showToast({ message: 'Write feedback before saving.', status: 'warning' });
      return;
    }
    try {
      await createFeedback.mutateAsync({
        studentId: selected.studentId,
        workId: selected._id,
        projectId: selected.projectId,
        visibility: privateNote ? 'teacher' : 'student',
        content: content.trim(),
        actionItems: actionItems
          .split('\n')
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ text })),
      });
      setContent('');
      setActionItems('');
      showToast({
        message: privateNote
          ? 'Private teaching note saved.'
          : 'Feedback published to the student.',
        status: 'success',
      });
    } catch {
      showToast({ message: 'Feedback could not be saved.', status: 'error' });
    }
  };
  const saveLabel = privateNote ? 'Save note' : 'Publish';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Review"
        actions={
          selected ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onAskAI(
                  `Review “${selected.title}” and help me write specific feedback with action items.`,
                  JSON.stringify({
                    workId: selected._id,
                    projectId: selected.projectId,
                    studentId: selected.studentId,
                    title: selected.title,
                    kind: selected.kind,
                    fileIds: selected.fileIds,
                  }),
                )
              }
            >
              <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
              Do with AI
            </Button>
          ) : undefined
        }
      />

      {work.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No work to review"
          description="Student presentations, papers, and project updates will appear here."
        />
      ) : (
        <Surface className="grid min-h-[36rem] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <section className="border-b border-border-light bg-surface-secondary lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2.5 border-b border-border-light px-3 py-2.5">
              <ClipboardCheck className="size-4 text-text-secondary" />
              <h3 className="text-sm font-semibold">Shared work</h3>
              <span className="ml-auto text-xs text-text-tertiary">{work.length}</span>
            </div>
            <div className="max-h-64 divide-y divide-border-light overflow-y-auto lg:max-h-[33rem]">
              {work.map((item) => {
                const Icon = workIcon(item.kind);
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedId(item._id)}
                    className={cn(
                      'w-full px-3 py-3 text-left hover:bg-surface-hover',
                      selected?._id === item._id && 'bg-surface-primary',
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs capitalize text-text-tertiary">
                      <Icon className="size-3.5" />
                      {item.kind}
                      <span className="ml-auto">{formatShortDate(item.updatedAt)}</span>
                    </span>
                    <span className="mt-1.5 block truncate text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-text-tertiary">
                      {studentName(studentsById.get(item.studentId))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 border-b border-border-light p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag>{selected.kind}</Tag>
                  <span className="text-xs text-text-tertiary">
                    {studentName(studentsById.get(selected.studentId))}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-semibold">{selected.title}</h2>
              </div>
              {(selected.links ?? [])[0] ? (
                <a
                  href={(selected.links ?? [])[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-border-medium px-3 py-2 text-sm font-medium hover:bg-surface-hover"
                >
                  Open
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>

            {selected.description ? (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {selected.description}
              </p>
            ) : null}
            {selected.reflection ? (
              <div className="mt-5 rounded-lg bg-surface-secondary p-4">
                <p className="text-xs font-semibold text-text-tertiary">Reflection</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.reflection}</p>
              </div>
            ) : null}
            {!selected.description && !selected.reflection ? (
              <div className="mt-5 flex min-h-48 items-center justify-center rounded-lg bg-surface-secondary text-sm text-text-tertiary">
                No additional notes.
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-text-secondary">
              {(selected.fileIds ?? []).length > 0 ? (
                <Tag>{selected.fileIds.length} files</Tag>
              ) : null}
              {(selected.links ?? []).length > 0 ? <Tag>{selected.links.length} links</Tag> : null}
            </div>
          </section>

          <aside className="flex flex-col bg-surface-secondary p-4">
            <div>
              <h3 className="text-sm font-semibold">Feedback</h3>
              <p className="mt-1 text-xs text-text-tertiary">
                Feedback is connected directly to this work record.
              </p>
            </div>
            <Textarea
              className="mt-4 min-h-40 bg-surface-primary"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write feedback…"
            />
            <Textarea
              className="mt-3 min-h-24 bg-surface-primary"
              value={actionItems}
              onChange={(event) => setActionItems(event.target.value)}
              placeholder="Action items, one per line…"
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={privateNote}
                onChange={(event) => setPrivateNote(event.target.checked)}
              />
              Only the teaching team can see this
            </label>
            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onAskAI(
                    `Draft feedback for “${selected.title}”. Do not publish it yet.`,
                    JSON.stringify({
                      workId: selected._id,
                      studentId: selected.studentId,
                      fileIds: selected.fileIds,
                    }),
                  )
                }
              >
                <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
                AI draft
              </Button>
              <Button
                type="button"
                variant="submit"
                disabled={createFeedback.isLoading || !content.trim()}
                onClick={saveFeedback}
              >
                {createFeedback.isLoading ? 'Saving…' : saveLabel}
              </Button>
            </div>
          </aside>
        </Surface>
      )}
    </div>
  );
}
