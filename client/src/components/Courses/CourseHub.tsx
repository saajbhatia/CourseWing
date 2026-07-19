import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner, useMediaQuery } from '@librechat/client';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useCoursesQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import CourseCreateDialog from './CourseCreateDialog';

export default function CourseHub() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [isCreating, setIsCreating] = useState(false);
  const { user } = useAuthContext();
  const { data: accessList = [], isLoading } = useCoursesQuery();
  const canCreate = user?.courseRole === 'teacher' || user?.role === 'ADMIN';

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 md:px-6 lg:pt-12">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {isSmallScreen ? <OpenSidebar /> : null}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {localize('com_course_hub_title')}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                {localize('com_course_hub_description')}
              </p>
            </div>
          </div>
          {canCreate ? (
            <Button type="button" variant="submit" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {localize('com_course_create')}
            </Button>
          ) : null}
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Spinner className="text-text-primary" />
          </div>
        ) : null}
        {!isLoading && accessList.length === 0 ? (
          <section className="mt-12 flex flex-col items-center rounded-2xl border border-dashed border-border-medium px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
              <BookOpen className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold">{localize('com_course_empty_title')}</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-text-secondary">
              {localize('com_course_empty_description')}
            </p>
            {canCreate ? (
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                onClick={() => setIsCreating(true)}
              >
                {localize('com_course_create')}
              </Button>
            ) : null}
          </section>
        ) : null}
        {!isLoading && accessList.length > 0 ? (
          <section className="mt-8 grid gap-3 md:grid-cols-2">
            {accessList.map(({ course, membership }) => (
              <button
                key={course._id}
                type="button"
                onClick={() => navigate(`/workspace/courses/${course._id}`)}
                className="group rounded-xl border border-border-medium bg-surface-secondary p-5 text-left transition-colors hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-base font-semibold">{course.name}</span>
                  <span className="rounded-full bg-surface-active-alt px-2.5 py-1 text-xs font-medium text-text-secondary">
                    {membership.role === 'teacher'
                      ? localize('com_course_role_teacher')
                      : localize('com_course_role_student')}
                  </span>
                </span>
                {course.description ? (
                  <span className="mt-2 line-clamp-2 block text-sm leading-6 text-text-secondary">
                    {course.description}
                  </span>
                ) : null}
              </button>
            ))}
          </section>
        ) : null}
      </div>
      {canCreate ? <CourseCreateDialog open={isCreating} onOpenChange={setIsCreating} /> : null}
    </main>
  );
}
