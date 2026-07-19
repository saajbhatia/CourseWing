/* eslint-disable i18next/no-literal-string */
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileBarChart,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Megaphone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { Button, Input, Textarea, useToastContext } from '@librechat/client';
import type {
  CourseMembership,
  CourseAiUse,
  CourseOverview,
  CoursePost,
  CourseTime,
  CourseWork,
} from 'librechat-data-provider';
import {
  useCourseAiUseQuery,
  useCourseFeedbackQuery,
  useCourseMembersQuery,
  useDeleteCourseMemberMutation,
  useCourseTimeQuery,
  useCourseWorkQuery,
} from '~/data-provider';
import { cn } from '~/utils';
import type { TeacherTab } from './navigation';
import {
  EmptyState,
  Field,
  PageHeader,
  Surface,
  Tag,
  formatMinutes,
  formatShortDate,
} from './student/ui';
import AssistantDrawer, { type CourseAssistantRequest } from './student/AssistantDrawer';
import TeacherCoursePage from './TeacherCoursePage';
import TeacherInviteStudentsDialog from './TeacherInviteStudentsDialog';
import TeacherProjectDetail from './TeacherProjectDetail';
import TeacherReportsPage from './TeacherReportsPage';
import TeacherReviewPage from './TeacherReviewPage';
import TeacherStudentDetail from './TeacherStudentDetail';

type PeopleModel = {
  byProject: Map<string, CourseMembership[]>;
  projectByStudent: Map<string, string>;
  projectsByStudent: Map<string, string[]>;
};

type AskCourseAI = (message?: string, privateContext?: string) => void;

function studentName(student: CourseMembership): string {
  return student.preferredName || student.email.split('@')[0] || student.email;
}

function studentId(student: CourseMembership): string {
  return student.userId || student._id;
}

function initials(student: CourseMembership): string {
  return studentName(student)
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function StudentAvatar({ student, small = false }: { student: CourseMembership; small?: boolean }) {
  return (
    <span
      title={studentName(student)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-active-alt font-semibold text-text-secondary',
        small ? 'size-7 text-[10px]' : 'size-9 text-xs',
      )}
    >
      {initials(student)}
    </span>
  );
}

function StudentStack({ students }: { students: CourseMembership[] }) {
  if (students.length === 0) {
    return <span className="text-xs text-text-tertiary">No students</span>;
  }
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {students.slice(0, 4).map((student) => (
          <span key={studentId(student)} className="rounded-full ring-2 ring-surface-secondary">
            <StudentAvatar student={student} small />
          </span>
        ))}
      </div>
      {students.length > 4 ? (
        <span className="ml-2 text-xs text-text-tertiary">+{students.length - 4}</span>
      ) : null}
    </div>
  );
}

function createPeopleModel(overview: CourseOverview, students: CourseMembership[]): PeopleModel {
  const byUserId = new Map(
    students
      .filter((student) => student.userId)
      .map((student) => [student.userId as string, student]),
  );
  const byEmail = new Map(
    students.map((student) => [student.normalizedEmail || student.email.toLowerCase(), student]),
  );
  const byProject = new Map<string, CourseMembership[]>();
  const projectByStudent = new Map<string, string>();
  const projectsByStudent = new Map<string, string[]>();

  overview.projects.forEach((project) => {
    const people = new Map<string, CourseMembership>();
    const team = overview.teams.find((item) => item._id === project.teamId);
    if (project.createdBy) {
      const creator = byUserId.get(project.createdBy);
      if (creator) {
        people.set(studentId(creator), creator);
      }
    }
    (team?.memberIds ?? []).forEach((id) => {
      const student = byUserId.get(id);
      if (student) {
        people.set(studentId(student), student);
      }
    });
    (project.collaboratorEmails ?? []).forEach((email) => {
      const student = byEmail.get(email.toLowerCase());
      if (student) {
        people.set(studentId(student), student);
      }
    });
    const projectStudents = [...people.values()];
    projectStudents.forEach((student) => {
      const id = studentId(student);
      if (!projectByStudent.has(id)) {
        projectByStudent.set(id, project.title);
      }
      projectsByStudent.set(id, [...(projectsByStudent.get(id) ?? []), project._id]);
    });
    byProject.set(project._id, projectStudents);
  });

  return { byProject, projectByStudent, projectsByStudent };
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof FolderKanban;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-light px-3 py-2.5">
      <Icon className="size-4 text-text-secondary" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {typeof count === 'number' ? (
        <span className="ml-auto text-xs text-text-tertiary">{count}</span>
      ) : null}
    </div>
  );
}

function ProjectRows({
  overview,
  people,
  work,
  onOpen,
}: {
  overview: CourseOverview;
  people: PeopleModel;
  work?: CourseWork[];
  onOpen: (projectId: string) => void;
}) {
  if (overview.projects.length === 0) {
    return <p className="px-3 py-4 text-sm text-text-tertiary">No projects yet.</p>;
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto">
      {overview.projects.map((project) => {
        const members = people.byProject.get(project._id) ?? [];
        const projectWork = (work ?? []).filter((item) => item.projectId === project._id);
        return (
          <div key={project._id} className="flex items-center gap-3 px-3 py-3">
            <button
              type="button"
              onClick={() => onOpen(project._id)}
              className="group flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-active-alt">
                <FolderKanban className="size-4 text-text-secondary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{project.title}</span>
                <span className="mt-0.5 block truncate text-xs text-text-tertiary">
                  {project.problem || `${projectWork.length} work records`}
                </span>
              </span>
              <StudentStack students={members} />
              <ChevronRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
            </button>
            {(project.links ?? [])
              .filter((link) => link?.url)
              .slice(0, 2)
              .map((link, index) => (
                <a
                  key={`${project._id}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.label || `Project link ${index + 1}`}
                  className="hidden items-center gap-1 rounded-lg border border-border-medium px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary sm:flex"
                >
                  <span className="max-w-20 truncate">{link.label || 'Link'}</span>
                  <ExternalLink className="size-3" />
                </a>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function CourseAnalytics({
  overview,
  students,
  work,
  time,
  aiUse,
  onNavigate,
}: {
  overview: CourseOverview;
  students: CourseMembership[];
  work: CourseWork[];
  time: CourseTime[];
  aiUse: CourseAiUse[];
  onNavigate: (tab: TeacherTab) => void;
}) {
  const minutes = time.reduce((total, entry) => total + (Number(entry.minutes) || 0), 0);
  const statistics = [
    {
      label: 'Projects',
      value: overview.projects.length,
      icon: FolderKanban,
      target: 'projects' as const,
    },
    { label: 'Students', value: students.length, icon: Users, target: 'students' as const },
    {
      label: 'Research',
      value: work.filter((item) => item.kind === 'paper').length,
      icon: BookOpen,
      target: 'review' as const,
    },
    {
      label: 'Presentations',
      value: work.filter((item) => item.kind === 'presentation').length,
      icon: FileText,
      target: 'review' as const,
    },
    {
      label: 'Time logged',
      value: formatMinutes(minutes),
      icon: Clock3,
      target: 'students' as const,
    },
    {
      label: 'AI use',
      value: aiUse.length,
      icon: ClipboardCheck,
      target: 'students' as const,
    },
  ];

  return (
    <Surface className="grid overflow-hidden bg-surface-secondary shadow-sm sm:grid-cols-3 xl:grid-cols-6">
      {statistics.map(({ label, value, icon: Icon, target }) => (
        <button
          key={label}
          type="button"
          onClick={() => onNavigate(target)}
          className="flex items-center gap-3 border-b border-border-light px-3 py-3 text-left last:border-b-0 hover:bg-surface-hover xl:border-b-0 xl:border-r xl:last:border-r-0 sm:[&:nth-child(-n+3)]:border-b"
        >
          <Icon className="size-4 shrink-0 text-text-secondary" />
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-5">{value}</span>
            <span className="block truncate text-xs text-text-tertiary">{label}</span>
          </span>
        </button>
      ))}
    </Surface>
  );
}

function RecentWork({
  overview,
  students,
  work,
  onOpen,
}: {
  overview: CourseOverview;
  students: CourseMembership[];
  work: CourseWork[];
  onOpen: () => void;
}) {
  const recent = [...work]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 4);
  const studentsById = new Map(
    students.flatMap((student) => {
      const ids = [student._id];
      if (student.userId) {
        ids.push(student.userId);
      }
      return ids.map((id) => [id, student] as const);
    }),
  );
  const projectsById = new Map(overview.projects.map((project) => [project._id, project]));

  return (
    <Surface className="flex min-h-0 flex-col overflow-hidden bg-surface-secondary shadow-sm">
      <SectionHeader icon={FileText} title="Recent work" count={work.length} />
      <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto">
        {recent.length === 0 ? (
          <p className="px-3 py-4 text-sm text-text-tertiary">No work shared yet.</p>
        ) : (
          recent.map((item) => {
            const Icon = workIcon(item.kind);
            const student = studentsById.get(item.studentId);
            const project = item.projectId ? projectsById.get(item.projectId) : undefined;
            const source = (item.links ?? []).find((link) => link?.url);
            return (
              <article key={item._id} className="flex items-center gap-3 px-3 py-3">
                <button
                  type="button"
                  onClick={onOpen}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-active-alt">
                    <Icon className="size-4 text-text-secondary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-text-tertiary">
                      {[student ? studentName(student) : undefined, project?.title, item.kind]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {item.description ? (
                      <span className="mt-1 block truncate text-xs text-text-secondary">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden shrink-0 text-xs text-text-tertiary sm:block">
                    {formatShortDate(item.updatedAt)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-text-tertiary" />
                </button>
                {source ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    title={source.label || 'Open source'}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </Surface>
  );
}

function TeacherDashboard({
  overview,
  students,
  people,
  work,
  time,
  aiUse,
  onNavigate,
  onOpenProject,
  onOpenStudent,
}: {
  overview: CourseOverview;
  students: CourseMembership[];
  people: PeopleModel;
  work: CourseWork[];
  time: CourseTime[];
  aiUse: CourseAiUse[];
  onNavigate: (tab: TeacherTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenStudent: (studentId: string) => void;
}) {
  const datedPosts = overview.posts
    .filter((post) => post.kind === 'deadline' || post.kind === 'schedule')
    .slice(0, 4);

  return (
    <div className="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:space-y-0">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => onNavigate('students')}>
              <Users className="size-4" />
              Students
            </Button>
            <Button type="button" variant="submit" onClick={() => onNavigate('course')}>
              <Plus className="size-4" />
              New update
            </Button>
          </>
        }
      />

      <CourseAnalytics
        overview={overview}
        students={students}
        work={work}
        time={time}
        aiUse={aiUse}
        onNavigate={onNavigate}
      />

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Surface className="flex min-h-0 flex-col overflow-hidden bg-surface-secondary shadow-sm">
          <SectionHeader icon={FolderKanban} title="Projects" count={overview.projects.length} />
          <ProjectRows overview={overview} people={people} work={work} onOpen={onOpenProject} />
        </Surface>

        <Surface className="flex min-h-0 flex-col overflow-hidden bg-surface-secondary shadow-sm">
          <SectionHeader icon={Users} title="Students" count={students.length} />
          <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto">
            {students.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-tertiary">No students yet.</p>
            ) : (
              students.map((student) => {
                const pending = student.state === 'pending';
                return (
                  <button
                    key={studentId(student)}
                    type="button"
                    disabled={pending}
                    onClick={() => onOpenStudent(studentId(student))}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left enabled:hover:bg-surface-hover disabled:cursor-default"
                  >
                    <StudentAvatar student={student} small />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {studentName(student)}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {pending
                          ? 'Invited — account not created'
                          : people.projectByStudent.get(studentId(student)) || 'No project'}
                      </span>
                    </span>
                    {pending ? (
                      <Tag>Invited</Tag>
                    ) : (
                      <ChevronRight className="size-4 text-text-tertiary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          {students.length > 0 ? (
            <button
              type="button"
              onClick={() => onNavigate('students')}
              className="w-full shrink-0 border-t border-border-light px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              View students
            </button>
          ) : null}
        </Surface>

        <RecentWork
          overview={overview}
          students={students}
          work={work}
          onOpen={() => onNavigate('review')}
        />

        <Surface className="flex min-h-0 flex-col overflow-hidden bg-surface-secondary shadow-sm">
          <SectionHeader icon={CalendarDays} title="Coming up" count={datedPosts.length} />
          <div className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto">
            {datedPosts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-tertiary">Nothing scheduled.</p>
            ) : (
              datedPosts.map((post) => (
                <button
                  key={post._id}
                  type="button"
                  onClick={() => onNavigate('course')}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover"
                >
                  <CalendarDays className="size-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{post.title}</span>
                    <span className="mt-0.5 block text-xs text-text-tertiary">
                      {formatShortDate(post.dueAt || post.startsAt || post.publishedAt)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-text-tertiary" />
                </button>
              ))
            )}
          </div>
          {datedPosts.length > 0 ? (
            <button
              type="button"
              onClick={() => onNavigate('course')}
              className="w-full shrink-0 border-t border-border-light px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              View course
            </button>
          ) : null}
        </Surface>
      </div>
    </div>
  );
}

function TeacherProjects({
  overview,
  people,
  work,
  onOpenProject,
  onOpenStudent,
}: {
  overview: CourseOverview;
  people: PeopleModel;
  work: CourseWork[];
  onOpenProject: (projectId: string) => void;
  onOpenStudent: (studentId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <PageHeader title="Projects" />

      <div className="flex justify-end">
        <label className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-9" placeholder="Search projects" aria-label="Search projects" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {overview.projects.map((project) => {
          const projectStudents = people.byProject.get(project._id) ?? [];
          const projectWork = work.filter((item) => item.projectId === project._id);
          return (
            <Surface key={project._id} className="overflow-hidden bg-surface-secondary shadow-sm">
              <button
                type="button"
                onClick={() => onOpenProject(project._id)}
                className="group flex w-full items-start gap-3 border-b border-border-light px-4 py-3 text-left hover:bg-surface-hover"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-active-alt">
                  <FolderKanban className="size-4 text-text-secondary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{project.title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-4 text-text-secondary">
                    {project.problem || 'No project description yet.'}
                  </span>
                  <span className="mt-2 block text-xs text-text-tertiary">
                    {projectStudents.length} student{projectStudents.length === 1 ? '' : 's'} ·{' '}
                    {projectWork.length} work record{projectWork.length === 1 ? '' : 's'}
                  </span>
                </span>
                <ChevronRight className="mt-1 size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
              </button>
              <div className="divide-y divide-border-light">
                {projectStudents.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-text-tertiary">No students added.</p>
                ) : (
                  projectStudents.map((student) => (
                    <button
                      key={studentId(student)}
                      type="button"
                      disabled={student.state === 'pending'}
                      onClick={() => onOpenStudent(studentId(student))}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-surface-hover disabled:cursor-default"
                    >
                      <StudentAvatar student={student} small />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {studentName(student)}
                      </span>
                      {student.state === 'pending' ? (
                        <Tag>Invited</Tag>
                      ) : (
                        <ChevronRight className="size-4 text-text-tertiary" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </Surface>
          );
        })}
        {overview.projects.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Projects created in the student workspace will appear here."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeacherStudents({
  courseId,
  courseName,
  students,
  people,
  work,
  onOpenStudent,
}: {
  courseId: string;
  courseName: string;
  students: CourseMembership[];
  people: PeopleModel;
  work: CourseWork[];
  onOpenStudent: (studentId: string) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { showToast } = useToastContext();
  const removeStudent = useDeleteCourseMemberMutation(courseId);

  const handleRemove = async (student: CourseMembership) => {
    const name = studentName(student);
    if (
      !window.confirm(
        `Remove ${name} from this course? Their account and submitted work will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await removeStudent.mutateAsync(student._id);
      showToast({ message: `${name} was removed from the course.`, status: 'success' });
    } catch {
      showToast({ message: `${name} could not be removed.`, status: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        actions={
          <Button type="button" variant="submit" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" />
            Share join link
          </Button>
        }
      />

      <div className="flex justify-end">
        <label className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-9" placeholder="Search students" aria-label="Search students" />
        </label>
      </div>

      <Surface className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_5rem_6rem_8rem] border-b border-border-light bg-surface-secondary px-4 py-2.5 text-xs font-semibold text-text-tertiary sm:grid">
          <span>Student</span>
          <span>Projects</span>
          <span className="text-right">Work</span>
          <span className="text-right">Status</span>
          <span />
        </div>
        <div className="divide-y divide-border-light">
          {students.map((student) => {
            const id = studentId(student);
            const pending = student.state === 'pending';
            const projectIds = people.projectsByStudent.get(id) ?? [];
            let projectLabel = 'No project';
            if (projectIds.length === 1) {
              projectLabel = people.projectByStudent.get(id) || '1 project';
            } else if (projectIds.length > 1) {
              projectLabel = `${projectIds.length} projects`;
            }
            const workCount = work.filter(
              (item) => item.studentId === id || item.studentId === student._id,
            ).length;
            const studentCells = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <StudentAvatar student={student} small />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {studentName(student)}
                    </span>
                    <span className="block truncate text-xs text-text-tertiary">
                      {student.email}
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-sm text-text-secondary sm:block">
                  {projectLabel}
                </span>
                <span className="hidden text-right text-sm text-text-secondary sm:block">
                  {workCount}
                </span>
                <span className="hidden text-right sm:block">
                  <Tag>{pending ? 'Invited' : 'Active'}</Tag>
                </span>
              </>
            );

            return (
              <div
                key={id}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_5rem_6rem_8rem] sm:gap-0"
              >
                {studentCells}
                <span className="flex items-center justify-end gap-1">
                  {!pending ? (
                    <button
                      type="button"
                      onClick={() => onOpenStudent(id)}
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                    >
                      View
                      <ChevronRight className="size-4 text-text-tertiary" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${studentName(student)}`}
                    disabled={removeStudent.isLoading}
                    onClick={() => handleRemove(student)}
                    className="rounded-md p-1.5 text-text-tertiary hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </div>
            );
          })}
          {students.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-tertiary">No students yet.</p>
          ) : null}
        </div>
      </Surface>

      <TeacherInviteStudentsDialog
        courseId={courseId}
        courseName={courseName}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
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

function TeacherReview({
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
  onAskAI: AskCourseAI;
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected = work.find((item) => item._id === selectedId) ?? work[0];
  if (courseId) {
    return (
      <TeacherReviewPage
        courseId={courseId}
        work={work}
        students={students}
        initialWorkId={initialWorkId}
        onAskAI={onAskAI}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Review" />

      {work.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No work to review"
          description="Student presentations, papers, and project updates will appear here."
        />
      ) : (
        <Surface className="grid min-h-[36rem] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <section className="border-b border-border-light bg-surface-secondary lg:border-b-0 lg:border-r">
            <SectionHeader icon={ClipboardCheck} title="Shared work" count={work.length} />
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
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 border-b border-border-light p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Tag>{selected.kind}</Tag>
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
                <Tag>{(selected.fileIds ?? []).length} files</Tag>
              ) : null}
              {(selected.links ?? []).length > 0 ? (
                <Tag>{(selected.links ?? []).length} links</Tag>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col bg-surface-secondary p-4">
            <div>
              <h3 className="text-sm font-semibold">Feedback</h3>
              <p className="mt-1 text-xs text-text-tertiary">
                Saved privately until you publish it.
              </p>
            </div>
            <Textarea className="mt-4 min-h-40 bg-surface-primary" placeholder="Write feedback…" />
            <Textarea
              className="mt-3 min-h-24 bg-surface-primary"
              placeholder="Action items, one per line…"
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" />
              Private note
            </label>
            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              <Button type="button" variant="outline">
                Save draft
              </Button>
              <Button type="button" variant="submit">
                Publish
              </Button>
            </div>
          </aside>
        </Surface>
      )}
    </div>
  );
}

function TeacherReports({
  courseId,
  students,
  people,
  onAskAI,
}: {
  courseId: string;
  students: CourseMembership[];
  people: PeopleModel;
  onAskAI: AskCourseAI;
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected = students.find((student) => studentId(student) === selectedId) ?? students[0];
  if (courseId) {
    return (
      <TeacherReportsPage
        courseId={courseId}
        students={students}
        people={people}
        onAskAI={onAskAI}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" />

      {students.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No student reports"
          description="Student reports will appear after students join the course."
        />
      ) : (
        <Surface className="grid min-h-[36rem] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)]">
          <section className="border-b border-border-light bg-surface-secondary lg:border-b-0 lg:border-r">
            <SectionHeader icon={Users} title="Students" count={students.length} />
            <div className="max-h-64 divide-y divide-border-light overflow-y-auto lg:max-h-[33rem]">
              {students.map((student, index) => (
                <button
                  key={studentId(student)}
                  type="button"
                  onClick={() => setSelectedId(studentId(student))}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover',
                    selected && studentId(selected) === studentId(student) && 'bg-surface-primary',
                  )}
                >
                  <StudentAvatar student={student} small />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {studentName(student)}
                    </span>
                    <span className="block truncate text-xs text-text-tertiary">
                      {people.projectByStudent.get(studentId(student)) || 'No project'}
                    </span>
                  </span>
                  {index < 2 ? <Tag>Draft</Tag> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{studentName(selected)}</h2>
                  <Tag>Draft</Tag>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {people.projectByStudent.get(studentId(selected)) || 'No project'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline">
                  Generate draft
                </Button>
                <Button type="button" variant="submit">
                  Release
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {['Project and learning', 'Strengths', 'Risks and next steps'].map((title) => (
                <label key={title} className="block">
                  <span className="text-sm font-medium">{title}</span>
                  <Textarea className="mt-1.5 min-h-28" />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="outline">
                Save draft
              </Button>
            </div>
          </section>
        </Surface>
      )}
    </div>
  );
}

function PostIcon({ kind }: { kind: CoursePost['kind'] }) {
  if (kind === 'announcement') {
    return <Bell className="size-4 text-text-secondary" />;
  }
  if (kind === 'deadline') {
    return <CalendarDays className="size-4 text-text-secondary" />;
  }
  if (kind === 'schedule') {
    return <Clock3 className="size-4 text-text-secondary" />;
  }
  return <BookOpen className="size-4 text-text-secondary" />;
}

const coursePostTypes: Array<{
  kind: CoursePost['kind'];
  label: string;
  icon: typeof Bell;
}> = [
  { kind: 'announcement', label: 'Announcement', icon: Bell },
  { kind: 'deadline', label: 'Do by', icon: CalendarDays },
  { kind: 'resource', label: 'Resource', icon: BookOpen },
  { kind: 'schedule', label: 'Schedule', icon: Clock3 },
];

function CourseComposer({ kind }: { kind: CoursePost['kind'] }) {
  if (kind === 'announcement') {
    return (
      <div className="space-y-4">
        <Field label="Announcement title">
          <Input placeholder="What is the announcement about?" />
        </Field>
        <Field label="Message">
          <Textarea rows={6} placeholder="Write the announcement for students" />
        </Field>
        <Field label="Link" hint="Optional">
          <Input type="url" placeholder="https://" />
        </Field>
        <Button type="button" variant="submit" className="w-full">
          <Bell className="size-4" />
          Publish announcement
        </Button>
      </div>
    );
  }

  if (kind === 'deadline') {
    return (
      <div className="space-y-4">
        <Field label="What should be done?">
          <Input placeholder="e.g. Finish the project outline" />
        </Field>
        <Field label="Instructions">
          <Textarea rows={4} placeholder="Add the details students need" />
        </Field>
        <Field label="Due date and time">
          <Input type="datetime-local" />
        </Field>
        <Field label="Resource link" hint="Optional">
          <Input type="url" placeholder="https://" />
        </Field>
        <Button type="button" variant="submit" className="w-full">
          <CalendarDays className="size-4" />
          Publish deadline
        </Button>
      </div>
    );
  }

  if (kind === 'resource') {
    return (
      <div className="space-y-4">
        <Field label="Resource title">
          <Input placeholder="Name this resource" />
        </Field>
        <Field label="Resource link">
          <Input type="url" placeholder="https://" />
        </Field>
        <Field label="Note" hint="Optional">
          <Textarea rows={4} placeholder="Explain how students should use it" />
        </Field>
        <Button type="button" variant="submit" className="w-full">
          <BookOpen className="size-4" />
          Share resource
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Session or event">
        <Input placeholder="e.g. Project check-in" />
      </Field>
      <Field label="Starts">
        <Input type="datetime-local" />
      </Field>
      <Field label="Details">
        <Textarea rows={4} placeholder="Add an agenda, location, or preparation notes" />
      </Field>
      <Field label="Meeting or location link" hint="Optional">
        <Input type="url" placeholder="https://" />
      </Field>
      <Button type="button" variant="submit" className="w-full">
        <Clock3 className="size-4" />
        Add to schedule
      </Button>
    </div>
  );
}

function coursePostLabel(kind: CoursePost['kind']): string {
  return coursePostTypes.find((item) => item.kind === kind)?.label ?? kind;
}

function coursePostDate(post: CoursePost): string {
  if (post.kind === 'deadline') {
    return `Due ${formatShortDate(post.dueAt || post.publishedAt)}`;
  }
  if (post.kind === 'schedule') {
    return `Starts ${formatShortDate(post.startsAt || post.publishedAt)}`;
  }
  return formatShortDate(post.publishedAt);
}

function TeacherCourse({
  courseId,
  overview,
  onAskAI,
}: {
  courseId: string;
  overview: CourseOverview;
  onAskAI: AskCourseAI;
}) {
  const [kind, setKind] = useState<CoursePost['kind']>('deadline');
  const [feedFilter, setFeedFilter] = useState<'all' | CoursePost['kind']>('all');
  const visiblePosts =
    feedFilter === 'all'
      ? overview.posts
      : overview.posts.filter((post) => post.kind === feedFilter);
  const feedFilters: Array<{ id: 'all' | CoursePost['kind']; label: string }> = [
    { id: 'all', label: 'All' },
    ...coursePostTypes.map((item) => ({ id: item.kind, label: item.label })),
  ];
  if (courseId) {
    return <TeacherCoursePage courseId={courseId} overview={overview} onAskAI={onAskAI} />;
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Course" />

      <div className="grid items-start gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
        <Surface className="overflow-hidden">
          <SectionHeader icon={Plus} title="Add to course" />
          <div className="grid grid-cols-2 gap-2 border-b border-border-light p-3">
            {coursePostTypes.map(({ kind: optionKind, label, icon: Icon }) => (
              <button
                key={optionKind}
                type="button"
                onClick={() => setKind(optionKind)}
                aria-pressed={kind === optionKind}
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
            <CourseComposer kind={kind} />
          </div>
        </Surface>

        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader icon={Megaphone} title="Course feed" count={visiblePosts.length} />
          <div className="overflow-x-auto border-b border-border-light px-3 py-2">
            <div className="flex w-max gap-1">
              {feedFilters.map((filter) => (
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
              visiblePosts.map((post) => (
                <article key={post._id} className="flex gap-3 px-4 py-4">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                    <PostIcon kind={post.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {post.title}
                      </h3>
                      <Tag>{coursePostLabel(post.kind)}</Tag>
                    </div>
                    {post.body ? (
                      <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-text-secondary">
                        {post.body}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-xs text-text-tertiary">{coursePostDate(post)}</span>
                      {(post.links ?? [])
                        .filter((link) => link?.url)
                        .slice(0, 2)
                        .map((link, index) => (
                          <a
                            key={`${post._id}-${link.url}`}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                          >
                            {link.label || `Open link ${index + 1}`}
                            <ExternalLink className="size-3" />
                          </a>
                        ))}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}

export default function TeacherWorkspace({
  courseId,
  overview,
  tab,
  projectId,
  studentId: selectedStudentId,
  onNavigate,
  onOpenProject,
  onOpenStudent,
}: {
  courseId: string;
  overview: CourseOverview;
  tab: TeacherTab;
  projectId?: string;
  studentId?: string;
  onNavigate: (tab: TeacherTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenStudent: (studentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: members = [] } = useCourseMembersQuery(courseId);
  const { data: work = [] } = useCourseWorkQuery(courseId, { limit: 100 });
  const { data: time = [] } = useCourseTimeQuery(courseId);
  const { data: aiUse = [] } = useCourseAiUseQuery(courseId);
  const { data: feedback = [] } = useCourseFeedbackQuery(courseId);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantRequest, setAssistantRequest] = useState<CourseAssistantRequest>();
  const refreshCourseData = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) => queryKey[1] === courseId,
    });
  }, [courseId, queryClient]);
  const askAI: AskCourseAI = useCallback((message, privateContext) => {
    setAssistantRequest(message ? { message, privateContext } : undefined);
    setAssistantOpen(true);
  }, []);
  const students = useMemo(
    () => members.filter((member) => member.role === 'student' && member.state !== 'removed'),
    [members],
  );
  const people = useMemo(() => createPeopleModel(overview, students), [overview, students]);
  const navigation = useMemo(
    () => [
      { id: 'overview' as const, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'course' as const, label: 'Course', icon: Megaphone },
      { id: 'projects' as const, label: 'Projects', icon: FolderKanban },
      { id: 'students' as const, label: 'Students', icon: Users },
      { id: 'review' as const, label: 'Review', icon: ClipboardCheck },
      { id: 'reports' as const, label: 'Reports', icon: FileBarChart },
    ],
    [],
  );
  const selectedProject = overview.projects.find((project) => project._id === projectId);
  const selectedStudent = students.find(
    (student) =>
      studentId(student) === selectedStudentId ||
      student._id === selectedStudentId ||
      student.userId === selectedStudentId,
  );
  let activePage = navigation.find((item) => item.id === tab)?.label || 'Dashboard';
  if (tab === 'project') {
    activePage = selectedProject?.title || 'Project';
  } else if (tab === 'student') {
    activePage = selectedStudent ? studentName(selectedStudent) : 'Student';
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-primary text-text-primary">
      <header className="shrink-0 border-b border-border-light px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{overview.course.name}</h1>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              Teaching team · {activePage}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => askAI()}>
            <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
            Ask AI
          </Button>
        </div>
      </header>

      <nav className="shrink-0 overflow-x-auto border-b border-border-light px-3 py-2 md:hidden">
        <div className="flex w-max gap-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                tab === id
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:py-5">
        <div className="mx-auto h-full w-full max-w-7xl">
          {tab === 'overview' ? (
            <TeacherDashboard
              overview={overview}
              students={students}
              people={people}
              work={work}
              time={time}
              aiUse={aiUse}
              onNavigate={onNavigate}
              onOpenProject={onOpenProject}
              onOpenStudent={onOpenStudent}
            />
          ) : null}
          {tab === 'projects' ? (
            <TeacherProjects
              overview={overview}
              people={people}
              work={work}
              onOpenProject={onOpenProject}
              onOpenStudent={onOpenStudent}
            />
          ) : null}
          {tab === 'project' ? (
            <TeacherProjectDetail
              courseId={courseId}
              overview={overview}
              projectId={projectId}
              members={projectId ? (people.byProject.get(projectId) ?? []) : []}
              work={work}
              time={time}
              aiUse={aiUse}
              feedback={feedback}
              onBack={() => onNavigate('projects')}
              onOpenReview={() => onNavigate('review')}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'students' ? (
            <TeacherStudents
              courseId={courseId}
              courseName={overview.course.name}
              students={students}
              people={people}
              work={work}
              onOpenStudent={onOpenStudent}
            />
          ) : null}
          {tab === 'student' ? (
            <TeacherStudentDetail
              courseId={courseId}
              student={selectedStudent}
              projects={overview.projects.filter((project) =>
                selectedStudent
                  ? (people.projectsByStudent.get(studentId(selectedStudent)) ?? []).includes(
                      project._id,
                    )
                  : false,
              )}
              work={work}
              time={time}
              aiUse={aiUse}
              feedback={feedback}
              onBack={() => onNavigate('students')}
              onOpenProject={onOpenProject}
              onOpenReview={() => onNavigate('review')}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'review' ? (
            <TeacherReview courseId={courseId} work={work} students={students} onAskAI={askAI} />
          ) : null}
          {tab === 'reports' ? (
            <TeacherReports
              courseId={courseId}
              students={students}
              people={people}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'course' ? (
            <TeacherCourse courseId={courseId} overview={overview} onAskAI={askAI} />
          ) : null}
        </div>
      </div>

      <AssistantDrawer
        open={assistantOpen}
        courseId={courseId}
        courseName={overview.course.name}
        projectId={tab === 'project' ? projectId : undefined}
        projectName={tab === 'project' ? selectedProject?.title : undefined}
        context={activePage}
        assistantRole="teacher"
        initialPrompt={assistantRequest}
        onInitialPromptConsumed={() => setAssistantRequest(undefined)}
        onCourseDataChanged={refreshCourseData}
        onOpenChange={(open) => {
          setAssistantOpen(open);
          if (!open) {
            refreshCourseData();
          }
        }}
      />
    </main>
  );
}
