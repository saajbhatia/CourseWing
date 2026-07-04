import { logger } from '@librechat/data-schemas';
import type {
  LearnLinkAssignmentFilter,
  LearnLinkAssignmentsResponse,
  LearnLinkCourseContext,
  LearnLinkMaterialTextResponse,
  LearnLinkModulesResponse,
  LearnLinkSearchResponse,
} from './types';
import { getCanvasServiceUrl } from './config';

const REQUEST_TIMEOUT_MS = 8_000;
const CONTEXT_CACHE_TTL_MS = 60_000;

const contextCache = new Map<number, { expiresAt: number; value: LearnLinkCourseContext }>();

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getCanvasServiceUrl()}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LearnLink service responded ${response.status} for ${path}: ${body}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCourseContext(canvasCourseId: number): Promise<LearnLinkCourseContext> {
  const cached = contextCache.get(canvasCourseId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await fetchJson<LearnLinkCourseContext>(
    `/api/learnlink/courses/${canvasCourseId}/context`,
  );
  contextCache.set(canvasCourseId, { expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS, value });
  return value;
}

export function clearCourseContextCache(): void {
  contextCache.clear();
}

export async function getAssignments(params: {
  canvasCourseId?: number;
  filter?: LearnLinkAssignmentFilter;
  query?: string;
  dueAfter?: string;
  dueBefore?: string;
  withDescriptions?: boolean;
  limit?: number;
}): Promise<LearnLinkAssignmentsResponse> {
  const searchParams = new URLSearchParams();
  if (params.filter) {
    searchParams.set('filter', params.filter);
  }
  if (params.query) {
    searchParams.set('query', params.query);
  }
  if (params.dueAfter) {
    searchParams.set('dueAfter', params.dueAfter);
  }
  if (params.dueBefore) {
    searchParams.set('dueBefore', params.dueBefore);
  }
  if (params.withDescriptions) {
    searchParams.set('withDescriptions', 'true');
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const basePath =
    params.canvasCourseId != null
      ? `/api/learnlink/courses/${params.canvasCourseId}/assignments`
      : '/api/learnlink/assignments';
  const query = searchParams.toString();

  return fetchJson<LearnLinkAssignmentsResponse>(query ? `${basePath}?${query}` : basePath);
}

export async function getModules(canvasCourseId: number): Promise<LearnLinkModulesResponse> {
  return fetchJson<LearnLinkModulesResponse>(`/api/learnlink/courses/${canvasCourseId}/modules`);
}

export async function searchMaterials(params: {
  query: string;
  canvasCourseId?: number;
  limit?: number;
}): Promise<LearnLinkSearchResponse> {
  const searchParams = new URLSearchParams({ q: params.query });
  if (params.canvasCourseId != null) {
    searchParams.set('canvasCourseId', String(params.canvasCourseId));
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  return fetchJson<LearnLinkSearchResponse>(`/api/learnlink/search?${searchParams.toString()}`);
}

export async function readMaterial(params: {
  materialId: string;
  page?: number;
}): Promise<LearnLinkMaterialTextResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set('page', String(params.page));
  }

  const query = searchParams.toString();
  const basePath = `/api/learnlink/materials/${encodeURIComponent(params.materialId)}/text`;
  return fetchJson<LearnLinkMaterialTextResponse>(query ? `${basePath}?${query}` : basePath);
}

export async function getCourseContextSafe(
  canvasCourseId: number,
): Promise<LearnLinkCourseContext | null> {
  try {
    return await getCourseContext(canvasCourseId);
  } catch (error) {
    logger.warn(
      `[LearnLink] Failed to fetch course context for ${canvasCourseId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
