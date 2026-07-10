import { useSyncExternalStore } from 'react';

/**
 * Transient conversationId → canvasCourseId overlay for conversations created this
 * session. The persisted association lives on the conversation (`canvasCourseId`,
 * derived server-side in saveConvo); this bridge covers the window between the first
 * send and the conversations query catching up with the saved document.
 */
export type CourseChatMap = Record<string, number>;

const MAP_EVENT = 'learnlight:course-chats-changed';

let overlay: CourseChatMap = {};

export function recordCourseChat(conversationId: string, canvasCourseId: number): void {
  overlay = { ...overlay, [conversationId]: canvasCourseId };
  window.dispatchEvent(new Event(MAP_EVENT));
}

function getOverlay(): CourseChatMap {
  return overlay;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(MAP_EVENT, onStoreChange);
  return () => window.removeEventListener(MAP_EVENT, onStoreChange);
}

export function useCourseChatMap(): CourseChatMap {
  return useSyncExternalStore(subscribe, getOverlay);
}
