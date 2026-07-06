import { request, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

export type CanvasConnection = {
  connected: boolean;
  stale?: boolean;
  tenantId?: string;
  userName?: string | null;
  baseUrl?: string;
  lastSyncAt?: string | null;
  syncing?: boolean;
  courseCount?: number;
};

export const canvasConnectionQueryKey = ['learnlink', 'canvas-connection'];

export function useCanvasConnectionQuery(): UseQueryResult<CanvasConnection> {
  const queryClient = useQueryClient();
  return useQuery<CanvasConnection>(
    canvasConnectionQueryKey,
    () => request.get('/api/learnlink/canvas'),
    {
      staleTime: 30000,
      retry: 1,
      refetchInterval: (data) => (data?.connected === true && data.syncing === true ? 5000 : false),
      onSuccess: (data) => {
        if (data.connected === true && data.syncing === false) {
          queryClient.invalidateQueries(['learnlink', 'current-courses']);
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
    (payload) => request.put('/api/learnlink/canvas', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['learnlink']);
        queryClient.invalidateQueries([QueryKeys.messages]);
      },
    },
  );
}

export function useDisconnectCanvasMutation(): UseMutationResult<CanvasConnection, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<CanvasConnection, Error, void>(() => request.delete('/api/learnlink/canvas'), {
    onSuccess: () => {
      queryClient.invalidateQueries(['learnlink']);
    },
  });
}
