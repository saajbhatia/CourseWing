import { request, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { LearnLightCourseSummary } from './queries';
import { clearCourseChatMap } from '~/components/LearnLight/chats';
import { clearPendingCourse } from '~/components/LearnLight/utils';

export type CanvasConnection = {
  enabled?: boolean;
  connected: boolean;
  isDefault?: boolean;
  canvasAccountKey?: string;
  userName?: string | null;
  baseUrl?: string;
  lastSyncAt?: string | null;
  syncing?: boolean;
  courseCount?: number;
};

export const canvasConnectionQueryKey = ['learnlight', 'canvas-connection'];
export const currentCoursesQueryKeyPrefix = ['learnlight', 'current-courses'] as const;
export const courseMaterialsQueryKeyPrefix = ['learnlight', 'course-materials'] as const;

let observedCanvasAccountKey: string | null | undefined;

function canvasIdentity(connection: CanvasConnection | undefined): string | null {
  return connection?.connected === true && typeof connection.canvasAccountKey === 'string'
    ? connection.canvasAccountKey
    : null;
}

function clearCanvasClientState(): void {
  clearCourseChatMap();
  clearPendingCourse();
}

function observeCanvasIdentity(connection: CanvasConnection): void {
  const nextIdentity = canvasIdentity(connection);
  if (observedCanvasAccountKey !== undefined && observedCanvasAccountKey !== nextIdentity) {
    clearCanvasClientState();
  }
  observedCanvasAccountKey = nextIdentity;
}

function removeCanvasScopedQueries(queryClient: QueryClient): void {
  queryClient.removeQueries(currentCoursesQueryKeyPrefix);
  queryClient.removeQueries(courseMaterialsQueryKeyPrefix);
  queryClient.removeQueries([QueryKeys.conversation]);
  queryClient.removeQueries([QueryKeys.allConversations]);
}

export function useCanvasConnectionQuery(): UseQueryResult<CanvasConnection> {
  const queryClient = useQueryClient();
  return useQuery<CanvasConnection>(
    canvasConnectionQueryKey,
    () => request.get('/api/learnlight/canvas'),
    {
      staleTime: 30000,
      retry: 1,
      refetchInterval: (data) => (data?.connected === true && data.syncing === true ? 5000 : false),
      onSuccess: (data) => {
        observeCanvasIdentity(data);
        if (data.connected !== true) {
          return;
        }
        const cachedCourseQueries = queryClient.getQueriesData<LearnLightCourseSummary[]>(
          currentCoursesQueryKeyPrefix,
        );
        const countMismatch =
          typeof data.courseCount === 'number' &&
          cachedCourseQueries.some(
            ([, courses]) => Array.isArray(courses) && courses.length !== data.courseCount,
          );
        /* During a sync, courses land in the store one by one — refresh on every status
         * poll so the sidebar fills as they arrive instead of waiting for full completion. */
        if (data.syncing === true || countMismatch) {
          queryClient.invalidateQueries(currentCoursesQueryKeyPrefix);
        }
      },
    },
  );
}

export type ConnectCanvasPayload = {
  token: string;
  baseUrl?: string;
};

export function useConnectCanvasMutation(): UseMutationResult<
  CanvasConnection,
  Error,
  ConnectCanvasPayload
> {
  const queryClient = useQueryClient();
  return useMutation<CanvasConnection, Error, ConnectCanvasPayload>(
    (payload) => request.put('/api/learnlight/canvas', payload),
    {
      onSuccess: (data) => {
        const previousIdentity = canvasIdentity(
          queryClient.getQueryData<CanvasConnection>(canvasConnectionQueryKey),
        );
        const nextIdentity = canvasIdentity(data);
        if (previousIdentity !== nextIdentity) {
          clearCanvasClientState();
        }
        observedCanvasAccountKey = nextIdentity;
        queryClient.setQueryData<CanvasConnection>(canvasConnectionQueryKey, data);
        removeCanvasScopedQueries(queryClient);
        queryClient.invalidateQueries(['learnlight']);
        queryClient.invalidateQueries([QueryKeys.messages]);
      },
    },
  );
}

export function useDisconnectCanvasMutation(): UseMutationResult<CanvasConnection, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<CanvasConnection, Error, void>(
    () => request.delete('/api/learnlight/canvas'),
    {
      onSuccess: (data) => {
        clearCanvasClientState();
        observedCanvasAccountKey = canvasIdentity(data);
        queryClient.setQueryData<CanvasConnection>(canvasConnectionQueryKey, {
          enabled: true,
          ...data,
        });
        removeCanvasScopedQueries(queryClient);
        queryClient.invalidateQueries(['learnlight']);
      },
    },
  );
}
