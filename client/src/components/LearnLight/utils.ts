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

/** Demo/testing override: `VITE_LEARNLIGHT_FAKE_NOW` makes course views pretend "now" is that instant. */
export function learnlightNow(): Date {
  return Number.isNaN(fakeNowMs) ? new Date() : new Date(fakeNowMs);
}

export const iconButtonClassName =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

export function getCourseColor(canvasCourseId: number): { background: string; foreground: string } {
  return courseColors[Math.abs(canvasCourseId) % courseColors.length];
}

export function getCourseInitial(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? '';
  return firstWord.charAt(0).toUpperCase() || 'C';
}

export function getDisplayCourseName(name: string): string {
  return name
    .replace(/\s+(?:20)?\d{2}\s*[-–]\s*(?:20)?\d{2}\s*$/u, '')
    .replace(/\s+\(?\d{4}\)?\s*$/u, '')
    .trim();
}

export function getCoursePrefix(course: LearnLightCourseIdentity): string {
  return [
    `Current Canvas course: ${course.name}`,
    `Canvas course ID: ${course.canvasCourseId}`,
    course.courseCode ? `Course code: ${course.courseCode}` : '',
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
    `Assignment: ${assignment.name}`,
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

/**
 * Course chats opened via URL params can't use a `spec` param — useQueryParams replaces the
 * whole preset with the spec's, dropping promptPrefix. Instead carry the "GPT-5.5 (Instant)"
 * spec's latency-critical settings (librechat.yaml) directly; they merge with promptPrefix.
 */
const INSTANT_PRESET_PARAMS = {
  reasoning_effort: 'none',
  useResponsesApi: 'true',
} as const;

export type NewConversationCall = (options?: { disableFocus?: boolean }) => void;

export type CourseChatOptions = {
  promptPrefix: string;
  greeting?: string;
  prompt?: string;
};

export function openCourseChat(
  navigate: NavigateFunction,
  newConversation: NewConversationCall,
  course: LearnLightCourseIdentity,
  options: CourseChatOptions,
): void {
  if (options.greeting) {
    sessionStorage.setItem(PENDING_GREETING_KEY, options.greeting);
  } else {
    sessionStorage.removeItem(PENDING_GREETING_KEY);
  }
  setPendingCourse(course.canvasCourseId);
  newConversation({ disableFocus: true });
  const params = new URLSearchParams({
    promptPrefix: options.promptPrefix,
    ...INSTANT_PRESET_PARAMS,
  });
  if (options.prompt) {
    params.set('prompt', options.prompt);
    params.set('submit', 'true');
  }
  navigate(`/c/${Constants.NEW_CONVO}?${params.toString()}`, { state: { focusChat: true } });
}

const PENDING_COURSE_KEY = 'learnlight:pendingCourse';
const PENDING_GREETING_KEY = 'learnlight:pendingGreeting';
const PENDING_COURSE_EVENT = 'learnlight:pending-course-changed';

export function getPendingCourse(): number | null {
  const raw = sessionStorage.getItem(PENDING_COURSE_KEY);
  if (raw == null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setPendingCourse(canvasCourseId: number): void {
  sessionStorage.setItem(PENDING_COURSE_KEY, String(canvasCourseId));
  window.dispatchEvent(new Event(PENDING_COURSE_EVENT));
}

export function clearPendingCourse(): void {
  sessionStorage.removeItem(PENDING_COURSE_KEY);
  sessionStorage.removeItem(PENDING_GREETING_KEY);
  window.dispatchEvent(new Event(PENDING_COURSE_EVENT));
}

function getPendingGreeting(): string | null {
  return sessionStorage.getItem(PENDING_GREETING_KEY);
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
