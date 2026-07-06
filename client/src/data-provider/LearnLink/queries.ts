import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCanvasConnectionQuery } from './canvas';

export type LearnLinkCourseSummary = {
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

export type LearnLinkAssignment = {
  id: string;
  canvasAssignmentId: number;
  courseId: string;
  name: string;
  description: string | null;
  dueAt: string | null;
  htmlUrl: string | null;
};

export type LearnLinkModule = {
  id: string;
  canvasModuleId: number;
  courseId: string;
  name: string;
  position: number | null;
};

export type LearnLinkCourseFile = {
  id: string;
  canvasFileId: number;
  courseId: string;
  filename: string;
  contentType: string | null;
  url: string | null;
  size: number | null;
  updatedAt: string | null;
};

export type LearnLinkCourseWithMaterials = Omit<
  LearnLinkCourseSummary,
  'assignmentCount' | 'moduleCount' | 'fileCount'
> & {
  assignments: LearnLinkAssignment[];
  modules: LearnLinkModule[];
  files: LearnLinkCourseFile[];
};

export const learnLinkBaseUrl = (
  import.meta.env.VITE_LEARNLINK_CANVAS_SERVICE_URL || 'http://localhost:3333'
).replace(/\/+$/, '');

async function fetchLearnLink<T>(path: string, tenantId?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }
  const response = await fetch(`${learnLinkBaseUrl}${path}`, { headers });

  if (!response.ok) {
    throw new Error(`LearnLink request failed: ${response.status}`);
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

export function useCurrentCoursesQuery(): UseQueryResult<LearnLinkCourseSummary[]> {
  const { tenantId, ready } = useTenantId();
  return useQuery<LearnLinkCourseSummary[]>(
    ['learnlink', 'current-courses', learnLinkBaseUrl, tenantId ?? 'default'],
    () => fetchLearnLink<LearnLinkCourseSummary[]>('/api/learnlink/courses/current', tenantId),
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
): UseQueryResult<LearnLinkCourseWithMaterials | undefined> {
  const { tenantId, ready } = useTenantId();
  return useQuery<LearnLinkCourseWithMaterials[], Error, LearnLinkCourseWithMaterials | undefined>(
    ['learnlink', 'course-materials', learnLinkBaseUrl, tenantId ?? 'default'],
    () => fetchLearnLink<LearnLinkCourseWithMaterials[]>('/api/learnlink/courses', tenantId),
    {
      staleTime: 300000,
      cacheTime: 600000,
      retry: 1,
      enabled: canvasCourseId != null && ready,
      select: (courses) => courses.find((course) => course.canvasCourseId === canvasCourseId),
    },
  );
}
