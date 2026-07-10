import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { LearnLinkCourseSummary } from '~/data-provider/LearnLink';
import {
  getDisplayCourseName,
  iconButtonClassName,
  getCourseInitial,
  getCourseColor,
} from '~/components/LearnLink/utils';
import { useCanvasConnectionQuery, useCurrentCoursesQuery } from '~/data-provider/LearnLink';
import { useLocalize, useLocalStorage } from '~/hooks';
import { cn } from '~/utils';

type CoursesSectionProps = {
  toggleNav: () => void;
};

function CoursesSection({ toggleNav }: CoursesSectionProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useLocalStorage('learnlinkCoursesExpanded', true);
  const { data: courses = [], isLoading, isError, isFetching, refetch } = useCurrentCoursesQuery();
  const { data: connection } = useCanvasConnectionQuery();
  const isSyncing =
    connection?.connected === true && (connection.syncing === true || connection.lastSyncAt == null);

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.name.localeCompare(b.name)),
    [courses],
  );

  const openCourse = useCallback(
    (course: LearnLinkCourseSummary) => {
      navigate(`/courses/${course.canvasCourseId}`);
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
          <span className="min-w-0">{localize('com_ui_courses_unavailable')}</span>
        </div>
      );
    }

    if (sortedCourses.length === 0 && isSyncing) {
      return (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-secondary">
          <Spinner className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">{localize('com_ui_courses_syncing')}</span>
        </div>
      );
    }

    if (sortedCourses.length === 0) {
      return (
        <div className="px-2 py-1.5 text-xs text-text-secondary">
          {localize('com_ui_no_courses')}
        </div>
      );
    }

    return (
      <ul className="m-0 list-none p-0">
        {sortedCourses.map((course) => {
          const color = getCourseColor(course.canvasCourseId);
          const displayName = getDisplayCourseName(course.name);
          return (
            <li key={course.id} className="list-none">
              <button
                type="button"
                onClick={() => openCourse(course)}
                className="group flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary outline-none transition-colors hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{ backgroundColor: color.background, color: color.foreground }}
                  aria-hidden="true"
                >
                  {getCourseInitial(displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate leading-5">{displayName}</span>
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
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="select-none truncate">{localize('com_ui_courses')}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
        <BookOpen className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <TooltipAnchor
          description={localize('com_ui_refresh_courses')}
          render={
            <button
              type="button"
              aria-label={localize('com_ui_refresh_courses')}
              className={iconButtonClassName}
              onClick={() => refetch()}
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && !isLoading && 'animate-spin')}
                aria-hidden="true"
              />
            </button>
          }
        />
      </div>

      {isExpanded && (
        <div className="scrollbar-gutter-stable max-h-[30vh] overflow-y-auto">{renderBody()}</div>
      )}
    </div>
  );
}

CoursesSection.displayName = 'CoursesSection';

export default memo(CoursesSection);
