import { useSyncExternalStore } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { LearnLightAssignment, LearnLightCourseSummary } from '~/data-provider/LearnLight';
import { Constants } from 'librechat-data-provider';

export type LearnLightCourseIdentity = Pick<
  LearnLightCourseSummary,
  'canvasCourseId' | 'name' | 'courseCode'
>;

const courseColors = [
  { background: '#0f9f6e', foreground: '#ffffff' },
  { background: '#3f8f9c', foreground: '#ffffff' },
  { background: '#6b8f59', foreground: '#ffffff' },
  { background: '#c23b4b', foreground: '#ffffff' },
  { background: '#7b5ab6', foreground: '#ffffff' },
  { background: '#b76b2b', foreground: '#ffffff' },
  { background: '#316b83', foreground: '#ffffff' },
  { background: '#a43f75', foreground: '#ffffff' },
];

const fakeNowMs = Date.parse(import.meta.env.VITE_LEARNLIGHT_FAKE_NOW ?? '');

/** Canvas names are untrusted text; keep them on one inert prefix line. */
function prefixValue(value: string): string {
  let normalized = '';
  let replacingControlRun = false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isLineBreakingControl =
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029;
    if (isLineBreakingControl) {
      if (!replacingControlRun) {
        normalized += ' ';
      }
      replacingControlRun = true;
      continue;
    }
    replacingControlRun = false;
    normalized += character;
  }
  return normalized.trim();
}

/** Demo/testing override: `VITE_LEARNLIGHT_FAKE_NOW` makes course views pretend "now" is that instant. */
export function learnlightNow(): Date {
  return Number.isNaN(fakeNowMs) ? new Date() : new Date(fakeNowMs);
}

export const iconButtonClassName =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

/** Shared pill styling for the tutor toolbar buttons (persona selector, feedback). */
export const pillButtonClassName =
  'group relative inline-flex items-center justify-center gap-1.5 rounded-full border border-border-medium text-sm font-medium size-9 max-w-fit p-2 transition-all md:w-full md:p-3 bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner';

export function getCourseColor(canvasCourseId: number): { background: string; foreground: string } {
  return courseColors[Math.abs(canvasCourseId) % courseColors.length];
}

export function getCourseInitial(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? '';
  return firstWord.charAt(0).toUpperCase() || 'C';
}

/** Strips trailing academic years ("Biology 2024", "Chem 2025-26") without eating course numbers ("Physics 2100"). */
export function getDisplayCourseName(name: string): string {
  return name
    .replace(/\s+(?:20)?\d{2}\s*[-–]\s*(?:20)?\d{2}\s*$/u, '')
    .replace(/\s+\(?(?:19|20)\d{2}\)?\s*$/u, '')
    .trim();
}

export function getCoursePrefix(course: LearnLightCourseIdentity): string {
  return [
    `Canvas course ID: ${course.canvasCourseId}`,
    `Current Canvas course: ${prefixValue(course.name)}`,
    course.courseCode ? `Course code: ${prefixValue(course.courseCode)}` : '',
    'The student is chatting within this course. Ground your help in this course’s material.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getAssignmentPrefix(
  course: LearnLightCourseIdentity,
  assignment: LearnLightAssignment,
): string {
  return [
    getCoursePrefix(course),
    `Canvas assignment ID: ${assignment.canvasAssignmentId}`,
    `Assignment: ${prefixValue(assignment.name)}`,
    assignment.dueAt ? `Due: ${assignment.dueAt}` : '',
    'The student wants help with this assignment.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getReviewPrefix(course: LearnLightCourseIdentity): string {
  return [
    getCoursePrefix(course),
    'The student has started a Personalized Review session.',
    'Set it up from the course context card alone — it already lists upcoming assessments, recent graded work with scores, and the current grade. Do NOT call assignment, grade, or mastery tools during setup; target the next upcoming quiz, test, or exam from the card (if none is listed, ask what they want to review) and derive weak spots from the graded-work scores, lowest percentages first.',
    'Then run the review interactively, opening with the plan and your first question in the SAME response: a one-paragraph plan naming the focus areas and why, followed by ONE practice question at a time — wait for their answer, give feedback, and adapt difficulty. Prioritize previously missed concepts and long-term retention (mix in older material), not just the most recent unit. End with a short summary of what to study next.',
    'Use tools when they are needed, not as a ritual: the card covers setup, but when the student asks what the exam covers, about specific course content, or how something was taught in class, look it up (learnlight_get_modules for structure, learnlight_search_materials/learnlight_read_material for content) with one or two targeted calls rather than answering from general knowledge. Never bulk-read materials up front.',
  ].join('\n');
}

export type NewConversationCall = (options?: {
  disableFocus?: boolean;
  template?: { promptPrefix?: string };
}) => void;

export type CourseChatOptions = {
  promptPrefix: string;
  greeting?: string;
  prompt?: string;
};

export type CourseChatHandoff = Pick<CourseChatOptions, 'promptPrefix' | 'prompt'>;

export function openCourseChat(
  navigate: NavigateFunction,
  newConversation: NewConversationCall,
  course: LearnLightCourseIdentity,
  options: CourseChatOptions,
): boolean {
  let handoffId: string;
  try {
    if (options.greeting) {
      sessionStorage.setItem(PENDING_GREETING_KEY, options.greeting);
    } else {
      sessionStorage.removeItem(PENDING_GREETING_KEY);
    }
    setPendingCourse(course.canvasCourseId);
    handoffId = createCourseChatHandoff({
      promptPrefix: options.promptPrefix,
      ...(options.prompt ? { prompt: options.prompt } : {}),
    });
  } catch {
    clearPendingCourse();
    return false;
  }
  /** Apply course context in the same state transition as the default model spec. Passing the
   * prefix through URL settings causes useQueryParams to create a second preset and can strip
   * the selected spec down to its raw endpoint/model. */
  newConversation({
    disableFocus: true,
    template: { promptPrefix: options.promptPrefix },
  });
  // The URL carries only a one-time opaque handle. Course names, assignment details,
  // prefixes, and student prompts stay out of browser history, referrers, and access logs.
  navigate(`/c/${Constants.NEW_CONVO}?learnlight=${encodeURIComponent(handoffId)}`, {
    state: { focusChat: true },
  });
  return true;
}

const PENDING_GREETING_KEY = 'learnlight:pendingGreeting';
const PENDING_COURSE_KEY = 'learnlight:pendingCourse';
const COURSE_CHAT_HANDOFF_PREFIX = 'learnlight:chat-handoff:';
const PENDING_COURSE_EVENT = 'learnlight:pending-course-changed';

export function createCourseChatHandoff(handoff: CourseChatHandoff): string {
  const handoffId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(`${COURSE_CHAT_HANDOFF_PREFIX}${handoffId}`, JSON.stringify(handoff));
  return handoffId;
}

/** Reads and deletes a single LearnLight navigation handoff. */
export function consumeCourseChatHandoff(handoffId: string | null): CourseChatHandoff | null {
  if (handoffId == null || !/^[\w-]{8,128}$/u.test(handoffId)) {
    return null;
  }
  const key = `${COURSE_CHAT_HANDOFF_PREFIX}${handoffId}`;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
  } catch {
    return null;
  }
  if (raw == null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CourseChatHandoff>;
    if (
      typeof parsed.promptPrefix !== 'string' ||
      parsed.promptPrefix.trim().length === 0 ||
      parsed.promptPrefix.length > 20000
    ) {
      return null;
    }
    if (
      parsed.prompt != null &&
      (typeof parsed.prompt !== 'string' || parsed.prompt.length > 20000)
    ) {
      return null;
    }
    return {
      promptPrefix: parsed.promptPrefix,
      ...(parsed.prompt ? { prompt: parsed.prompt } : {}),
    };
  } catch {
    return null;
  }
}

export function getPendingCourse(): number | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_COURSE_KEY);
  } catch {
    return null;
  }
  if (raw == null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setPendingCourse(canvasCourseId: number): void {
  sessionStorage.setItem(PENDING_COURSE_KEY, String(canvasCourseId));
  window.dispatchEvent(new Event(PENDING_COURSE_EVENT));
}

export function clearPendingCourse(): void {
  try {
    sessionStorage.removeItem(PENDING_COURSE_KEY);
    sessionStorage.removeItem(PENDING_GREETING_KEY);
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(COURSE_CHAT_HANDOFF_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be blocked; the in-memory course panel can still reset safely.
  }
  window.dispatchEvent(new Event(PENDING_COURSE_EVENT));
}

function getPendingGreeting(): string | null {
  try {
    return sessionStorage.getItem(PENDING_GREETING_KEY);
  } catch {
    return null;
  }
}

export function usePendingGreeting(): string | null {
  return useSyncExternalStore(subscribePendingCourse, getPendingGreeting);
}

function subscribePendingCourse(onStoreChange: () => void): () => void {
  window.addEventListener(PENDING_COURSE_EVENT, onStoreChange);
  return () => window.removeEventListener(PENDING_COURSE_EVENT, onStoreChange);
}

export function usePendingCourse(): number | null {
  return useSyncExternalStore(subscribePendingCourse, getPendingCourse);
}
