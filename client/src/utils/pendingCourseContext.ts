import { extractCanvasCourseId } from 'librechat-data-provider';

const PENDING_COURSE_CONTEXT_KEY = 'learnlight:pendingCourseContext';
export const PENDING_COURSE_KEY = 'learnlight:pendingCourse';
const MAX_COURSE_PREFIX_LENGTH = 20_000;

type PendingCourseContext = {
  version: 1;
  canvasCourseId: number;
  promptPrefix: string;
};

/**
 * Keeps the course/assignment prefix available until the first message is sent.
 * The chat context can lag one render behind course navigation, so relying only
 * on `conversation.promptPrefix` loses assignment identity for fast guest sends.
 */
export function setPendingGuestCourseContext(canvasCourseId: number, promptPrefix: string): void {
  if (
    !Number.isSafeInteger(canvasCourseId) ||
    canvasCourseId <= 0 ||
    typeof promptPrefix !== 'string' ||
    promptPrefix.length > MAX_COURSE_PREFIX_LENGTH ||
    extractCanvasCourseId(promptPrefix) !== canvasCourseId
  ) {
    clearPendingGuestCourseContext();
    return;
  }

  const context: PendingCourseContext = {
    version: 1,
    canvasCourseId,
    promptPrefix,
  };
  sessionStorage.setItem(PENDING_COURSE_CONTEXT_KEY, JSON.stringify(context));
}

export function clearPendingGuestCourseContext(): void {
  try {
    sessionStorage.removeItem(PENDING_COURSE_CONTEXT_KEY);
  } catch {
    // Storage may be disabled; callers already handle unavailable handoff storage.
  }
}

export function getPendingGuestCoursePrefix(): string | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_COURSE_CONTEXT_KEY);
  } catch {
    return null;
  }
  if (raw == null) {
    return null;
  }

  try {
    const context = JSON.parse(raw) as Partial<PendingCourseContext>;
    const pendingCourseId = Number(sessionStorage.getItem(PENDING_COURSE_KEY));
    if (
      context.version !== 1 ||
      !Number.isSafeInteger(context.canvasCourseId) ||
      context.canvasCourseId !== pendingCourseId ||
      typeof context.promptPrefix !== 'string' ||
      context.promptPrefix.length > MAX_COURSE_PREFIX_LENGTH ||
      extractCanvasCourseId(context.promptPrefix) !== context.canvasCourseId
    ) {
      return null;
    }
    return context.promptPrefix;
  } catch {
    return null;
  }
}
