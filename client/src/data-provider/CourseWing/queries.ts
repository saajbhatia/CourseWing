import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { request } from 'librechat-data-provider';
import {
  useCanvasConnectionQuery,
  currentCoursesQueryKeyPrefix,
  courseMaterialsQueryKeyPrefix,
} from './canvas';

export type CourseWingCourseSummary = {
  id: string;
  canvasCourseId: number;
  name: string;
  courseCode: string | null;
  workflowState: string | null;
  startAt: string | null;
  endAt: string | null;
  termName: string | null;
  termStartAt: string | null;
  termEndAt: string | null;
  assignmentCount: number;
  moduleCount: number;
  fileCount: number;
};

export type CourseWingAssignment = {
  id: string;
  canvasAssignmentId: number;
  name: string;
  dueAt: string | null;
  completed: boolean;
};

export type CourseWingCourseView = {
  assignments: CourseWingAssignment[];
  totalAssignments: number;
  returnedAssignments: number;
  truncated: boolean;
};

/** Browser data requests go through LibreChat so auth and user-to-tenant mapping stay server-side. */
export const courseWingBaseUrl = '/api/coursewing';

async function fetchCourseWing<T>(path: string): Promise<T> {
  return request.get<T>(`${courseWingBaseUrl}${path}`);
}

/** Course data stays disabled until this authenticated user has a connected Canvas tenant. */
function useCanvasAccess(): { accountKey: string | undefined; enabled: boolean } {
  const connection = useCanvasConnectionQuery();
  return {
    accountKey: connection.data?.connected === true ? connection.data.canvasAccountKey : undefined,
    enabled:
      connection.isFetched &&
      connection.data?.connected === true &&
      typeof connection.data.canvasAccountKey === 'string',
  };
}

export function useCurrentCoursesQuery(): UseQueryResult<CourseWingCourseSummary[]> {
  const { accountKey, enabled } = useCanvasAccess();
  return useQuery<CourseWingCourseSummary[]>(
    [...currentCoursesQueryKeyPrefix, accountKey ?? 'disconnected'],
    () => fetchCourseWing<CourseWingCourseSummary[]>('/courses/current'),
    {
      staleTime: 30000,
      cacheTime: 300000,
      retry: 1,
      enabled,
    },
  );
}

export function useCourseMaterialsQuery(
  canvasCourseId: number | null,
): UseQueryResult<CourseWingCourseView, Error> {
  const { accountKey, enabled } = useCanvasAccess();
  return useQuery<CourseWingCourseView, Error>(
    [...courseMaterialsQueryKeyPrefix, accountKey ?? 'disconnected', canvasCourseId],
    () => fetchCourseWing<CourseWingCourseView>(`/courses/${canvasCourseId}`),
    {
      staleTime: 300000,
      cacheTime: 600000,
      retry: 1,
      enabled: canvasCourseId != null && enabled,
    },
  );
}
