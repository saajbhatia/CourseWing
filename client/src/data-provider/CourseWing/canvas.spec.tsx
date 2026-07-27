/**
 * @jest-environment @happy-dom/jest-environment
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  useCanvasConnectionQuery,
  useConnectCanvasMutation,
  useDemoModeMutation,
  useDisconnectCanvasMutation,
} from './canvas';
import { coursewingNow, setCourseWingFrozenNow } from '~/components/CourseWing/utils';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    request: {
      ...actual.request,
      get: jest.fn(),
      put: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
    },
  };
});

const mockedRequest = jest.requireMock('librechat-data-provider').request as {
  get: jest.Mock;
  put: jest.Mock;
  post: jest.Mock;
  delete: jest.Mock;
};

const accountA = {
  enabled: true,
  connected: true,
  canvasAccountKey: 'canvas-a',
  courseCount: 1,
};
const accountB = {
  enabled: true,
  connected: true,
  canvasAccountKey: 'canvas-b',
  courseCount: 1,
};

const teacherQueryKeys = [
  ['tcMe'],
  ['tcOverview', 42],
  ['tcQueue', 42],
  ['tcSettings', 42],
  ['tcActivities', 42],
  ['tcStudent', 42, 'student@example.com'],
  ['tcFutureTeacherQuery', 42],
  ['llTeacherActivities', 42],
] as const;

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function seedTeacherQueries(queryClient: QueryClient) {
  for (const queryKey of teacherQueryKeys) {
    queryClient.setQueryData(queryKey, { tenant: 'canvas-a' });
  }
  queryClient.setQueryData(['unrelated'], { keep: true });
}

function expectTeacherQueriesRemoved(queryClient: QueryClient) {
  for (const queryKey of teacherQueryKeys) {
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  }
  expect(queryClient.getQueryData(['unrelated'])).toEqual({ keep: true });
}

describe('Canvas identity cache isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCourseWingFrozenNow(null);
  });

  afterEach(() => {
    setCourseWingFrozenNow(null);
  });

  it('removes every teacher cache when a status refetch observes a new identity', async () => {
    mockedRequest.get.mockResolvedValueOnce(accountA).mockResolvedValueOnce(accountB);
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useCanvasConnectionQuery(), { wrapper });

    await waitFor(() => expect(result.current.data?.canvasAccountKey).toBe('canvas-a'));
    seedTeacherQueries(queryClient);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.data?.canvasAccountKey).toBe('canvas-b'));
    expectTeacherQueriesRemoved(queryClient);
  });

  it('rejects malformed frozen metadata before it can replace the active clock', async () => {
    setCourseWingFrozenNow('2026-01-01T00:00:00.000Z');
    mockedRequest.put.mockResolvedValue({
      ...accountA,
      frozenNow: 'not-a-date',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useConnectCanvasMutation(), { wrapper });

    await expect(
      act(async () => result.current.mutateAsync({ token: 'canvas-token' })),
    ).rejects.toThrow('Canvas returned an invalid frozen clock');
    expect(coursewingNow().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('removes every teacher cache after connecting a Canvas account', async () => {
    setCourseWingFrozenNow('2000-01-01T00:00:00.000Z');
    mockedRequest.put.mockResolvedValue(accountB);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(['coursewing', 'canvas-connection'], accountA);
    seedTeacherQueries(queryClient);
    const { result } = renderHook(() => useConnectCanvasMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ token: 'canvas-token' });
    });

    expectTeacherQueriesRemoved(queryClient);
    expect(coursewingNow().getUTCFullYear()).not.toBe(2000);
  });

  it('removes every teacher cache when entering demo mode', async () => {
    mockedRequest.post.mockResolvedValue({ ...accountB, isDefault: true, frozenNow: '2026-01-01' });
    const { queryClient, wrapper } = createHarness();
    seedTeacherQueries(queryClient);
    const { result } = renderHook(() => useDemoModeMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expectTeacherQueriesRemoved(queryClient);
    expect(coursewingNow().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('removes every teacher cache and adopts the fallback tenant clock after disconnecting', async () => {
    setCourseWingFrozenNow('2000-01-01T00:00:00.000Z');
    mockedRequest.delete.mockResolvedValue({
      enabled: true,
      connected: true,
      isDefault: true,
      canvasAccountKey: 'canvas-demo',
      frozenNow: '2026-01-01T00:00:00.000Z',
    });
    const { queryClient, wrapper } = createHarness();
    seedTeacherQueries(queryClient);
    const { result } = renderHook(() => useDisconnectCanvasMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expectTeacherQueriesRemoved(queryClient);
    expect(coursewingNow().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
