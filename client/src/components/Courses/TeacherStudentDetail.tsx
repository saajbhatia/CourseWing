/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  MessageSquareText,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type {
  CourseAiUse,
  CourseFeedback,
  CourseLink,
  CourseMembership,
  CourseProject,
  CourseTime,
  CourseWork,
} from 'librechat-data-provider';
import TeacherFeedbackComposer, {
  type TeacherFeedbackRecipient,
  type TeacherFeedbackTarget,
} from './TeacherFeedbackComposer';
import {
  EmptyState,
  PageHeader,
  Surface,
  Tag,
  formatCourseDate,
  formatMinutes,
  formatShortDate,
} from './student/ui';

type AskAI = (message: string, privateContext?: string) => void;

function studentName(student: CourseMembership): string {
  return student.preferredName || student.email.split('@')[0] || student.email;
}

function feedbackRecipient(student: CourseMembership): TeacherFeedbackRecipient {
  return {
    key: student._id,
    name: studentName(student),
    userId: student.userId,
    active: student.state === 'active' && Boolean(student.userId),
  };
}

function readable(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function feedbackTargetName(
  feedback: CourseFeedback,
  workById: Map<string, CourseWork>,
  projectsById: Map<string, CourseProject>,
): string {
  if (feedback.workId) {
    return workById.get(feedback.workId)?.title || 'Work feedback';
  }
  if (feedback.projectId) {
    return projectsById.get(feedback.projectId)?.title || 'Project feedback';
  }
  return 'General feedback';
}

function workIcon(kind: CourseWork['kind']) {
  if (kind === 'paper') {
    return BookOpen;
  }
  if (kind === 'presentation') {
    return FileText;
  }
  return FolderKanban;
}

function videoLinks(work: CourseWork): CourseLink[] {
  const value = work.metadata?.videoLinks;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item == null || Array.isArray(item)) {
      return [];
    }
    const url = typeof item.url === 'string' ? item.url : '';
    const label = typeof item.label === 'string' ? item.label : undefined;
    return url ? [{ url, label }] : [];
  });
}

function LinkButton({ link, fallback }: { link: CourseLink; fallback: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    >
      <span className="truncate">{link.label || fallback}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof FolderKanban;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border-light px-4 py-3">
      <Icon className="size-4 text-text-secondary" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {typeof count === 'number' ? (
        <span className="ml-auto text-xs text-text-tertiary">{count}</span>
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  workCount,
  onOpen,
  onFeedback,
  onAskAI,
}: {
  project: CourseProject;
  workCount: number;
  onOpen: () => void;
  onFeedback?: () => void;
  onAskAI?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-medium bg-surface-primary">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-start gap-3 p-4 text-left hover:bg-surface-hover"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
          <FolderKanban className="size-4 text-text-secondary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{project.title}</span>
          <span className="mt-1 line-clamp-2 text-xs leading-4 text-text-secondary">
            {project.problem || 'No project description yet.'}
          </span>
          <span className="mt-2 block text-xs text-text-tertiary">
            {workCount} work {workCount === 1 ? 'record' : 'records'}
          </span>
        </span>
        <ArrowLeft className="mt-1 size-4 rotate-180 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
      </button>
      <div className="flex flex-wrap gap-2 border-t border-border-light px-3 py-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!onFeedback}
          onClick={onFeedback}
        >
          <MessageSquareText className="size-3.5" />
          Feedback
        </Button>
        {onAskAI ? (
          <Button type="button" variant="outline" size="sm" onClick={onAskAI}>
            <Sparkles className="size-3.5" />
            Do with AI
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function TeacherStudentDetail({
  courseId,
  student,
  projects,
  work,
  time,
  aiUse,
  feedback,
  onBack,
  onOpenProject,
  onOpenReview,
  onAskAI,
}: {
  courseId: string;
  student?: CourseMembership;
  projects: CourseProject[];
  work: CourseWork[];
  time: CourseTime[];
  aiUse: CourseAiUse[];
  feedback: CourseFeedback[];
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenReview: () => void;
  onAskAI?: AskAI;
}) {
  const [feedbackTarget, setFeedbackTarget] = useState<TeacherFeedbackTarget | null>(null);

  if (!student) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to students
        </Button>
        <EmptyState
          icon={UserRound}
          title="Student not found"
          description="This student may have left the course, or the link is no longer current."
        />
      </div>
    );
  }

  const ids = new Set([student._id, student.userId].filter(Boolean));
  const studentWork = work
    .filter((item) => ids.has(item.studentId))
    .sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  const studentTime = time
    .filter((item) => ids.has(item.studentId))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const studentAiUse = aiUse
    .filter((item) => ids.has(item.studentId))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const studentFeedback = feedback.filter((item) => ids.has(item.studentId));
  const projectsById = new Map(projects.map((project) => [project._id, project]));
  const workById = new Map(studentWork.map((item) => [item._id, item]));
  const recipient = feedbackRecipient(student);
  const totalMinutes = studentTime.reduce(
    (total, entry) => total + (Number(entry.minutes) || 0),
    0,
  );
  const researchCount = studentWork.filter((item) => item.kind === 'paper').length;
  const presentationCount = studentWork.filter((item) => item.kind === 'presentation').length;

  return (
    <div className="space-y-4 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" />
        All students
      </button>

      <PageHeader
        title={studentName(student)}
        description={student.bio || student.email}
        actions={
          <>
            {onAskAI && recipient.active ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onAskAI(
                    `Help me understand what ${studentName(student)} is working on and prepare useful overall feedback.`,
                    `Use exact course ID ${courseId} and student user ID ${student.userId}.`,
                  )
                }
              >
                <Sparkles className="size-4" />
                Do with AI
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!recipient.active}
              onClick={() =>
                setFeedbackTarget({
                  title: `Overall feedback for ${studentName(student)}`,
                  recipients: [recipient],
                  defaultRecipientId: student.userId,
                })
              }
            >
              <MessageSquareText className="size-4" />
              Give feedback
            </Button>
            {student.website ? (
              <LinkButton link={{ label: 'Website', url: student.website }} fallback="Website" />
            ) : null}
            {student.github ? (
              <LinkButton link={{ label: 'GitHub', url: student.github }} fallback="GitHub" />
            ) : null}
          </>
        }
      />

      <Surface className="grid overflow-hidden bg-surface-secondary sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Projects', value: projects.length, icon: FolderKanban },
          { label: 'Work records', value: studentWork.length, icon: CheckCircle2 },
          { label: 'Research', value: researchCount, icon: BookOpen },
          { label: 'Presentations', value: presentationCount, icon: FileText },
          { label: 'Time logged', value: formatMinutes(totalMinutes), icon: Clock3 },
          { label: 'AI use', value: studentAiUse.length, icon: Sparkles },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 border-b border-border-light px-3 py-3 last:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0"
          >
            <Icon className="size-4 shrink-0 text-text-secondary" />
            <span className="min-w-0">
              <span className="block text-lg font-semibold leading-5">{value}</span>
              <span className="block truncate text-xs text-text-tertiary">{label}</span>
            </span>
          </div>
        ))}
      </Surface>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <SectionTitle
              icon={FolderKanban}
              title="What they are working on"
              count={projects.length}
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {projects.length === 0 ? (
                <p className="text-sm text-text-tertiary sm:col-span-2">
                  This student is not connected to a project yet.
                </p>
              ) : (
                projects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    workCount={studentWork.filter((item) => item.projectId === project._id).length}
                    onOpen={() => onOpenProject(project._id)}
                    onFeedback={
                      recipient.active
                        ? () =>
                            setFeedbackTarget({
                              title: `${project.title} feedback for ${studentName(student)}`,
                              projectId: project._id,
                              recipients: [recipient],
                              defaultRecipientId: student.userId,
                            })
                        : undefined
                    }
                    onAskAI={
                      onAskAI && recipient.active
                        ? () =>
                            onAskAI(
                              `Review ${studentName(student)}’s work on “${project.title}” and save clear feedback with concrete action items.`,
                              `Use exact course ID ${courseId}, project ID ${project._id}, and student user ID ${student.userId}.`,
                            )
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          </Surface>

          <Surface className="flex max-h-[32rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle
              icon={CheckCircle2}
              title="Work and evidence"
              count={studentWork.length}
            />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {studentWork.length === 0 ? (
                <p className="px-4 py-5 text-sm text-text-tertiary">No work has been shared yet.</p>
              ) : (
                studentWork.map((item) => {
                  const Icon = workIcon(item.kind);
                  const project = item.projectId ? projectsById.get(item.projectId) : undefined;
                  const videos = videoLinks(item);
                  return (
                    <article key={item._id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                          <Icon className="size-4 text-text-secondary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={onOpenReview}
                              className="truncate text-left text-sm font-semibold hover:underline"
                            >
                              {item.title}
                            </button>
                            <Tag>{readable(item.kind)}</Tag>
                          </div>
                          <p className="mt-1 text-xs text-text-tertiary">
                            {[project?.title, formatShortDate(item.updatedAt)]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {item.description ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
                              {item.description}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(item.links ?? []).map((link, index) => (
                              <LinkButton
                                key={`${item._id}-link-${link.url}`}
                                link={link}
                                fallback={`Link ${index + 1}`}
                              />
                            ))}
                            {videos.map((link, index) => (
                              <LinkButton
                                key={`${item._id}-video-${link.url}`}
                                link={link}
                                fallback={`Video ${index + 1}`}
                              />
                            ))}
                            {(item.fileIds ?? []).length > 0 ? (
                              <Tag>{item.fileIds.length} files</Tag>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!recipient.active}
                              onClick={() =>
                                setFeedbackTarget({
                                  title: `${readable(item.kind)} feedback · ${item.title}`,
                                  workId: item._id,
                                  projectId: item.projectId,
                                  recipients: [recipient],
                                  defaultRecipientId: student.userId,
                                })
                              }
                            >
                              <MessageSquareText className="size-3.5" />
                              Feedback
                            </Button>
                            {onAskAI && recipient.active ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onAskAI(
                                    `Review ${studentName(student)}’s ${readable(item.kind).toLowerCase()} “${item.title}” and save clear feedback with concrete action items.`,
                                    `Use exact course ID ${courseId}, work ID ${item._id}${
                                      item.projectId ? `, project ID ${item.projectId}` : ''
                                    }, and student user ID ${student.userId}.`,
                                  )
                                }
                              >
                                <Sparkles className="size-3.5" />
                                Do with AI
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </Surface>
        </div>

        <aside className="space-y-4">
          <Surface className="overflow-hidden">
            <SectionTitle icon={UserRound} title="Student profile" />
            <div className="space-y-4 p-4">
              <div>
                <p className="text-xs font-semibold text-text-tertiary">Email</p>
                <p className="mt-1 break-all text-sm">{student.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-tertiary">Interests</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(student.interests ?? []).length > 0 ? (
                    (student.interests ?? []).map((interest) => (
                      <Tag key={interest}>{interest}</Tag>
                    ))
                  ) : (
                    <p className="text-sm text-text-tertiary">Not added yet.</p>
                  )}
                </div>
              </div>
            </div>
          </Surface>

          <Surface className="flex max-h-[22rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle icon={Clock3} title="Time" count={studentTime.length} />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {studentTime.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No time logged yet.</p>
              ) : (
                studentTime.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {entry.customCategory || readable(entry.category)}
                      </p>
                      <Tag>{formatMinutes(entry.minutes)}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {entry.projectId ? projectsById.get(entry.projectId)?.title : 'Course work'} ·{' '}
                      {formatCourseDate(entry.date)}
                    </p>
                    {entry.description ? (
                      <p className="mt-2 text-sm leading-5 text-text-secondary">
                        {entry.description}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </Surface>

          <Surface className="flex max-h-[22rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle icon={Sparkles} title="AI use" count={studentAiUse.length} />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {studentAiUse.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No AI use has been recorded.</p>
              ) : (
                studentAiUse.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.tool}</p>
                      <Tag>{entry.reviewed ? 'Reviewed' : 'Not reviewed'}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {entry.projectId ? projectsById.get(entry.projectId)?.title : 'Course work'} ·{' '}
                      {formatCourseDate(entry.date)}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-text-secondary">{entry.task}</p>
                    {entry.learning ? (
                      <p className="mt-2 rounded-lg bg-surface-secondary px-3 py-2 text-xs leading-5 text-text-secondary">
                        <span className="font-semibold text-text-primary">Learning: </span>
                        {entry.learning}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <SectionTitle
              icon={MessageSquareText}
              title="Feedback"
              count={studentFeedback.length}
            />
            <div className="border-b border-border-light p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!recipient.active}
                onClick={() =>
                  setFeedbackTarget({
                    title: `Overall feedback for ${studentName(student)}`,
                    recipients: [recipient],
                    defaultRecipientId: student.userId,
                  })
                }
              >
                <MessageSquareText className="size-4" />
                Give student feedback
              </Button>
            </div>
            <div className="max-h-[24rem] divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {studentFeedback.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No feedback yet.</p>
              ) : (
                studentFeedback.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag>{entry.authorType === 'teacher' ? 'Teacher' : 'AI'}</Tag>
                      {entry.visibility === 'teacher' ? <Tag>Private</Tag> : null}
                      <span className="text-xs text-text-tertiary">
                        {formatShortDate(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-text-tertiary">
                      {feedbackTargetName(entry, workById, projectsById)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
                      {entry.content}
                    </p>
                  </article>
                ))
              )}
            </div>
          </Surface>
        </aside>
      </div>

      <TeacherFeedbackComposer
        courseId={courseId}
        open={feedbackTarget != null}
        target={feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
      />
    </div>
  );
}
