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
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type {
  CourseAiUse,
  CourseFeedback,
  CourseLink,
  CourseMembership,
  CourseOverview,
  CourseTime,
  CourseWork,
} from 'librechat-data-provider';
import AttachmentLink from './AttachmentLink';
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

type AttachmentMetadata = {
  fileId: string;
  name?: string;
};

type AskAI = (message: string, privateContext?: string) => void;

function memberId(member: CourseMembership): string {
  return member.userId || member._id;
}

function memberName(member?: CourseMembership): string {
  if (!member) {
    return 'Student';
  }
  return member.preferredName || member.email.split('@')[0] || member.email;
}

function memberInitials(member: CourseMembership): string {
  return memberName(member)
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function feedbackRecipient(member: CourseMembership): TeacherFeedbackRecipient {
  return {
    key: member._id,
    name: memberName(member),
    userId: member.userId,
    active: member.state === 'active' && Boolean(member.userId),
  };
}

function readableCategory(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function attachmentMetadata(work: CourseWork): AttachmentMetadata[] {
  const value = work.metadata?.attachments;
  if (!Array.isArray(value)) {
    return (work.fileIds ?? []).map((fileId) => ({ fileId }));
  }
  const attachments = value.flatMap((item) => {
    if (typeof item !== 'object' || item == null || Array.isArray(item)) {
      return [];
    }
    const fileId = typeof item.fileId === 'string' ? item.fileId : '';
    const name = typeof item.name === 'string' ? item.name : undefined;
    return fileId ? [{ fileId, name }] : [];
  });
  return attachments.length > 0 ? attachments : (work.fileIds ?? []).map((fileId) => ({ fileId }));
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

function attachmentHref(courseId: string, workId: string, fileId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/work/${encodeURIComponent(
    workId,
  )}/files/${encodeURIComponent(fileId)}`;
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
    <div className="flex items-center gap-2.5 border-b border-border-light px-4 py-3">
      <Icon className="size-4 text-text-secondary" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {typeof count === 'number' ? (
        <span className="ml-auto text-xs text-text-tertiary">{count}</span>
      ) : null}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-tertiary">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-primary">
        {value || 'Not added yet'}
      </p>
    </div>
  );
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

export default function TeacherProjectDetail({
  courseId,
  overview,
  projectId,
  members,
  work,
  time,
  aiUse,
  feedback,
  onBack,
  onOpenReview,
  onAskAI,
}: {
  courseId: string;
  overview: CourseOverview;
  projectId?: string;
  members: CourseMembership[];
  work: CourseWork[];
  time: CourseTime[];
  aiUse: CourseAiUse[];
  feedback: CourseFeedback[];
  onBack: () => void;
  onOpenReview: () => void;
  onAskAI?: AskAI;
}) {
  const [feedbackTarget, setFeedbackTarget] = useState<TeacherFeedbackTarget | null>(null);
  const project = overview.projects.find((item) => item._id === projectId);

  if (!project) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Button>
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          description="This project may have been removed, or the link is no longer current."
        />
      </div>
    );
  }

  const peopleById = new Map(
    members.flatMap((member) => {
      const ids = [member._id];
      if (member.userId) {
        ids.push(member.userId);
      }
      return ids.map((id) => [id, member] as const);
    }),
  );
  const projectWork = work
    .filter((item) => item.projectId === project._id)
    .sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  const projectTime = time
    .filter((item) => item.projectId === project._id)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const projectAiUse = aiUse
    .filter((item) => item.projectId === project._id)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const projectWorkIds = new Set(projectWork.map((item) => item._id));
  const projectFeedback = feedback.filter(
    (item) => item.projectId === project._id || (item.workId && projectWorkIds.has(item.workId)),
  );
  const workById = new Map(projectWork.map((item) => [item._id, item]));
  const projectRecipients = members.map(feedbackRecipient);
  const totalMinutes = projectTime.reduce(
    (total, entry) => total + (Number(entry.minutes) || 0),
    0,
  );
  const researchCount = projectWork.filter((item) => item.kind === 'paper').length;
  const presentationCount = projectWork.filter((item) => item.kind === 'presentation').length;

  return (
    <div className="space-y-4 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" />
        All projects
      </button>

      <PageHeader
        title={project.title}
        description={project.problem || 'No project problem has been added yet.'}
        actions={
          <>
            {onAskAI ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onAskAI(
                    `Help me review the overall project “${project.title}” and prepare useful feedback for its students.`,
                    `Use exact course ID ${courseId}, project ID ${project._id}, and only these active student user IDs: ${projectRecipients
                      .filter((recipient) => recipient.active)
                      .map((recipient) => recipient.userId)
                      .join(', ')}.`,
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
              onClick={() =>
                setFeedbackTarget({
                  title: `Overall feedback for ${project.title}`,
                  projectId: project._id,
                  recipients: projectRecipients,
                  allowAll: true,
                })
              }
            >
              <MessageSquareText className="size-4" />
              Give feedback
            </Button>
            {(project.links ?? []).find((link) => link?.url) ? (
              <LinkButton
                link={(project.links ?? []).find((link) => link?.url) as CourseLink}
                fallback="Open project"
              />
            ) : null}
          </>
        }
      />

      <Surface className="grid overflow-hidden bg-surface-secondary sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Students', value: members.length, icon: Users },
          { label: 'Work records', value: projectWork.length, icon: FolderKanban },
          { label: 'Research', value: researchCount, icon: BookOpen },
          { label: 'Presentations', value: presentationCount, icon: FileText },
          { label: 'Time logged', value: formatMinutes(totalMinutes), icon: Clock3 },
          { label: 'AI use', value: projectAiUse.length, icon: Sparkles },
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
            <SectionTitle icon={Target} title="Project overview" />
            <div className="grid gap-5 p-4 sm:grid-cols-2">
              <DetailField label="Problem" value={project.problem} />
              <DetailField label="Target users" value={project.targetUser} />
              <DetailField label="Core idea / hypothesis" value={project.valueProposition} />
              <DetailField
                label="Project format"
                value={members.length > 1 ? 'Team project' : 'Individual project'}
              />
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <SectionTitle icon={CheckCircle2} title="Technical route" />
            <div className="grid gap-5 p-4 sm:grid-cols-2 xl:grid-cols-3">
              <DetailField
                label="What they are building"
                value={project.technicalRoute?.capability}
              />
              <DetailField label="Data or inputs" value={project.technicalRoute?.dataInput} />
              <DetailField label="Output / prototype" value={project.technicalRoute?.output} />
              <DetailField label="Evaluation approach" value={project.technicalRoute?.evaluation} />
              <DetailField
                label="Responsible-use safeguards"
                value={project.technicalRoute?.safeguards}
              />
            </div>
          </Surface>

          <Surface className="flex max-h-[32rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle
              icon={FolderKanban}
              title="Work and evidence"
              count={projectWork.length}
            />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {projectWork.length === 0 ? (
                <p className="px-4 py-5 text-sm text-text-tertiary">
                  No work has been added to this project.
                </p>
              ) : (
                projectWork.map((item) => {
                  const Icon = workIcon(item.kind);
                  const student = peopleById.get(item.studentId);
                  const attachments = attachmentMetadata(item);
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
                              className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
                            >
                              {item.title}
                            </button>
                            <Tag>{readableCategory(item.kind)}</Tag>
                            {typeof item.metadata?.presentationScope === 'string' ? (
                              <Tag>{readableCategory(item.metadata.presentationScope)}</Tag>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-text-tertiary">
                            {memberName(student)} · {formatShortDate(item.updatedAt)}
                          </p>
                          {item.description ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
                              {item.description}
                            </p>
                          ) : null}
                          {item.reflection ? (
                            <p className="mt-2 rounded-lg bg-surface-secondary px-3 py-2 text-xs leading-5 text-text-secondary">
                              <span className="font-semibold text-text-primary">Reflection: </span>
                              {item.reflection}
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
                            {attachments.map((attachment, index) => (
                              <AttachmentLink
                                key={`${item._id}-${attachment.fileId}`}
                                href={attachmentHref(courseId, item._id, attachment.fileId)}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                              >
                                <span className="truncate">
                                  {attachment.name || `File ${index + 1}`}
                                </span>
                                <ExternalLink className="size-3 shrink-0" />
                              </AttachmentLink>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!student?.userId || student.state !== 'active'}
                              onClick={() =>
                                setFeedbackTarget({
                                  title: `${readableCategory(item.kind)} feedback · ${item.title}`,
                                  workId: item._id,
                                  projectId: project._id,
                                  recipients: student
                                    ? [feedbackRecipient(student)]
                                    : [
                                        {
                                          key: item.studentId,
                                          name: 'Student unavailable',
                                          active: false,
                                        },
                                      ],
                                  defaultRecipientId: student?.userId,
                                })
                              }
                            >
                              <MessageSquareText className="size-3.5" />
                              Feedback
                            </Button>
                            {onAskAI && student?.userId && student.state === 'active' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onAskAI(
                                    `Review “${item.title}” by ${memberName(student)} and save clear feedback with concrete action items.`,
                                    `Use exact course ID ${courseId}, work ID ${item._id}, project ID ${project._id}, and student user ID ${student.userId}.`,
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
            <SectionTitle icon={Users} title="Students" count={members.length} />
            <div className="divide-y divide-border-light">
              {members.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No students added.</p>
              ) : (
                members.map((member) => (
                  <div key={memberId(member)} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-active-alt text-[10px] font-semibold text-text-secondary">
                      {memberInitials(member)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {memberName(member)}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {member.email}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </Surface>

          <Surface className="flex max-h-[22rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle icon={Clock3} title="Time" count={projectTime.length} />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {projectTime.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No time logged yet.</p>
              ) : (
                projectTime.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {entry.customCategory || readableCategory(entry.category)}
                      </p>
                      <Tag>{formatMinutes(entry.minutes)}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {memberName(peopleById.get(entry.studentId))} · {formatCourseDate(entry.date)}
                    </p>
                    {entry.description ? (
                      <p className="mt-2 text-sm leading-5 text-text-secondary">
                        {entry.description}
                      </p>
                    ) : null}
                    {entry.evidenceUrl ? (
                      <div className="mt-2">
                        <LinkButton
                          link={{ label: 'Evidence', url: entry.evidenceUrl }}
                          fallback="Evidence"
                        />
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </Surface>

          <Surface className="flex max-h-[22rem] min-h-0 flex-col overflow-hidden">
            <SectionTitle icon={Sparkles} title="AI use" count={projectAiUse.length} />
            <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {projectAiUse.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">No AI use has been recorded.</p>
              ) : (
                projectAiUse.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.tool}</p>
                      <Tag>{entry.reviewed ? 'Reviewed' : 'Not reviewed'}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {memberName(peopleById.get(entry.studentId))} · {formatCourseDate(entry.date)}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-text-secondary">{entry.task}</p>
                    {entry.learning ? (
                      <p className="mt-2 rounded-lg bg-surface-secondary px-3 py-2 text-xs leading-5 text-text-secondary">
                        <span className="font-semibold text-text-primary">Learning: </span>
                        {entry.learning}
                      </p>
                    ) : null}
                    {entry.evidenceUrl ? (
                      <div className="mt-2">
                        <LinkButton
                          link={{ label: 'AI evidence', url: entry.evidenceUrl }}
                          fallback="AI evidence"
                        />
                      </div>
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
              count={projectFeedback.length}
            />
            <div className="border-b border-border-light p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setFeedbackTarget({
                    title: `Overall feedback for ${project.title}`,
                    projectId: project._id,
                    recipients: projectRecipients,
                    allowAll: true,
                  })
                }
              >
                <MessageSquareText className="size-4" />
                Give project feedback
              </Button>
            </div>
            <div className="max-h-[24rem] divide-y divide-border-light overflow-y-auto [scrollbar-gutter:stable]">
              {projectFeedback.length === 0 ? (
                <p className="px-4 py-4 text-sm text-text-tertiary">
                  No feedback connected to this project.
                </p>
              ) : (
                projectFeedback.map((entry) => (
                  <article key={entry._id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag>{entry.authorType === 'teacher' ? 'Teacher' : 'AI'}</Tag>
                      {entry.visibility === 'teacher' ? <Tag>Private</Tag> : null}
                      <span className="text-xs text-text-tertiary">
                        {formatShortDate(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-text-tertiary">
                      {memberName(peopleById.get(entry.studentId))} ·{' '}
                      {entry.workId
                        ? workById.get(entry.workId)?.title || 'Work feedback'
                        : 'Project feedback'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
                      {entry.content}
                    </p>
                    {entry.actionItems.length > 0 ? (
                      <p className="mt-2 text-xs text-text-tertiary">
                        {entry.actionItems.filter((item) => item.status === 'open').length} open
                        action item
                        {entry.actionItems.filter((item) => item.status === 'open').length === 1
                          ? ''
                          : 's'}
                      </p>
                    ) : null}
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
