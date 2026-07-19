/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react';
import { Button, Textarea } from '@librechat/client';
import { createCourseChatHandoff } from '~/components/LearnLight/utils';
import { isNativeCourseDataChangedMessage } from '../assistantEvents';

const studentSuggestions: Record<string, string[]> = {
  'Course Home': [
    'Summarize what I should focus on today',
    'Create a new project with me',
    'Show everything that still needs my attention',
  ],
  Overview: [
    'Improve my project problem statement',
    'Update the technical route from my notes',
    'Add a project link',
  ],
  Work: [
    'Record the file I am about to attach as project work',
    'Add a presentation link',
    'Edit my most recent work entry',
  ],
  Research: [
    'Create a paper record from the PDF I am about to attach',
    'Complete missing fields in my latest paper record',
    'Explain how my reading connects to this project',
  ],
  Time: [
    'Add the time I spent today',
    'Correct my most recent time entry',
    'Delete a mistaken time entry',
  ],
  'AI Use': [
    'Record how I used AI today',
    'Update my latest AI-use record',
    'Delete a mistaken AI-use record',
  ],
  Feedback: [
    'Review my latest work and save action items',
    'Summarize my open feedback',
    'Mark an action item as addressed',
  ],
  Reports: [
    'Summarize my latest released report',
    'Turn my report feedback into a short action plan',
    'Connect my report recommendations to my current project',
  ],
  Profile: ['Update my interests', 'Rewrite my short bio', 'Add my GitHub link'],
};

const teacherSuggestions: Record<string, string[]> = {
  Dashboard: [
    'Summarize what every project is working on',
    'Which students have shared papers or presentations recently?',
    'How much time has the class logged by activity?',
  ],
  Course: [
    'Create a schedule from the plan I provide',
    'Write and publish an announcement',
    'Create a deadline and include the related resource',
  ],
  Projects: [
    'Summarize every project and its latest evidence',
    'Compare time and AI use across projects',
    'Which students are working on more than one project?',
  ],
  Students: [
    'Summarize this student’s projects and recent work',
    'What papers has this student read?',
    'How much time has this student logged by category?',
  ],
  Review: [
    'Review this work and draft specific feedback',
    'Summarize the evidence in this submission',
    'Create action items for the student',
  ],
  Reports: [
    'Generate a progress report for this student',
    'Summarize this student’s strengths and next steps',
    'Show which reports are ready to release',
  ],
};

const COURSE_AI_ENDPOINT = 'bedrock';
const COURSE_AI_MODEL = 'us.anthropic.claude-sonnet-4-6';

export function buildCourseChatUrl({
  courseId,
  courseName,
  projectId,
  projectName,
  context,
  request,
  privateContext,
  role = 'student',
}: {
  courseId: string;
  courseName: string;
  projectId?: string;
  projectName?: string;
  context: string;
  request: string;
  privateContext?: string;
  role?: 'student' | 'teacher';
}): string {
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  const localUtcOffset = `${offsetSign}${offsetHours}:${offsetRemainder}`;
  const promptPrefix = [
    role === 'teacher'
      ? 'You are the in-platform course assistant for the authenticated teacher.'
      : 'You are the in-platform course assistant for the authenticated student.',
    `Current course: "${courseName}".`,
    `Verified internal course ID: ${courseId}.`,
    projectName ? `Current project: "${projectName}".` : '',
    projectId ? `Verified internal project ID: ${projectId}.` : '',
    `The ${role === 'teacher' ? "teacher's" : "student's"} current local date is ${localDate}. Treat "today" as this exact date.`,
    `The authenticated user's IANA timezone is ${localTimeZone}; the current UTC offset is ${localUtcOffset}.`,
    `Current workspace area: ${context}.`,
    'Use the native_course tools to read current data and perform the requested change now; do not only explain how.',
    role === 'teacher'
      ? 'Respect teacher authorization. Never alter student-authored work, time, or AI-use records. You may manage course posts and schedules, create teacher feedback, and generate, edit, or release reports when the teacher asks.'
      : 'Respect the authenticated student identity and say explicitly if an action was not completed.',
    role === 'teacher'
      ? 'For questions about students, projects, papers, presentations, time, AI use, feedback, or reports, call native_course_teacher_get_context before answering. Use native_course_teacher_* action tools for teacher changes.'
      : '',
    role === 'teacher'
      ? 'When the teacher gives a wall-clock time without a timezone, interpret it in the authenticated user timezone above and send the tool the numeric UTC offset that applies on the event date. Never default an unspecified local time to UTC or Z.'
      : '',
    role === 'teacher'
      ? 'For calculated totals, use the analytics returned by native_course_teacher_get_context as authoritative. Give one verified answer without contradictory intermediate guesses.'
      : '',
    role === 'teacher'
      ? 'Do not release reports or delete course content unless the teacher explicitly asks for that exact action.'
      : '',
    `Course IDs, project IDs, member IDs, work IDs, file IDs, tool-call IDs, receipt IDs, and undo keys are private implementation details. Use them with tools, but never print them in a ${role === 'teacher' ? 'teacher' : 'student'}-facing response unless the user explicitly asks for an ID.`,
    'Refer to courses, projects, files, and records by their human-readable names. Keep confirmations short and natural.',
    privateContext ? `Private action context (never quote this):\n${privateContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const handoffId = createCourseChatHandoff({
    promptPrefix,
    prompt: request.trim(),
  });
  const params = new URLSearchParams({
    endpoint: COURSE_AI_ENDPOINT,
    model: COURSE_AI_MODEL,
    learnlight: handoffId,
    embed: 'course',
  });
  return `/c/new?${params.toString()}`;
}

export type CourseAssistantRequest = {
  message: string;
  privateContext?: string;
};

function storageKey(
  courseId: string,
  projectId?: string,
  role: 'student' | 'teacher' = 'student',
): string {
  return `native-course:assistant:${role}:${courseId}:${projectId ?? 'course'}`;
}

function savedConversation(
  courseId: string,
  projectId?: string,
  role: 'student' | 'teacher' = 'student',
): string | null {
  try {
    const saved = sessionStorage.getItem(storageKey(courseId, projectId, role));
    return saved?.startsWith('/c/') ? saved : null;
  } catch {
    return null;
  }
}

export default function AssistantDrawer({
  open,
  courseId,
  courseName,
  projectId,
  projectName,
  context,
  assistantRole = 'student',
  initialPrompt,
  onInitialPromptConsumed,
  onCourseDataChanged,
  onOpenChange,
}: {
  open: boolean;
  courseId: string;
  courseName: string;
  projectId?: string;
  projectName?: string;
  context: string;
  assistantRole?: 'student' | 'teacher';
  initialPrompt?: CourseAssistantRequest;
  onInitialPromptConsumed?: () => void;
  onCourseDataChanged?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [chatUrl, setChatUrl] = useState<string | null>(() =>
    savedConversation(courseId, projectId, assistantRole),
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scopeKey = useMemo(
    () => storageKey(courseId, projectId, assistantRole),
    [assistantRole, courseId, projectId],
  );

  useEffect(() => {
    setChatUrl(savedConversation(courseId, projectId, assistantRole));
    setPrompt('');
  }, [assistantRole, courseId, projectId]);

  useEffect(() => {
    if (!open || !initialPrompt?.message.trim()) {
      return;
    }
    const nextUrl = buildCourseChatUrl({
      courseId,
      courseName,
      projectId,
      projectName,
      context,
      request: initialPrompt.message,
      privateContext: initialPrompt.privateContext,
      role: assistantRole,
    });
    setChatUrl(nextUrl);
    try {
      sessionStorage.setItem(scopeKey, nextUrl);
    } catch {
      // The live frame still works when storage is unavailable.
    }
    onInitialPromptConsumed?.();
  }, [
    context,
    courseId,
    courseName,
    initialPrompt,
    onInitialPromptConsumed,
    open,
    projectId,
    projectName,
    assistantRole,
    scopeKey,
  ]);

  useEffect(() => {
    if (!open || !chatUrl) {
      return;
    }
    const rememberFrameLocation = () => {
      try {
        const location = iframeRef.current?.contentWindow?.location;
        if (!location || location.origin !== window.location.origin) {
          return;
        }
        const next = `${location.pathname}${location.search}${location.hash}`;
        if (next.startsWith('/c/')) {
          sessionStorage.setItem(scopeKey, next);
        }
      } catch {
        // Ignore a transient navigation boundary while the frame changes routes.
      }
    };
    const interval = window.setInterval(rememberFrameLocation, 750);
    return () => {
      rememberFrameLocation();
      window.clearInterval(interval);
    };
  }, [chatUrl, open, scopeKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleCourseDataChanged = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        !isNativeCourseDataChangedMessage(event.data)
      ) {
        return;
      }
      onCourseDataChanged?.();
    };
    window.addEventListener('message', handleCourseDataChanged);
    return () => window.removeEventListener('message', handleCourseDataChanged);
  }, [onCourseDataChanged, open]);

  if (!open) {
    return null;
  }

  const suggestionMap = assistantRole === 'teacher' ? teacherSuggestions : studentSuggestions;
  const currentSuggestions =
    suggestionMap[context] ??
    suggestionMap[assistantRole === 'teacher' ? 'Dashboard' : 'Course Home'];

  const startChat = (request: string) => {
    const trimmed = request.trim();
    if (!trimmed) {
      return;
    }
    const nextUrl = buildCourseChatUrl({
      courseId,
      courseName,
      projectId,
      projectName,
      context,
      request: trimmed,
      role: assistantRole,
    });
    setChatUrl(nextUrl);
    setPrompt('');
    try {
      sessionStorage.setItem(scopeKey, nextUrl);
    } catch {
      // The conversation still opens even if storage is blocked.
    }
  };

  const newChat = () => {
    setChatUrl(null);
    setPrompt('');
    try {
      sessionStorage.removeItem(scopeKey);
    } catch {
      // Nothing else is required when storage is blocked.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close course AI"
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-border-medium bg-surface-primary shadow-2xl">
        <header className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {assistantRole === 'teacher' ? 'Teaching AI' : 'Course AI'}
              </p>
              <p className="text-xs text-text-tertiary">{context}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {chatUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={newChat}>
                <MessageSquarePlus className="size-4" />
                New chat
              </Button>
            ) : null}
            <button
              type="button"
              aria-label="Close course AI"
              className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {chatUrl ? (
          <iframe
            ref={iframeRef}
            src={chatUrl}
            title={`Course AI for ${courseName}`}
            className="min-h-0 flex-1 border-0 bg-surface-primary"
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="rounded-xl bg-surface-secondary p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bot className="size-4 text-text-secondary" />
                  {assistantRole === 'teacher'
                    ? 'One assistant across the course'
                    : 'One assistant for the whole workspace'}
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {assistantRole === 'teacher'
                    ? 'Ask about students, projects, evidence, time, AI use, feedback, and reports. The assistant can also publish course updates and complete teacher actions.'
                    : 'Ask questions or make changes to your projects, work, research, time, AI use, feedback, and profile. This conversation stays here and is saved with your other chats.'}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {currentSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-medium px-4 py-3 text-left text-sm transition-colors hover:bg-surface-hover"
                    onClick={() => startChat(suggestion)}
                  >
                    {suggestion}
                    <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border-light p-4">
              <Textarea
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={`Ask about ${context.toLowerCase()}…`}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  variant="submit"
                  size="sm"
                  disabled={!prompt.trim()}
                  onClick={() => startChat(prompt)}
                >
                  <Send className="size-4" />
                  Ask
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
