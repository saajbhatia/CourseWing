/* eslint-disable i18next/no-literal-string */
import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { AlertCircle, ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react';
import type { CourseAccess } from 'librechat-data-provider';
import CourseCreateDialog from '~/components/Courses/CourseCreateDialog';
import { useCourseOverviewQuery, useCoursesQuery } from '~/data-provider';
import { useAuthContext, useLocalize, useLocalStorage } from '~/hooks';
import { cn } from '~/utils';

type CoursesSectionProps = {
  toggleNav: () => void;
};

const iconButtonClassName =
  'flex size-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

function courseInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'C';
}

function courseColor(id: string): { background: string; foreground: string } {
  const hue = [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
  return {
    background: `hsl(${hue} 58% 90%)`,
    foreground: `hsl(${hue} 48% 28%)`,
  };
}

function StudentCourseProjects({
  access,
  onOpen,
}: {
  access: CourseAccess;
  onOpen: (url: string) => void;
}) {
  const { data: overview, isLoading } = useCourseOverviewQuery(access.course._id);
  const actualProjects = overview?.projects ?? [];
  const projects = actualProjects.map((project) => ({ id: project._id, title: project.title }));
  const color = courseColor(access.course._id);

  return (
    <li className="list-none py-1">
      <button
        type="button"
        onClick={() => onOpen(`/workspace/courses/${access.course._id}?view=home`)}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-bold"
          style={{ backgroundColor: color.background, color: color.foreground }}
          aria-hidden="true"
        >
          {courseInitial(access.course.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-tertiary">
          {access.course.name}
        </span>
      </button>

      <ul className="ml-4 list-none border-l border-border-light pl-2">
        {isLoading ? (
          <li className="flex h-8 items-center px-2">
            <Spinner className="size-3.5 text-text-tertiary" />
          </li>
        ) : (
          projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() =>
                  onOpen(
                    `/workspace/courses/${access.course._id}?project=${encodeURIComponent(project.id)}`,
                  )
                }
                className="group flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
              >
                <FolderKanban className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{project.title}</span>
                <ChevronRight
                  className="size-3.5 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))
        )}
        <li>
          <button
            type="button"
            aria-label={`Create project in ${access.course.name}`}
            onClick={() =>
              onOpen(`/workspace/courses/${access.course._id}?view=project&createProject=1`)
            }
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New project
          </button>
        </li>
      </ul>
    </li>
  );
}

function CoursesSection({ toggleNav }: CoursesSectionProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [isExpanded, setIsExpanded] = useLocalStorage('nativeCoursesExpanded', true);
  const [isCreating, setIsCreating] = useState(false);
  const { data: accessList = [], isLoading, isError } = useCoursesQuery();

  const sortedCourses = useMemo(
    () => [...accessList].sort((a, b) => a.course.name.localeCompare(b.course.name)),
    [accessList],
  );
  const canCreate = user?.courseRole === 'teacher' || user?.role === 'ADMIN';

  const openCourse = useCallback(
    (access: CourseAccess) => {
      navigate(`/workspace/courses/${access.course._id}`);
      toggleNav();
    },
    [navigate, toggleNav],
  );
  const openPath = useCallback(
    (path: string) => {
      navigate(path);
      toggleNav();
    },
    [navigate, toggleNav],
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex justify-start py-2 pl-2">
          <Spinner className="h-4 w-4 text-text-secondary" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs text-text-secondary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{localize('com_course_list_unavailable')}</span>
        </div>
      );
    }

    if (sortedCourses.length === 0) {
      return (
        <div className="px-2 py-1.5 text-xs leading-5 text-text-secondary">
          {canCreate
            ? localize('com_course_teacher_empty_sidebar')
            : localize('com_course_student_empty_sidebar')}
        </div>
      );
    }

    return (
      <ul className="m-0 list-none p-0">
        {sortedCourses.map((access) => {
          if (!access.isTeacher) {
            return (
              <StudentCourseProjects key={access.course._id} access={access} onOpen={openPath} />
            );
          }
          const color = courseColor(access.course._id);
          return (
            <li key={access.course._id} className="list-none">
              <button
                type="button"
                onClick={() => openCourse(access)}
                className="group flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary outline-none transition-colors hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{ backgroundColor: color.background, color: color.foreground }}
                  aria-hidden="true"
                >
                  {courseInitial(access.course.name)}
                </span>
                <span className="min-w-0 flex-1 truncate leading-5">{access.course.name}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex shrink-0 flex-col border-t border-border-light px-3 pb-2 pt-1 text-sm">
      <div className="flex h-8 w-full items-center gap-0.5 pr-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="select-none truncate">
            {canCreate ? localize('com_ui_courses') : 'Course projects'}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
        {canCreate ? (
          <TooltipAnchor
            description={localize('com_course_create')}
            render={
              <button
                type="button"
                aria-label={localize('com_course_create')}
                className={iconButtonClassName}
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        ) : null}
      </div>

      {isExpanded ? (
        <div className="scrollbar-gutter-stable max-h-[30vh] overflow-y-auto">{renderBody()}</div>
      ) : null}
      {canCreate ? (
        <CourseCreateDialog open={isCreating} onOpenChange={setIsCreating} onCreated={toggleNav} />
      ) : null}
    </div>
  );
}

CoursesSection.displayName = 'CoursesSection';

export default memo(CoursesSection);
