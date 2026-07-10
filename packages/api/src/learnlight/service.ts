import { logger } from '@librechat/data-schemas';
import type {
  LearnLightAssignmentFilter,
  LearnLightAssignmentsResponse,
  LearnLightCourseContext,
  LearnLightFeedbackResponse,
  LearnLightMasteryResponse,
  LearnLightMaterialTextResponse,
  LearnLightModulesResponse,
  LearnLightSearchResponse,
  LearnLightTenantStatus,
} from './types';
import { getCanvasServiceUrl } from './config';

const REQUEST_TIMEOUT_MS = 8_000;
const CONTEXT_CACHE_TTL_MS = 60_000;
const RECENT_GRADED_LIMIT = 8;

const contextCache = new Map<string, { expiresAt: number; value: LearnLightCourseContext }>();

export type LearnLightRequestOptions = {
  tenantId?: string | null;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

async function fetchJson<T>(path: string, options?: LearnLightRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options?.tenantId) {
    headers['X-Tenant-Id'] = options.tenantId;
  }
  if (options?.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${getCanvasServiceUrl()}${path}`, {
      signal: controller.signal,
      headers,
      method: options?.method ?? 'GET',
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LearnLight service responded ${response.status} for ${path}: ${body}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCourseContext(
  canvasCourseId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightCourseContext> {
  const cacheKey = `${options?.tenantId ?? 'default'}:${canvasCourseId}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [value, gradedWork, moduleNames] = await Promise.all([
    fetchJson<LearnLightCourseContext>(`/api/learnlight/courses/${canvasCourseId}/context`, options),
    getRecentGradedWorkSafe(canvasCourseId, options),
    getModuleNamesSafe(canvasCourseId, options),
  ]);

  if (gradedWork != null) {
    value.recentGradedWork = gradedWork.assignments.filter(
      (assignment) => assignment.score != null,
    );
    value.gradeSummary = gradedWork.gradeSummary;
  }
  if (moduleNames != null) {
    value.moduleNames = moduleNames;
  }

  contextCache.set(cacheKey, { expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS, value });
  return value;
}

async function getModuleNamesSafe(
  canvasCourseId: number,
  options?: LearnLightRequestOptions,
): Promise<string[] | null> {
  try {
    const response = await getModules(canvasCourseId, options);
    return response.modules
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((module) => module.name);
  } catch (error) {
    logger.warn(
      `[LearnLight] Failed to fetch module names for course card ${canvasCourseId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

async function getRecentGradedWorkSafe(
  canvasCourseId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightAssignmentsResponse | null> {
  try {
    return await getAssignments({
      canvasCourseId,
      filter: 'past',
      limit: RECENT_GRADED_LIMIT,
      tenantId: options?.tenantId,
    });
  } catch (error) {
    logger.warn(
      `[LearnLight] Failed to fetch graded work for course card ${canvasCourseId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

export function clearCourseContextCache(): void {
  contextCache.clear();
}

export async function getAssignments(params: {
  canvasCourseId?: number;
  filter?: LearnLightAssignmentFilter;
  query?: string;
  dueAfter?: string;
  dueBefore?: string;
  withDescriptions?: boolean;
  limit?: number;
  tenantId?: string | null;
}): Promise<LearnLightAssignmentsResponse> {
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
      ? `/api/learnlight/courses/${params.canvasCourseId}/assignments`
      : '/api/learnlight/assignments';
  const query = searchParams.toString();

  return fetchJson<LearnLightAssignmentsResponse>(query ? `${basePath}?${query}` : basePath, {
    tenantId: params.tenantId,
  });
}

export async function getModules(
  canvasCourseId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightModulesResponse> {
  return fetchJson<LearnLightModulesResponse>(
    `/api/learnlight/courses/${canvasCourseId}/modules`,
    options,
  );
}

export async function getMastery(params: {
  canvasCourseId?: number;
  tenantId?: string | null;
}): Promise<LearnLightMasteryResponse> {
  const path =
    params.canvasCourseId != null
      ? `/api/learnlight/courses/${params.canvasCourseId}/mastery`
      : '/api/learnlight/mastery';

  return fetchJson<LearnLightMasteryResponse>(path, { tenantId: params.tenantId });
}

export async function searchMaterials(params: {
  query: string;
  canvasCourseId?: number;
  limit?: number;
  tenantId?: string | null;
}): Promise<LearnLightSearchResponse> {
  const searchParams = new URLSearchParams({ q: params.query });
  if (params.canvasCourseId != null) {
    searchParams.set('canvasCourseId', String(params.canvasCourseId));
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  return fetchJson<LearnLightSearchResponse>(`/api/learnlight/search?${searchParams.toString()}`, {
    tenantId: params.tenantId,
  });
}

export async function readMaterial(params: {
  materialId: string;
  page?: number;
  tenantId?: string | null;
}): Promise<LearnLightMaterialTextResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set('page', String(params.page));
  }

  const query = searchParams.toString();
  const basePath = `/api/learnlight/materials/${encodeURIComponent(params.materialId)}/text`;
  return fetchJson<LearnLightMaterialTextResponse>(query ? `${basePath}?${query}` : basePath, {
    tenantId: params.tenantId,
  });
}

export async function sendFeedback(params: {
  message?: string;
  category?: string;
  shareChat?: boolean;
  conversationId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  tenantId?: string | null;
}): Promise<LearnLightFeedbackResponse> {
  return fetchJson<LearnLightFeedbackResponse>('/api/learnlight/feedback', {
    tenantId: params.tenantId,
    method: 'POST',
    body: {
      message: params.message,
      category: params.category,
      shareChat: params.shareChat,
      conversationId: params.conversationId,
      userName: params.userName,
      userEmail: params.userEmail,
    },
  });
}

/** Sync state for a connected Canvas account; null for the shared default tenant or on error. */
export async function getTenantStatusSafe(
  tenantId?: string | null,
): Promise<LearnLightTenantStatus | null> {
  if (!tenantId) {
    return null;
  }
  try {
    return await fetchJson<LearnLightTenantStatus>(`/api/learnlight/tenants/${tenantId}`);
  } catch (error) {
    logger.warn(
      `[LearnLight] Failed to fetch tenant status for ${tenantId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

export async function getCourseContextSafe(
  canvasCourseId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightCourseContext | null> {
  try {
    return await getCourseContext(canvasCourseId, options);
  } catch (error) {
    logger.warn(
      `[LearnLight] Failed to fetch course context for ${canvasCourseId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
