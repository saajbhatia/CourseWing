import { useSyncExternalStore } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { LearnLinkAssignment, LearnLinkCourseSummary } from '~/data-provider/LearnLink';
import { Constants } from 'librechat-data-provider';

export type LearnLinkCourseIdentity = Pick<
  LearnLinkCourseSummary,
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

export function getCoursePrefix(course: LearnLinkCourseIdentity): string {
  return [
    `Current Canvas course: ${course.name}`,
    course.courseCode ? `Course code: ${course.courseCode}` : '',
    'The student is chatting within this course. Ground your help in this course’s material.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getAssignmentPrefix(
  course: LearnLinkCourseIdentity,
  assignment: LearnLinkAssignment,
): string {
  return [
    getCoursePrefix(course),
    `Assignment: ${assignment.name}`,
    assignment.dueAt ? `Due: ${assignment.dueAt}` : '',
    'The student wants help with this assignment. Guide them through it rather than doing it for them.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type NewConversationCall = (options?: { disableFocus?: boolean }) => void;

export type CourseChatOptions = {
  promptPrefix: string;
  greeting?: string;
  prompt?: string;
};

export function openCourseChat(
  navigate: NavigateFunction,
  newConversation: NewConversationCall,
  course: LearnLinkCourseIdentity,
  options: CourseChatOptions,
): void {
  if (options.greeting) {
    sessionStorage.setItem(PENDING_GREETING_KEY, options.greeting);
  } else {
    sessionStorage.removeItem(PENDING_GREETING_KEY);
  }
  setPendingCourse(course.canvasCourseId);
  newConversation({ disableFocus: true });
  const params = new URLSearchParams({ promptPrefix: options.promptPrefix });
  if (options.prompt) {
    params.set('prompt', options.prompt);
    params.set('submit', 'true');
  }
  navigate(`/c/${Constants.NEW_CONVO}?${params.toString()}`, { state: { focusChat: true } });
}

const PENDING_COURSE_KEY = 'learnlink:pendingCourse';
const PENDING_GREETING_KEY = 'learnlink:pendingGreeting';
const PENDING_COURSE_EVENT = 'learnlink:pending-course-changed';

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
