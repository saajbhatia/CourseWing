import { useMemo, useState } from 'react';
import { Spinner } from '@librechat/client';
import { addDays, format, isSameDay } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUp, Files, Sparkles } from 'lucide-react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { LearnLinkAssignment } from '~/data-provider/LearnLink';
import type { LearnLinkCourseIdentity } from './utils';
import { useCourseMaterialsQuery, useCurrentCoursesQuery } from '~/data-provider/LearnLink';
import {
  getDisplayCourseName,
  getAssignmentPrefix,
  getCourseInitial,
  getReviewPrefix,
  getCoursePrefix,
  getCourseColor,
  openCourseChat,
  learnlinkNow,
} from './utils';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn } from '~/utils';

type CourseTab = 'overview' | 'assignments';

type AssignmentBuckets = {
  upNext: LearnLinkAssignment[];
  overdue: LearnLinkAssignment[];
  thisWeek: LearnLinkAssignment[];
  later: LearnLinkAssignment[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const UP_NEXT_LIMIT = 5;

const pillButtonClassName =
  'shrink-0 rounded-full border border-border-medium px-3.5 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

const smartPromptKeys: TranslationKeys[] = [
  'com_ui_course_prompt_quiz',
  'com_ui_course_prompt_study_guide',
  'com_ui_course_prompt_plan',
];

function bucketAssignments(assignments: LearnLinkAssignment[], now: number): AssignmentBuckets {
  const overdue: LearnLinkAssignment[] = [];
  const thisWeek: LearnLinkAssignment[] = [];
  const later: LearnLinkAssignment[] = [];
  const undated: LearnLinkAssignment[] = [];

  for (const assignment of assignments) {
    const due = assignment.dueAt != null ? Date.parse(assignment.dueAt) : Number.NaN;
    if (Number.isNaN(due)) {
      undated.push(assignment);
    } else if (due < now) {
      overdue.push(assignment);
    } else if (due <= now + WEEK_MS) {
      thisWeek.push(assignment);
    } else {
      later.push(assignment);
    }
  }

  const byDueAsc = (a: LearnLinkAssignment, b: LearnLinkAssignment) =>
    Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? '');
  overdue.sort((a, b) => byDueAsc(b, a));
  thisWeek.sort(byDueAsc);
  later.sort(byDueAsc);

  const upcoming = thisWeek.concat(later);
  const upNext = (upcoming.length > 0 ? upcoming : overdue).slice(0, UP_NEXT_LIMIT);

  return { upNext, overdue, thisWeek, later: later.concat(undated) };
}

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
  const now = learnlinkNow();
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
  assignment: LearnLinkAssignment;
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

function CourseView({ course }: { course: LearnLinkCourseIdentity & { name: string } }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { newConversation } = useNewConvo();
  const [draft, setDraft] = useState('');
  const [activeTab, setActiveTab] = useState<CourseTab>('overview');
  const { data: materials, isLoading: isMaterialsLoading } = useCourseMaterialsQuery(
    course.canvasCourseId,
  );

  const buckets = useMemo(
    () => bucketAssignments(materials?.assignments ?? [], learnlinkNow().getTime()),
    [materials],
  );

  const displayName = getDisplayCourseName(course.name);
  const color = getCourseColor(course.canvasCourseId);

  const startAssignmentChat = (assignment: LearnLinkAssignment) => {
    openCourseChat(navigate, newConversation, course, {
      promptPrefix: getAssignmentPrefix(course, assignment),
      greeting: localize('com_ui_assignment_chat_greeting', { name: assignment.name }),
    });
  };

  const startPromptChat = (text: string) => {
    openCourseChat(navigate, newConversation, course, {
      promptPrefix: getCoursePrefix(course),
      prompt: text,
    });
  };

  const startReviewChat = () => {
    openCourseChat(navigate, newConversation, course, {
      promptPrefix: getReviewPrefix(course),
      prompt: localize('com_ui_course_prompt_review'),
    });
  };

  const handleComposerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    openCourseChat(navigate, newConversation, course, {
      promptPrefix: getCoursePrefix(course),
      ...(text ? { prompt: text } : { greeting: localize('com_ui_course_chat_greeting') }),
    });
  };

  const tabs: Array<{ key: CourseTab; label: string }> = [
    { key: 'overview', label: localize('com_ui_overview') },
    { key: 'assignments', label: localize('com_ui_assignments') },
  ];

  const renderRows = (assignments: LearnLinkAssignment[]) => (
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

  const assignmentGroups: Array<{ key: TranslationKeys; assignments: LearnLinkAssignment[] }> = [
    { key: 'com_ui_overdue', assignments: buckets.overdue },
    { key: 'com_ui_this_week', assignments: buckets.thisWeek },
    { key: 'com_ui_later', assignments: buckets.later },
  ];
  const hasAssignments = assignmentGroups.some((group) => group.assignments.length > 0);

  const renderEmpty = () =>
    isMaterialsLoading ? (
      <div className="flex justify-start py-2">
        <Spinner className="h-4 w-4 text-text-secondary" />
      </div>
    ) : (
      <div className="py-2 text-sm text-text-secondary">{localize('com_ui_no_assignments')}</div>
    );

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
            className="flex items-center gap-2 rounded-3xl border border-border-medium bg-surface-primary px-4 py-2 shadow-sm"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={localize('com_ui_ask_about_course', { name: displayName })}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
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

  const { data: currentCourses = [], isLoading } = useCurrentCoursesQuery();
  const course = currentCourses.find((item) => item.canvasCourseId === canvasCourseId);

  if (course != null) {
    return <CourseView key={course.canvasCourseId} course={course} />;
  }

  if (isLoading && canvasCourseId != null) {
    return (
      <main className="flex h-full items-center justify-center bg-surface-primary">
        <Spinner className="h-5 w-5 text-text-secondary" />
      </main>
    );
  }

  return (
    <main className="flex h-full items-center justify-center bg-surface-primary">
      <p className="text-sm text-text-secondary">{localize('com_ui_course_not_found')}</p>
    </main>
  );
}
