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

function getCourseContext(course: LearnLinkCourseIdentity): string {
  return [
    `Current Canvas course: ${course.name}`,
    course.courseCode ? `Course code: ${course.courseCode}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getCoursePrompt(course: LearnLinkCourseIdentity): string {
  return `${getCourseContext(course)}\nHelp me with this course. First ask what assignment, topic, or file I want to work on.`;
}

export function getAssignmentPrompt(
  course: LearnLinkCourseIdentity,
  assignment: LearnLinkAssignment,
): string {
  return [
    getCourseContext(course),
    `Assignment: ${assignment.name}`,
    assignment.dueAt ? `Due: ${assignment.dueAt}` : '',
    'I want help with this assignment. First ask what part I am working on.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getCourseMessagePrompt(course: LearnLinkCourseIdentity, text: string): string {
  return `${getCourseContext(course)}\n\n${text}`;
}

export type NewConversationCall = (options?: { disableFocus?: boolean }) => void;

export function openCourseChat(
  navigate: NavigateFunction,
  newConversation: NewConversationCall,
  course: LearnLinkCourseIdentity,
  prompt: string,
): void {
  setPendingCourse(course.canvasCourseId);
  newConversation({ disableFocus: true });
  navigate(`/c/${Constants.NEW_CONVO}?prompt=${encodeURIComponent(prompt)}`, {
    state: { focusChat: true },
  });
}

const PENDING_COURSE_KEY = 'learnlink:pendingCourse';
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
  window.dispatchEvent(new Event(PENDING_COURSE_EVENT));
}

function subscribePendingCourse(onStoreChange: () => void): () => void {
  window.addEventListener(PENDING_COURSE_EVENT, onStoreChange);
  return () => window.removeEventListener(PENDING_COURSE_EVENT, onStoreChange);
}

export function usePendingCourse(): number | null {
  return useSyncExternalStore(subscribePendingCourse, getPendingCourse);
}
