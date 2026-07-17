import { extractCanvasCourseId } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import createChatSearchParams from './createChatSearchParams';
import { getPendingGuestCoursePrefix } from './pendingCourseContext';

export const GUEST_CHAT_HANDOFF_KEY = 'learnlight:guest-chat-handoff';

const HANDOFF_VERSION = 1;
const HANDOFF_TTL_MS = 60 * 60 * 1000;
const MAX_PROMPT_LENGTH = 100_000;
const MAX_COURSE_PREFIX_LENGTH = 20_000;
const PRESERVED_SETTING_KEYS = new Set(['spec', 'endpoint', 'model', 'promptPrefix']);

type StoredGuestChatHandoff = {
  version: typeof HANDOFF_VERSION;
  createdAt: number;
  prompt: string;
  settings: Record<string, string>;
};

export type GuestChatHandoff = Pick<StoredGuestChatHandoff, 'prompt' | 'settings'>;

function removeStoredHandoff(): void {
  try {
    sessionStorage.removeItem(GUEST_CHAT_HANDOFF_KEY);
  } catch {
    // Storage may be disabled by the browser; login should still remain usable.
  }
}

/**
 * Keeps an explicit guest submission private while authentication completes.
 * Only the selected model identity and a bounded Canvas course prefix are retained;
 * prompts and course context never enter the URL, browser history, referrers, or access logs.
 */
export function storeGuestChatHandoff(
  prompt: string,
  conversation?: TConversation | null,
): boolean {
  if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_LENGTH) {
    removeStoredHandoff();
    return false;
  }

  const settings: Record<string, string> = {};
  const params = createChatSearchParams(conversation ?? null);
  for (const [key, value] of params.entries()) {
    if (key !== 'promptPrefix' && PRESERVED_SETTING_KEYS.has(key)) {
      settings[key] = value;
    }
  }
  const conversationPrefix = conversation?.promptPrefix;
  const promptPrefix =
    getPendingGuestCoursePrefix() ??
    (typeof conversationPrefix === 'string' ? conversationPrefix : null);
  if (
    promptPrefix != null &&
    promptPrefix.length <= MAX_COURSE_PREFIX_LENGTH &&
    extractCanvasCourseId(promptPrefix) != null
  ) {
    settings.promptPrefix = promptPrefix;
  }

  const handoff: StoredGuestChatHandoff = {
    version: HANDOFF_VERSION,
    createdAt: Date.now(),
    prompt,
    settings,
  };

  try {
    sessionStorage.setItem(GUEST_CHAT_HANDOFF_KEY, JSON.stringify(handoff));
    return true;
  } catch {
    removeStoredHandoff();
    return false;
  }
}

/** Removes before parsing so even malformed or interrupted handoffs are one-time. */
export function consumeGuestChatHandoff(now = Date.now()): GuestChatHandoff | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(GUEST_CHAT_HANDOFF_KEY);
    sessionStorage.removeItem(GUEST_CHAT_HANDOFF_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<StoredGuestChatHandoff>;
    if (
      value.version !== HANDOFF_VERSION ||
      typeof value.createdAt !== 'number' ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > now + 60_000 ||
      now - value.createdAt > HANDOFF_TTL_MS ||
      typeof value.prompt !== 'string' ||
      value.prompt.trim() === '' ||
      value.prompt.length > MAX_PROMPT_LENGTH ||
      value.settings == null ||
      typeof value.settings !== 'object' ||
      Array.isArray(value.settings)
    ) {
      return null;
    }

    const settings: Record<string, string> = {};
    for (const [key, setting] of Object.entries(value.settings)) {
      if (
        PRESERVED_SETTING_KEYS.has(key) &&
        typeof setting === 'string' &&
        setting.length <= (key === 'promptPrefix' ? MAX_COURSE_PREFIX_LENGTH : 1_000)
      ) {
        settings[key] = setting;
      }
    }

    return { prompt: value.prompt, settings };
  } catch {
    return null;
  }
}
