import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCanvasConnectionQuery } from './canvas';

export type LearnLightCourseSummary = {
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

export type LearnLightAssignment = {
  id: string;
  canvasAssignmentId: number;
  courseId: string;
  name: string;
  description: string | null;
  dueAt: string | null;
  htmlUrl: string | null;
};

export type LearnLightModule = {
  id: string;
  canvasModuleId: number;
  courseId: string;
  name: string;
  position: number | null;
};

export type LearnLightCourseFile = {
  id: string;
  canvasFileId: number;
  courseId: string;
  filename: string;
  contentType: string | null;
  url: string | null;
  size: number | null;
  updatedAt: string | null;
};

export type LearnLightCourseWithMaterials = Omit<
  LearnLightCourseSummary,
  'assignmentCount' | 'moduleCount' | 'fileCount'
> & {
  assignments: LearnLightAssignment[];
  modules: LearnLightModule[];
  files: LearnLightCourseFile[];
};

export const learnLightBaseUrl = (
  import.meta.env.VITE_LEARNLIGHT_CANVAS_SERVICE_URL || 'http://localhost:3333'
).replace(/\/+$/, '');

async function fetchLearnLight<T>(path: string, tenantId?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }
  const response = await fetch(`${learnLightBaseUrl}${path}`, { headers });

  if (!response.ok) {
    throw new Error(`LearnLight request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/** Resolves the user's Canvas tenant once connected; undefined falls back to the shared default account. */
function useTenantId(): { tenantId: string | undefined; ready: boolean } {
  const connection = useCanvasConnectionQuery();
  return {
    tenantId: connection.data?.connected === true ? connection.data.tenantId : undefined,
    ready: connection.isFetched,
  };
}

export function useCurrentCoursesQuery(): UseQueryResult<LearnLightCourseSummary[]> {
  const { tenantId, ready } = useTenantId();
  return useQuery<LearnLightCourseSummary[]>(
    ['learnlight', 'current-courses', learnLightBaseUrl, tenantId ?? 'default'],
    () => fetchLearnLight<LearnLightCourseSummary[]>('/api/learnlight/courses/current', tenantId),
    {
      staleTime: 30000,
      cacheTime: 300000,
      retry: 1,
      enabled: ready,
    },
  );
}

export function useCourseMaterialsQuery(
  canvasCourseId: number | null,
): UseQueryResult<LearnLightCourseWithMaterials | undefined> {
  const { tenantId, ready } = useTenantId();
  return useQuery<LearnLightCourseWithMaterials[], Error, LearnLightCourseWithMaterials | undefined>(
    ['learnlight', 'course-materials', learnLightBaseUrl, tenantId ?? 'default'],
    () => fetchLearnLight<LearnLightCourseWithMaterials[]>('/api/learnlight/courses', tenantId),
    {
      staleTime: 300000,
      cacheTime: 600000,
      retry: 1,
      enabled: canvasCourseId != null && ready,
      select: (courses) => courses.find((course) => course.canvasCourseId === canvasCourseId),
    },
  );
}
