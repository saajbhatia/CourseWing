import { useMemo, useState } from 'react';
import { Spinner, useToastContext } from '@librechat/client';
import { addDays, format, isSameDay } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUp, Files, Sparkles } from 'lucide-react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { LearnLightAssignment } from '~/data-provider/LearnLight';
import type { LearnLightCourseIdentity } from './utils';
import {
  useCanvasConnectionQuery,
  useCourseMaterialsQuery,
  useCurrentCoursesQuery,
} from '~/data-provider/LearnLight';
import { bucketAssignments } from './assignments';
import {
  getDisplayCourseName,
  getAssignmentPrefix,
  getCourseInitial,
  getReviewPrefix,
  getCoursePrefix,
  getCourseColor,
  openCourseChat,
  learnlightNow,
} from './utils';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn } from '~/utils';

type CourseTab = 'overview' | 'assignments';

const pillButtonClassName =
  'shrink-0 rounded-full border border-border-medium px-3.5 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

const smartPromptKeys: TranslationKeys[] = [
  'com_ui_course_prompt_quiz',
  'com_ui_course_prompt_study_guide',
  'com_ui_course_prompt_plan',
];

function getDueLabel(
  localize: ReturnType<typeof useLocalize>,
  dueAt: string | null,
): string | null {
  if (dueAt == null) {
    return null;
  }
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const now = learnlightNow();
  if (isSameDay(due, now)) {
    return localize('com_ui_due_today');
  }
  if (isSameDay(due, addDays(now, 1))) {
    return localize('com_ui_due_tomorrow');
  }
  const pattern = due.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy';
  return localize('com_ui_due_date', { date: format(due, pattern) });
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {label}
    </div>
  );
}

function AssignmentRow({
  assignment,
  dueLabel,
  onChat,
}: {
  assignment: LearnLightAssignment;
  dueLabel: string | null;
  onChat: () => void;
}) {
  const localize = useLocalize();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-light px-3.5 py-2.5">
      <Files className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{assignment.name}</span>
      {dueLabel != null && <span className="shrink-0 text-xs text-text-tertiary">{dueLabel}</span>}
      <button type="button" className={pillButtonClassName} onClick={onChat}>
        {localize('com_ui_chat')}
      </button>
    </div>
  );
}

function CourseView({ course }: { course: LearnLightCourseIdentity & { name: string } }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const navigate = useNavigate();
  const { newConversation } = useNewConvo();
  const [draft, setDraft] = useState('');
  const [activeTab, setActiveTab] = useState<CourseTab>('overview');
  const {
    data: materials,
    isLoading: isMaterialsLoading,
    isError: isMaterialsError,
    refetch: refetchMaterials,
  } = useCourseMaterialsQuery(course.canvasCourseId);

  const buckets = useMemo(
    () => bucketAssignments(materials?.assignments ?? [], learnlightNow().getTime()),
    [materials],
  );

  const displayName = getDisplayCourseName(course.name);
  const color = getCourseColor(course.canvasCourseId);

  const startCourseChat = (options: Parameters<typeof openCourseChat>[3]) => {
    if (!openCourseChat(navigate, newConversation, course, options)) {
      showToast({
        status: 'error',
        message: localize('com_ui_guest_handoff_error'),
      });
    }
  };

  const startAssignmentChat = (assignment: LearnLightAssignment) => {
    startCourseChat({
      promptPrefix: getAssignmentPrefix(course, assignment),
      greeting: localize('com_ui_assignment_chat_greeting', { name: assignment.name }),
    });
  };

  const startPromptChat = (text: string) => {
    startCourseChat({
      promptPrefix: getCoursePrefix(course),
      prompt: text,
    });
  };

  const startReviewChat = () => {
    startCourseChat({
      promptPrefix: getReviewPrefix(course),
      prompt: localize('com_ui_course_prompt_review'),
    });
  };

  const handleComposerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    startCourseChat({
      promptPrefix: getCoursePrefix(course),
      ...(text ? { prompt: text } : { greeting: localize('com_ui_course_chat_greeting') }),
    });
  };

  const tabs: Array<{ key: CourseTab; label: string }> = [
    { key: 'overview', label: localize('com_ui_overview') },
    { key: 'assignments', label: localize('com_ui_assignments') },
  ];

  const renderRows = (assignments: LearnLightAssignment[]) => (
    <div className="flex flex-col gap-1.5">
      {assignments.map((assignment) => (
        <AssignmentRow
          key={assignment.id}
          assignment={assignment}
          dueLabel={getDueLabel(localize, assignment.dueAt)}
          onChat={() => startAssignmentChat(assignment)}
        />
      ))}
    </div>
  );

  const assignmentGroups: Array<{ key: TranslationKeys; assignments: LearnLightAssignment[] }> = [
    { key: 'com_ui_overdue', assignments: buckets.overdue },
    { key: 'com_ui_this_week', assignments: buckets.thisWeek },
    { key: 'com_ui_later', assignments: buckets.later },
    { key: 'com_ui_completed', assignments: buckets.completed },
  ];
  const hasAssignments = assignmentGroups.some((group) => group.assignments.length > 0);

  const renderEmpty = () => {
    if (isMaterialsLoading) {
      return (
        <div className="flex justify-start py-2">
          <Spinner className="h-4 w-4 text-text-secondary" />
        </div>
      );
    }
    if (isMaterialsError) {
      return (
        <div className="flex items-center gap-3 py-2 text-sm text-text-secondary">
          <span>{localize('com_ui_courses_unavailable')}</span>
          <button
            type="button"
            className="font-medium text-text-primary underline underline-offset-2"
            onClick={() => void refetchMaterials()}
          >
            {localize('com_ui_retry')}
          </button>
        </div>
      );
    }
    return (
      <div className="py-2 text-sm text-text-secondary">{localize('com_ui_no_assignments')}</div>
    );
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-primary text-text-primary">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pt-6 md:px-6">
        <header className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold"
            style={{ backgroundColor: color.background, color: color.foreground }}
            aria-hidden="true"
          >
            {getCourseInitial(displayName)}
          </span>
          <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{displayName}</h1>
        </header>

        <div role="tablist" className="mt-3 flex gap-6 border-b border-border-light">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'border-b-2 pb-2.5 pt-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                activeTab === tab.key
                  ? 'border-text-primary font-semibold text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              <div>
                <SectionLabel label={localize('com_ui_up_next')} />
                {buckets.upNext.length > 0 ? renderRows(buckets.upNext) : renderEmpty()}
              </div>
              <button
                type="button"
                onClick={startReviewChat}
                className="flex items-center gap-3 rounded-xl border border-border-medium px-3.5 py-2.5 text-left transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {localize('com_ui_course_review_session')}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {localize('com_ui_course_review_session_desc')}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              </button>
              <div className="flex flex-col gap-0.5">
                {smartPromptKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => startPromptChat(localize(key))}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                  >
                    {localize(key)}
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-text-tertiary"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'assignments' &&
            (hasAssignments ? (
              <div className="flex flex-col gap-5">
                {assignmentGroups.map(
                  (group) =>
                    group.assignments.length > 0 && (
                      <div key={group.key}>
                        <SectionLabel label={localize(group.key)} />
                        {renderRows(group.assignments)}
                      </div>
                    ),
                )}
              </div>
            ) : (
              renderEmpty()
            ))}
        </div>

        <div className="pb-4">
          <div className="pb-1.5 text-center text-xs text-text-tertiary">
            {localize('com_ui_course_chat_disclosure')}
          </div>
          <form
            onSubmit={handleComposerSubmit}
            className="flex items-center gap-2 rounded-3xl border border-border-medium bg-surface-primary px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-ring-primary"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={localize('com_ui_ask_about_course', { name: displayName })}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label={localize('com_nav_send_message')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function CoursePage() {
  const localize = useLocalize();
  const { courseId = '' } = useParams();
  const parsedId = Number.parseInt(courseId, 10);
  const canvasCourseId = Number.isFinite(parsedId) ? parsedId : null;

  const connection = useCanvasConnectionQuery();
  const {
    data: currentCourses = [],
    isLoading,
    isError: isCoursesError,
    refetch: refetchCourses,
  } = useCurrentCoursesQuery();
  const course = currentCourses.find((item) => item.canvasCourseId === canvasCourseId);

  if (connection.data?.connected === true && course != null) {
    return <CourseView key={course.canvasCourseId} course={course} />;
  }

  if (
    canvasCourseId != null &&
    (connection.isLoading || (connection.data?.connected === true && isLoading))
  ) {
    return (
      <main className="flex h-full items-center justify-center bg-surface-primary">
        <Spinner className="h-5 w-5 text-text-secondary" />
      </main>
    );
  }

  if (connection.isError || isCoursesError) {
    return (
      <main className="flex h-full items-center justify-center gap-3 bg-surface-primary text-sm text-text-secondary">
        <span>{localize('com_ui_courses_unavailable')}</span>
        <button
          type="button"
          className="font-medium text-text-primary underline underline-offset-2"
          onClick={() => void (connection.isError ? connection.refetch() : refetchCourses())}
        >
          {localize('com_ui_retry')}
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-full items-center justify-center bg-surface-primary">
      <p className="text-sm text-text-secondary">{localize('com_ui_course_not_found')}</p>
    </main>
  );
}
