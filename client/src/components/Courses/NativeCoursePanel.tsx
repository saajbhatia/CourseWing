/* eslint-disable i18next/no-literal-string */
import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  FolderKanban,
  Home,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogTemplate,
  OGDialogTrigger,
  Spinner,
  useToastContext,
} from '@librechat/client';
import { useCourseOverviewQuery, useDeleteCourseMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { StudentTab, TeacherTab } from './navigation';
import { isStudentTab, isTeacherTab } from './navigation';

export default function NativeCoursePanel({ toggleNav }: { toggleNav: () => void }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { courseId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: overview, isLoading } = useCourseOverviewQuery(courseId);
  const deleteCourse = useDeleteCourseMutation();
  const { showToast } = useToastContext();

  const teacherNavigation = useMemo(
    () => [
      {
        id: 'overview' as TeacherTab,
        label: localize('com_course_teacher_dashboard'),
        icon: LayoutDashboard,
      },
      {
        id: 'course' as TeacherTab,
        label: localize('com_course_teacher_course'),
        icon: Megaphone,
      },
      { id: 'projects' as TeacherTab, label: 'Projects', icon: FolderKanban },
      { id: 'students' as TeacherTab, label: localize('com_course_students'), icon: Users },
      { id: 'review' as TeacherTab, label: localize('com_course_review'), icon: ClipboardCheck },
      { id: 'reports' as TeacherTab, label: localize('com_course_reports'), icon: FileBarChart },
    ],
    [localize],
  );
  const studentNavigation = useMemo(
    () => [
      { id: 'home' as StudentTab, label: 'Course Home', icon: Home },
      { id: 'project' as StudentTab, label: 'Overview', icon: LayoutDashboard },
      {
        id: 'portfolio' as StudentTab,
        label: 'Work',
        icon: BriefcaseBusiness,
      },
      { id: 'papers' as StudentTab, label: 'Research', icon: BookOpen },
      { id: 'time' as StudentTab, label: 'Time', icon: Clock3 },
      { id: 'ai-use' as StudentTab, label: 'AI Use', icon: Sparkles },
      {
        id: 'feedback' as StudentTab,
        label: 'Feedback',
        icon: MessageSquareText,
      },
      {
        id: 'reports' as StudentTab,
        label: 'Reports',
        icon: FileBarChart,
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5 text-text-secondary" />
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const isTeacher = overview.membership.role === 'teacher';
  const primaryProject = overview.projects[0];
  const selectedProjectId = searchParams.get('project') || primaryProject?._id;
  const studentProjects = overview.projects.map((project) => ({
    id: project._id,
    title: project.title,
  }));
  const selectedProject =
    studentProjects.find((project) => project.id === selectedProjectId) ?? studentProjects[0];
  const navigation = isTeacher ? teacherNavigation : studentNavigation;
  const requestedView = searchParams.get('view');
  let activeView: StudentTab | TeacherTab;
  if (isTeacher) {
    activeView = isTeacherTab(requestedView) ? requestedView : 'overview';
  } else if (isStudentTab(requestedView)) {
    activeView = requestedView;
  } else if (requestedView !== 'profile' && searchParams.has('project')) {
    activeView = 'project';
  } else {
    activeView = 'home';
  }
  const isCourseHome = !isTeacher && activeView === 'home';
  const isCourseLevel = !isTeacher && (activeView === 'home' || activeView === 'reports');
  const panelTitle =
    isTeacher || isCourseLevel
      ? overview.course.name
      : selectedProject?.title || 'Choose a project';
  let panelSubtitle = overview.course.name;
  if (isTeacher) {
    panelSubtitle = localize('com_course_role_teacher');
  } else if (isCourseLevel) {
    panelSubtitle = activeView === 'reports' ? 'Course reports' : 'Course home';
  }

  const setView = (view: StudentTab | TeacherTab) => {
    const next = new URLSearchParams(searchParams);
    if (!isTeacher && (view === 'home' || view === 'reports')) {
      next.set('view', view);
      next.delete('project');
      next.delete('createProject');
    } else if (isTeacher && view === 'overview') {
      next.delete('view');
      next.delete('project');
      next.delete('student');
    } else if (isTeacher && view !== 'project' && view !== 'student') {
      next.set('view', view);
      next.delete('project');
      next.delete('student');
    } else if (!isTeacher && view === 'project') {
      next.set('view', 'project');
    } else {
      next.set('view', view);
    }
    setSearchParams(next);
    toggleNav();
  };

  const openStudentProject = (projectId: string, createProject = false) => {
    const next = new URLSearchParams(searchParams);
    if (projectId) {
      next.set('project', projectId);
    }
    next.set('view', 'project');
    if (createProject) {
      next.set('createProject', '1');
    } else {
      next.delete('createProject');
    }
    setSearchParams(next);
    toggleNav();
  };

  const confirmCourseDelete = () => {
    if (deleteCourse.isLoading) {
      return;
    }
    deleteCourse.mutate(courseId, {
      onSuccess: () => {
        showToast({ message: localize('com_course_deleted'), status: 'success' });
        navigate('/c/new');
        toggleNav();
      },
      onError: () => {
        showToast({ message: localize('com_course_delete_error'), status: 'error' });
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-3 pt-2 text-sm">
      <button
        type="button"
        onClick={() => {
          navigate('/c/new');
          toggleNav();
        }}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        {localize('com_ui_back_to_home')}
      </button>

      <button
        type="button"
        disabled={isTeacher}
        onClick={() => setView('home')}
        className="mt-2 flex min-w-0 items-center gap-2.5 border-b border-border-light px-2 pb-4 pt-2 text-left disabled:cursor-default"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-active-alt">
          {isTeacher || isCourseLevel ? (
            <BookOpen className="size-4 text-text-secondary" aria-hidden="true" />
          ) : (
            <FolderKanban className="size-4 text-text-secondary" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-text-primary">{panelTitle}</span>
          <span className="block text-xs text-text-tertiary">{panelSubtitle}</span>
        </span>
      </button>

      <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {isCourseHome ? (
          <>
            <button
              type="button"
              onClick={() => setView('home')}
              className="flex w-full items-center gap-2.5 rounded-lg bg-surface-active-alt px-3 py-2 text-left text-sm font-medium text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
            >
              <Home className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Course Home</span>
            </button>
            <button
              type="button"
              onClick={() => setView('reports')}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
            >
              <FileBarChart className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Reports</span>
            </button>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Projects
            </p>
            {studentProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openStudentProject(project.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
              >
                <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{project.title}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => openStudentProject(selectedProject?.id ?? '', true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">New project</span>
            </button>
          </>
        ) : (
          navigation
            .filter(({ id }) => isTeacher || id === 'home' || id === 'reports' || selectedProject)
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
                  activeView === id
                    ? 'bg-surface-active-alt text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            ))
        )}
      </nav>
      {isTeacher ? (
        <OGDialog>
          <OGDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full justify-start gap-2 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              disabled={deleteCourse.isLoading}
            >
              <Trash2 className="size-4 shrink-0" aria-hidden="true" />
              {localize('com_course_delete_course')}
            </Button>
          </OGDialogTrigger>
          <OGDialogTemplate
            showCloseButton={false}
            title={localize('com_course_delete_course')}
            className="max-w-[470px]"
            main={
              <p className="text-left text-sm leading-6 text-text-primary">
                {localize('com_course_delete_course_confirm', { 0: overview.course.name })}
              </p>
            }
            selection={{
              selectHandler: confirmCourseDelete,
              selectClasses: 'bg-surface-destructive hover:bg-surface-destructive-hover text-white',
              selectText: localize('com_course_delete_course'),
            }}
          />
        </OGDialog>
      ) : null}
    </div>
  );
}
