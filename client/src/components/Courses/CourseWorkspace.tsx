import { useEffect } from 'react';
import { Spinner } from '@librechat/client';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCourseOverviewQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import StudentWorkspace from './StudentWorkspace';
import TeacherWorkspace from './TeacherWorkspace';
import type { StudentTab, TeacherTab } from './navigation';
import { isStudentTab, isTeacherTab } from './navigation';

export default function CourseWorkspace() {
  const localize = useLocalize();
  const { courseId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: overview, isLoading } = useCourseOverviewQuery(courseId);
  const requestedView = searchParams.get('view');

  useEffect(() => {
    if (!overview || overview.membership.role === 'teacher' || requestedView !== 'profile') {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('view', 'home');
    next.delete('project');
    next.delete('createProject');
    setSearchParams(next, { replace: true });
  }, [overview, requestedView, searchParams, setSearchParams]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-primary">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-primary text-sm text-text-secondary">
        {localize('com_course_not_found')}
      </div>
    );
  }

  const setView = (view: StudentTab | TeacherTab) => {
    const next = new URLSearchParams(searchParams);
    if (overview.membership.role !== 'teacher' && (view === 'home' || view === 'reports')) {
      next.set('view', view);
      next.delete('project');
      next.delete('createProject');
    } else if (overview.membership.role === 'teacher' && view === 'overview') {
      next.delete('view');
      next.delete('project');
      next.delete('student');
    } else if (overview.membership.role === 'teacher' && view !== 'project' && view !== 'student') {
      next.set('view', view);
      next.delete('project');
      next.delete('student');
    } else if (overview.membership.role !== 'teacher' && view === 'project') {
      next.set('view', 'project');
    } else {
      next.set('view', view);
    }
    setSearchParams(next);
  };

  if (overview.membership.role === 'teacher') {
    const openProject = (projectId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('view', 'project');
      next.set('project', projectId);
      next.delete('student');
      setSearchParams(next);
    };

    const openStudent = (studentId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('view', 'student');
      next.set('student', studentId);
      next.delete('project');
      setSearchParams(next);
    };

    return (
      <TeacherWorkspace
        courseId={courseId}
        overview={overview}
        tab={isTeacherTab(requestedView) ? requestedView : 'overview'}
        projectId={searchParams.get('project') ?? undefined}
        studentId={searchParams.get('student') ?? undefined}
        onNavigate={setView}
        onOpenProject={openProject}
        onOpenStudent={openStudent}
      />
    );
  }

  let studentTab: StudentTab = 'home';
  if (isStudentTab(requestedView)) {
    studentTab = requestedView;
  } else if (requestedView !== 'profile' && searchParams.has('project')) {
    studentTab = 'project';
  }

  return <StudentWorkspace courseId={courseId} overview={overview} tab={studentTab} />;
}
