import { logger } from '@librechat/data-schemas';
import type {
  LearnLightAssignmentDetailResponse,
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
import { getCanvasServiceKey, getCanvasServiceUrl } from './config';

const REQUEST_TIMEOUT_MS = 8_000;
const CONTEXT_CACHE_TTL_MS = 60_000;
const MAX_CONTEXT_CACHE_ENTRIES = 500;
const RECENT_GRADED_LIMIT = 8;
export const MAX_CANVAS_SERVICE_RESPONSE_BYTES: number = 2 * 1024 * 1024;

const contextCache = new Map<string, { expiresAt: number; value: LearnLightCourseContext }>();

/** Keeps the module-level cache bounded: sweep expired entries, then evict oldest-inserted if still full. */
function pruneContextCache(): void {
  if (contextCache.size < MAX_CONTEXT_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of contextCache) {
    if (entry.expiresAt <= now) {
      contextCache.delete(key);
    }
  }

  while (contextCache.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const oldestKey = contextCache.keys().next().value;
    if (oldestKey == null) {
      break;
    }
    contextCache.delete(oldestKey);
  }
}

export type LearnLightRequestOptions = {
  tenantId?: string | null;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  allowNoTenant?: boolean;
};

export class CanvasServiceResponseTooLargeError extends Error {
  readonly code = 'CANVAS_SERVICE_RESPONSE_TOO_LARGE';

  constructor(maxBytes: number, receivedBytes: number) {
    super(
      `Canvas service response exceeds the ${maxBytes}-byte safety limit ` +
        `(received at least ${receivedBytes} bytes)`,
    );
    this.name = 'CanvasServiceResponseTooLargeError';
  }
}

async function cancelResponseBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // Preserve the deterministic size-limit error if cancellation itself fails.
  }
}

async function readBoundedResponseText(
  response: Response,
  maxBytes = MAX_CANVAS_SERVICE_RESPONSE_BYTES,
): Promise<string> {
  const contentLength = response.headers.get('content-length')?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (declaredBytes > maxBytes) {
      await cancelResponseBody(response.body);
      throw new CanvasServiceResponseTooLargeError(maxBytes, declaredBytes);
    }
  }

  if (!response.body) {
    return '';
  }
  if (typeof response.body.getReader !== 'function') {
    throw new Error('Canvas service returned an unreadable response stream');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const nextTotalBytes = totalBytes + value.byteLength;
      if (nextTotalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the deterministic size-limit error if cancellation itself fails.
        }
        throw new CanvasServiceResponseTooLargeError(maxBytes, nextTotalBytes);
      }

      chunks.push(value);
      totalBytes = nextTotalBytes;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Lenient bounded reader for internal Canvas-service JSON: rejects oversized responses
 * with CanvasServiceResponseTooLargeError, resolves `{}` for empty or non-JSON bodies.
 */
export async function readBoundedJson(
  response: Response,
  maxBytes: number = MAX_CANVAS_SERVICE_RESPONSE_BYTES,
): Promise<unknown> {
  const text = await readBoundedResponseText(response, maxBytes);
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function fetchJson<T>(path: string, options?: LearnLightRequestOptions): Promise<T> {
  if (!options?.tenantId && options?.allowNoTenant !== true) {
    throw new Error('Canvas account is not connected');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers['X-LearnLight-Service-Key'] = getCanvasServiceKey();
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

    const responseText = await readBoundedResponseText(response);

    if (!response.ok) {
      throw new Error(
        `LearnLight service responded ${response.status} for ${path}: ${responseText}`,
      );
    }

    return JSON.parse(responseText) as T;
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
    fetchJson<LearnLightCourseContext>(
      `/api/learnlight/courses/${canvasCourseId}/context`,
      options,
    ),
    getRecentGradedWorkSafe(canvasCourseId, options),
    getModuleNamesSafe(canvasCourseId, options),
  ]);

  if (gradedWork != null) {
    value.recentGradedWork = gradedWork.assignments;
    value.gradeSummary = gradedWork.gradeSummary;
  }
  if (moduleNames != null) {
    value.moduleNames = moduleNames;
  }

  pruneContextCache();
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
      filter: 'graded',
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

export async function getAssignmentDetail(
  canvasCourseId: number,
  canvasAssignmentId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightAssignmentDetailResponse> {
  return fetchJson<LearnLightAssignmentDetailResponse>(
    `/api/learnlight/courses/${canvasCourseId}/assignments/${canvasAssignmentId}`,
    options,
  );
}

export async function getAssignmentDetailSafe(
  canvasCourseId: number,
  canvasAssignmentId: number,
  options?: LearnLightRequestOptions,
): Promise<LearnLightAssignmentDetailResponse | null> {
  try {
    return await getAssignmentDetail(canvasCourseId, canvasAssignmentId, options);
  } catch (error) {
    logger.warn(
      `[LearnLight] Failed to fetch assignment detail ${canvasCourseId}/${canvasAssignmentId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
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
  message: string;
  category?: string;
  userName?: string | null;
  userEmail?: string | null;
  tenantId?: string | null;
}): Promise<LearnLightFeedbackResponse> {
  return fetchJson<LearnLightFeedbackResponse>('/api/learnlight/feedback', {
    tenantId: params.tenantId,
    allowNoTenant: true,
    method: 'POST',
    body: {
      message: params.message,
      category: params.category,
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
    return await fetchJson<LearnLightTenantStatus>(`/api/learnlight/tenants/${tenantId}`, {
      tenantId,
    });
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
