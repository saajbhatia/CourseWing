/* eslint-disable i18next/no-literal-string */
import { useMemo, useState } from 'react';
import { Spinner, useToastContext } from '@librechat/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield,
  ArrowUp,
  Sparkles,
  BookOpen,
  ArrowLeft,
  FolderPlus,
  TriangleAlert,
} from 'lucide-react';
import { request } from 'librechat-data-provider';
import type { LearnLightCourseSummary } from '~/data-provider/LearnLight';
import { useCourseMaterialsQuery } from '~/data-provider/LearnLight';
import { useGetStartupConfig } from '~/data-provider';
import {
  getDisplayCourseName,
  getCourseInitial,
  getCourseColor,
  openTeacherAssistantChat,
} from './utils';
import { useNewConvo, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type TeacherTab = 'pulse' | 'students' | 'assign' | 'queue' | 'levels';
type ConsoleLevel = 'open' | 'guided' | 'socratic';

type ReceiptView = {
  conversationId: string;
  userId: string;
  student: string;
  initials: string;
  topic: string;
  summary: string;
  helpLevel: string;
  durationMinutes: number;
  lastMessageAt: string;
  flagType: string | null;
  flagStatus: string;
  flagNote: string | null;
};

type StudentRow = {
  userId: string;
  name: string;
  initials: string;
  email: string | null;
  sessions: number;
  lastMessageAt: string;
  status: string;
};

type Overview = {
  stats: {
    sessionsThisWeek: number;
    sessionsPriorWeek: number;
    activeStudentsThisWeek: number;
    totalStudents: number;
    avgMinutes: number;
    pendingFlags: number;
    totalSessions: number;
  };
  pulse: { headline: string; insight: string; topics: { name: string; count: number }[] } | null;
  students: StudentRow[];
  latestReceipts: ReceiptView[];
};

type StudentDetail = {
  userId: string;
  name: string;
  initials: string;
  sessions: number;
  lastMessageAt: string;
  status: string;
  profile: { doingWell: string; needsHelp: string; usesFor: string } | null;
  receipts: ReceiptView[];
};

type CourseSettings = {
  helpLevel: ConsoleLevel;
  overrides: {
    canvasAssignmentId: number;
    name: string;
    level: ConsoleLevel;
    blockedRules: string[];
  }[];
};

type Activity = {
  id: string;
  title: string;
  type: string;
  level: ConsoleLevel;
  dueAt: string | null;
  audience: string[];
  startedCount: number;
};

const ACTIVITY_TYPES = ['Practice set', 'Review session', 'Warm-up', 'Announcement'];
const OVERRIDE_RULES = [
  'Brainstorm ideas',
  'Outline help',
  'Feedback on drafts',
  'Write full text',
  'Answers to graded work',
];
const LEVEL_DEFS: { id: ConsoleLevel; name: string; desc: string }[] = [
  {
    id: 'open',
    name: 'Open',
    desc: 'Explains anything fully, including complete worked solutions on practice material.',
  },
  {
    id: 'guided',
    name: 'Guided (recommended)',
    desc: 'Generous explanations and worked examples — but never finished essays, homework answers, or take-home solutions.',
  },
  {
    id: 'socratic',
    name: 'Socratic',
    desc: 'Leads with questions and hints; reveals steps only after the student attempts them.',
  },
];

const VIEW_TITLES: Record<TeacherTab, string> = {
  pulse: 'Class pulse',
  students: 'Students',
  assign: 'Assign to class',
  queue: 'Review queue',
  levels: 'Help levels',
};

const pillButtonClassName =
  'shrink-0 rounded-full border border-border-medium px-3.5 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';
const cardClassName = 'rounded-xl border border-border-light';

function fmtWhen(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusChipClass(status: string): string {
  if (status === 'On track') {
    return 'bg-green-500/10 text-green-700 dark:text-green-400';
  }
  if (status === 'Light usage') {
    return 'bg-surface-tertiary text-text-secondary';
  }
  return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

function flagStatusLabel(flagStatus: string): string {
  if (flagStatus === 'pending') {
    return 'Awaiting review';
  }
  if (flagStatus === 'dismissed') {
    return 'Dismissed — no issue';
  }
  return 'Escalated to admin';
}

function flagTitle(flagType: string | null): string {
  if (flagType === 'answer_seeking') {
    return 'Possible answer-seeking on graded work';
  }
  if (flagType === 'wellbeing') {
    return 'Possible wellbeing concern';
  }
  return 'Possible academic-integrity issue';
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {label}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        statusChipClass(status),
      )}
    >
      {status}
    </span>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
        active
          ? 'border-green-600/50 bg-green-500/10 text-text-primary'
          : 'border-border-light bg-surface-primary text-text-secondary hover:text-text-primary',
      )}
    >
      {label}
    </button>
  );
}

export default function TeacherCourseView({ course }: { course: LearnLightCourseSummary }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { data: startupConfig } = useGetStartupConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') ?? 'pulse';
  const activeTab: TeacherTab = (
    ['pulse', 'students', 'assign', 'queue', 'levels'] as TeacherTab[]
  ).includes(tabParam as TeacherTab)
    ? (tabParam as TeacherTab)
    : 'pulse';
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const goTab = (tab: TeacherTab, options?: { keepStudent?: boolean }) => {
    if (!options?.keepStudent) {
      setSelectedStudent(null);
    }
    setSearchParams(tab === 'pulse' ? {} : { tab }, { replace: true });
  };
  const [studentSearch, setStudentSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Practice set');
  const [newLevel, setNewLevel] = useState<ConsoleLevel>('guided');
  const [newDue, setNewDue] = useState('');
  const [newStudents, setNewStudents] = useState<string[]>([]);
  const [addingOverride, setAddingOverride] = useState(false);

  const courseId = course.canvasCourseId;
  const base = `/api/learnlight/teacher/courses/${courseId}`;
  const displayName = getDisplayCourseName(course.name);
  const color = getCourseColor(courseId);

  const overview = useQuery(
    ['tcOverview', courseId],
    () => request.get<Overview>(`${base}/overview`),
    {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const queue = useQuery(
    ['tcQueue', courseId],
    () => request.get<{ queue: ReceiptView[] }>(`${base}/queue`),
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const settings = useQuery(
    ['tcSettings', courseId],
    () => request.get<CourseSettings>(`${base}/settings`),
    {
      refetchOnWindowFocus: false,
    },
  );
  const activities = useQuery(
    ['tcActivities', courseId],
    () => request.get<{ activities: Activity[] }>(`${base}/activities`),
    { refetchOnWindowFocus: false },
  );
  const studentDetail = useQuery(
    ['tcStudent', courseId, selectedStudent],
    () => request.get<StudentDetail>(`${base}/students/${selectedStudent}`),
    { enabled: selectedStudent != null, refetchOnWindowFocus: false },
  );
  const materials = useCourseMaterialsQuery(addingOverride ? courseId : null);

  const saveSettings = useMutation(
    (body: Partial<CourseSettings>) => request.put(`${base}/settings`, body),
    { onSettled: () => queryClient.invalidateQueries(['tcSettings', courseId]) },
  );
  const flagAction = useMutation(
    ({ conversationId, action }: { conversationId: string; action: 'dismiss' | 'escalate' }) =>
      request.post(`${base}/receipts/${conversationId}/flag`, { action }),
    {
      onSuccess: (_, { conversationId, action }) => {
        if (action !== 'dismiss') {
          return;
        }
        queryClient.setQueryData<{ queue: ReceiptView[] }>(['tcQueue', courseId], (current) =>
          current == null
            ? current
            : {
                queue: current.queue.filter((receipt) => receipt.conversationId !== conversationId),
              },
        );
      },
      onSettled: () => {
        queryClient.invalidateQueries(['tcQueue', courseId]);
        queryClient.invalidateQueries(['tcOverview', courseId]);
      },
    },
  );
  const pushActivity = useMutation(
    (body: {
      title: string;
      type: string;
      level: ConsoleLevel;
      dueAt: string | null;
      audience: string[];
    }) => request.post(`${base}/activities`, body),
    { onSettled: () => queryClient.invalidateQueries(['tcActivities', courseId]) },
  );

  const pendingFlags = useMemo(
    () => (queue.data?.queue ?? []).filter((q) => q.flagStatus === 'pending').length,
    [queue.data],
  );

  const startAssistantChat = (prompt?: string) => {
    const defaultSpec = startupConfig?.modelSpecs?.list?.find((spec) => spec.default)?.name;
    const opened = openTeacherAssistantChat(navigate, newConversation, course, {
      ...(defaultSpec ? { spec: defaultSpec } : {}),
      ...(prompt ? { prompt } : {}),
    });
    if (!opened) {
      showToast({ status: 'error', message: localize('com_ui_guest_handoff_error') });
    }
  };

  const unlockTranscript = async (conversationId: string) => {
    try {
      const res = (await request.post(`${base}/receipts/${conversationId}/unlock`, {})) as {
        transcript: string;
      };
      setTranscripts((prev) => ({ ...prev, [conversationId]: res.transcript }));
    } catch {
      setTranscripts((prev) => ({ ...prev, [conversationId]: 'Failed to load transcript.' }));
    }
  };

  const stats = overview.data?.stats;
  const students = overview.data?.students ?? [];
  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()),
  );

  const statCards = stats
    ? [
        { label: 'Sessions', value: String(stats.sessionsThisWeek), sub: 'this week' },
        {
          label: 'Students using it',
          value: `${stats.activeStudentsThisWeek}/${stats.totalStudents}`,
          sub: 'this week',
        },
        { label: 'Avg. time', value: `${stats.avgMinutes}m`, sub: 'per session' },
        { label: 'Flags pending', value: String(stats.pendingFlags), sub: 'in review queue' },
      ]
    : [];

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-primary text-text-primary">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col px-4 pt-6 md:px-6">
        <header className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold"
            style={{ backgroundColor: color.background, color: color.foreground }}
            aria-hidden="true"
          >
            {getCourseInitial(displayName)}
          </span>
          <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{displayName}</h1>
          <span className="shrink-0 rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
            Teacher
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          <div className="flex items-baseline justify-between pb-2 pt-2">
            <h2 className="text-lg font-bold tracking-tight">{VIEW_TITLES[activeTab]}</h2>
            {activeTab === 'pulse' && stats ? (
              <span className="text-xs text-text-tertiary">
                Last 7 days · {stats.totalStudents} student{stats.totalStudents === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          {overview.isLoading ? (
            <div className="flex items-center gap-3 py-2 text-sm text-text-secondary">
              <Spinner className="h-4 w-4" />
              Reading new sessions and building receipts…
            </div>
          ) : null}

          {activeTab === 'pulse' && !overview.isLoading && (
            <div className="flex flex-col gap-4">
              {overview.data?.pulse ? (
                <div className="rounded-xl border border-green-600/40 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    This week in {displayName}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{overview.data.pulse.headline}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={pillButtonClassName}
                      onClick={() =>
                        startAssistantChat(
                          'Draft a 15-minute warm-up targeting the most common struggle this week.',
                        )
                      }
                    >
                      Draft a warm-up
                    </button>
                    <button
                      type="button"
                      className={pillButtonClassName}
                      onClick={() => goTab('assign')}
                    >
                      Assign a review activity
                    </button>
                    <button
                      type="button"
                      className={pillButtonClassName}
                      onClick={() => startAssistantChat()}
                    >
                      Ask a follow-up…
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cn(cardClassName, 'p-4 text-sm text-text-secondary')}>
                  No tutor sessions yet — the pulse fills in once students start chatting in this
                  course.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {statCards.map((st) => (
                  <div key={st.label} className={cn(cardClassName, 'px-3.5 py-3')}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      {st.label}
                    </div>
                    <div className="mt-1 text-2xl font-bold">{st.value}</div>
                    <div className="text-xs text-text-secondary">{st.sub}</div>
                  </div>
                ))}
              </div>

              {(overview.data?.pulse?.insight || pendingFlags > 0) && (
                <div>
                  <SectionLabel label="Needs attention" />
                  <div className="flex flex-col gap-1.5">
                    {overview.data?.pulse?.insight ? (
                      <div className={cn(cardClassName, 'flex items-center gap-3 px-3.5 py-2.5')}>
                        <TriangleAlert
                          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">Shared sticking point</span>
                          <span className="block text-xs text-text-secondary">
                            {overview.data.pulse.insight}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={pillButtonClassName}
                          onClick={() =>
                            startAssistantChat(
                              'Tell me more about the most common sticking point this week, and which students hit it.',
                            )
                          }
                        >
                          Ask assistant
                        </button>
                      </div>
                    ) : null}
                    {pendingFlags > 0 ? (
                      <div className={cn(cardClassName, 'flex items-center gap-3 px-3.5 py-2.5')}>
                        <Shield
                          className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {pendingFlags} flag{pendingFlags === 1 ? '' : 's'} awaiting review
                          </span>
                          <span className="block text-xs text-text-secondary">
                            Transcripts unlock only in the queue — unlocks are logged
                          </span>
                        </span>
                        <button
                          type="button"
                          className={pillButtonClassName}
                          onClick={() => goTab('queue')}
                        >
                          Open queue
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {(overview.data?.pulse?.topics?.length ?? 0) > 0 && (
                <div className={cn(cardClassName, 'p-4')}>
                  <div className="flex items-baseline justify-between">
                    <div className="text-sm font-semibold">What students asked about</div>
                    <span className="text-xs text-text-tertiary">
                      {stats?.totalSessions ?? 0} sessions
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {(overview.data?.pulse?.topics ?? []).map((t) => {
                      const max = overview.data?.pulse?.topics?.[0]?.count || 1;
                      return (
                        <div key={t.name} className="flex items-center gap-2.5">
                          <span className="w-44 shrink-0 truncate text-[13px]">{t.name}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                            <div
                              className="h-full rounded-full bg-green-600/70"
                              style={{ width: `${Math.round((t.count / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-6 shrink-0 text-right text-xs text-text-tertiary">
                            {t.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pb-2">
                <div className="flex items-baseline justify-between">
                  <SectionLabel label="Latest session receipts" />
                  <button
                    type="button"
                    className="text-xs font-semibold text-text-secondary hover:text-text-primary"
                    onClick={() => goTab('students')}
                  >
                    View all students
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {(overview.data?.latestReceipts ?? []).map((r) => (
                    <button
                      key={r.conversationId}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(r.userId);
                        goTab('students', { keepStudent: true });
                      }}
                      className={cn(
                        cardClassName,
                        'px-3.5 py-2.5 text-left transition-colors hover:bg-surface-tertiary',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {r.student}
                          <span className="ml-2 font-normal text-text-secondary">{r.topic}</span>
                        </span>
                        <span className="shrink-0 text-xs text-text-tertiary">
                          {fmtWhen(r.lastMessageAt)} · {r.durationMinutes}m · {r.helpLevel}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-text-secondary">{r.summary}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'students' && selectedStudent == null && !overview.isLoading && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 rounded-3xl border border-border-medium px-4 py-2">
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                />
              </div>
              <div className="flex flex-col gap-1.5 pb-2">
                {filteredStudents.map((s) => (
                  <button
                    key={s.userId}
                    type="button"
                    onClick={() => setSelectedStudent(s.userId)}
                    className={cn(
                      cardClassName,
                      'flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-tertiary',
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-xs font-bold text-text-secondary">
                      {s.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                      {s.sessions} session{s.sessions === 1 ? '' : 's'} · last{' '}
                      {fmtWhen(s.lastMessageAt)}
                    </span>
                    <StatusPill status={s.status} />
                  </button>
                ))}
                {!filteredStudents.length ? (
                  <div className="py-2 text-sm text-text-secondary">
                    No students have used the tutor in this course yet.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === 'students' && selectedStudent != null && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                All students
              </button>
              {studentDetail.isLoading ? (
                <div className="flex items-center gap-3 py-2 text-sm text-text-secondary">
                  <Spinner className="h-4 w-4" />
                  Building profile…
                </div>
              ) : null}
              {studentDetail.data ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-sm font-bold text-text-secondary">
                      {studentDetail.data.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold tracking-tight">
                        {studentDetail.data.name}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {studentDetail.data.sessions} session
                        {studentDetail.data.sessions === 1 ? '' : 's'} · last active{' '}
                        {fmtWhen(studentDetail.data.lastMessageAt)}
                      </div>
                    </div>
                    <StatusPill status={studentDetail.data.status} />
                    <button
                      type="button"
                      className={pillButtonClassName}
                      onClick={() =>
                        startAssistantChat(
                          `How is ${studentDetail.data?.name} doing with the tutor, and what should I do next for them?`,
                        )
                      }
                    >
                      Ask assistant
                    </button>
                  </div>
                  {studentDetail.data.profile ? (
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label: 'Doing well', text: studentDetail.data.profile.doingWell },
                        { label: 'Needs help with', text: studentDetail.data.profile.needsHelp },
                        {
                          label: 'Mostly uses the tutor for',
                          text: studentDetail.data.profile.usesFor,
                        },
                      ].map((card) => (
                        <div key={card.label} className={cn(cardClassName, 'px-3.5 py-3')}>
                          <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                            {card.label}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed">{card.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <SectionLabel label="Session receipts" />
                    <div className="flex flex-col gap-1.5 pb-2">
                      {studentDetail.data.receipts.map((r) => (
                        <div key={r.conversationId} className={cn(cardClassName, 'px-3.5 py-3')}>
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {r.topic}
                            </span>
                            <span className="shrink-0 text-xs text-text-tertiary">
                              {fmtWhen(r.lastMessageAt)} · {r.durationMinutes}m · {r.helpLevel}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                            {r.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {activeTab === 'assign' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                Push an activity onto students&apos; course page — it appears under &quot;From your
                teacher&quot; with a Chat button at the help level you choose.
              </p>
              <div className={cn(cardClassName, 'p-4')}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title — e.g. Sampling distributions warm-up (15 min)"
                  className="w-full bg-transparent text-base font-semibold text-text-primary outline-none placeholder:font-normal placeholder:text-text-tertiary"
                />
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Type
                  </span>
                  {ACTIVITY_TYPES.map((t) => (
                    <Chip key={t} label={t} active={newType === t} onClick={() => setNewType(t)} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Help
                  </span>
                  {LEVEL_DEFS.map((l) => (
                    <Chip
                      key={l.id}
                      label={l.name.split(' ')[0]}
                      active={newLevel === l.id}
                      onClick={() => setNewLevel(l.id)}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Due
                  </span>
                  <input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className="rounded-full border border-border-light bg-surface-primary px-3 py-1 text-xs text-text-primary outline-none"
                  />
                  <Chip label="No due date" active={newDue === ''} onClick={() => setNewDue('')} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    To
                  </span>
                  <Chip
                    label="Whole class"
                    active={newStudents.length === 0}
                    onClick={() => setNewStudents([])}
                  />
                  {students
                    .filter((s) => s.email)
                    .map((s) => {
                      const on = newStudents.includes(s.email as string);
                      return (
                        <Chip
                          key={s.userId}
                          label={on ? `✓ ${s.name}` : s.name}
                          active={on}
                          onClick={() =>
                            setNewStudents((prev) =>
                              on ? prev.filter((e) => e !== s.email) : [...prev, s.email as string],
                            )
                          }
                        />
                      );
                    })}
                </div>
                <div className="mt-3 flex items-center gap-2.5 border-t border-border-light pt-3">
                  <span className="min-w-0 flex-1 text-xs text-text-secondary">
                    Students get a Chat button that opens the tutor at this help level.
                  </span>
                  <button
                    type="button"
                    className={pillButtonClassName}
                    onClick={() =>
                      startAssistantChat(
                        `Draft the content for a class activity titled "${newTitle || 'warm-up'}".`,
                      )
                    }
                  >
                    Draft content with AI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newTitle.trim()) {
                        return;
                      }
                      pushActivity.mutate({
                        title: newTitle.trim(),
                        type: newType,
                        level: newLevel,
                        dueAt: newDue ? `${newDue}T12:00:00` : null,
                        audience: newStudents,
                      });
                      setNewTitle('');
                      setNewStudents([]);
                    }}
                    className="shrink-0 rounded-full bg-text-primary px-4 py-1.5 text-xs font-semibold text-surface-primary transition-opacity hover:opacity-80"
                  >
                    Push to class
                  </button>
                </div>
              </div>
              <div>
                <SectionLabel label="Assigned" />
                <div className="flex flex-col gap-1.5 pb-2">
                  {(activities.data?.activities ?? []).map((a) => (
                    <div
                      key={a.id}
                      className={cn(cardClassName, 'flex items-center gap-3 px-3.5 py-2.5')}
                    >
                      <FolderPlus
                        className="h-4 w-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.title}</span>
                        <span className="block text-xs text-text-secondary">
                          {a.type} · {a.level} help ·{' '}
                          {a.dueAt ? `due ${fmtWhen(a.dueAt)}` : 'no due date'} ·{' '}
                          {a.audience.length
                            ? `${a.audience.length} student${a.audience.length === 1 ? '' : 's'}`
                            : 'Whole class'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-text-tertiary">
                        {a.startedCount} started
                      </span>
                    </div>
                  ))}
                  {!activities.data?.activities?.length ? (
                    <div className="py-2 text-sm text-text-secondary">Nothing assigned yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">
                Auto-flagged sessions, kept out of the main dashboard. Flags are hidden from
                students; unlocking a transcript is logged.
              </p>
              <div className="flex flex-col gap-2 pb-2">
                {(queue.data?.queue ?? []).map((f) => {
                  const pending = f.flagStatus === 'pending';
                  const transcript = transcripts[f.conversationId];
                  return (
                    <div
                      key={f.conversationId}
                      className={cn(
                        'rounded-xl border px-3.5 py-3',
                        pending ? 'border-red-500/40' : 'border-border-light opacity-60',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <TriangleAlert
                          className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {flagTitle(f.flagType)}
                          </span>
                          <span className="block text-xs text-text-secondary">
                            {f.student} · {f.topic} · flagged {fmtWhen(f.lastMessageAt)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            pending
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-surface-tertiary text-text-secondary',
                          )}
                        >
                          {flagStatusLabel(f.flagStatus)}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                        {f.flagNote || f.summary}
                      </p>
                      {transcript != null ? (
                        <div className="mt-2 rounded-lg border border-dashed border-border-medium bg-surface-secondary px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                            Transcript excerpt — unlocked for you only · logged
                          </div>
                          <p className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
                            {transcript}
                          </p>
                        </div>
                      ) : null}
                      {pending ? (
                        <div className="mt-2.5 flex gap-2">
                          {transcript == null ? (
                            <button
                              type="button"
                              className={pillButtonClassName}
                              onClick={() => unlockTranscript(f.conversationId)}
                            >
                              Unlock transcript
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={pillButtonClassName}
                            onClick={() =>
                              flagAction.mutate({
                                conversationId: f.conversationId,
                                action: 'dismiss',
                              })
                            }
                          >
                            Dismiss — no issue
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-full border border-red-500/50 px-3.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                            onClick={() =>
                              flagAction.mutate({
                                conversationId: f.conversationId,
                                action: 'escalate',
                              })
                            }
                          >
                            Escalate to admin
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!queue.data?.queue?.length ? (
                  <div className="py-2 text-sm text-text-secondary">
                    Nothing here — no sessions have been flagged.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === 'levels' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                How much the tutor helps by default. Generous help keeps students coming back — the
                tutor never produces finished work unless you allow it.
              </p>
              <div>
                <SectionLabel label="Course default" />
                <div className="flex flex-col gap-1.5">
                  {LEVEL_DEFS.map((l) => {
                    const selected = (settings.data?.helpLevel ?? 'guided') === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => saveSettings.mutate({ helpLevel: l.id })}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                          selected
                            ? 'border-green-600/50 bg-green-500/5'
                            : 'border-border-light hover:bg-surface-tertiary',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                            selected ? 'border-green-600' : 'border-border-heavy',
                          )}
                        >
                          {selected ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{l.name}</span>
                          <span className="block text-xs text-text-secondary">{l.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <SectionLabel label="Per-assignment overrides" />
                  <button
                    type="button"
                    className="text-xs font-semibold text-text-secondary hover:text-text-primary"
                    onClick={() => setAddingOverride(true)}
                  >
                    + Add override
                  </button>
                </div>
                {addingOverride ? (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const assignment = materials.data?.assignments.find(
                        (a) => a.canvasAssignmentId === id,
                      );
                      if (assignment && settings.data) {
                        saveSettings.mutate({
                          overrides: [
                            ...settings.data.overrides,
                            {
                              canvasAssignmentId: assignment.canvasAssignmentId,
                              name: assignment.name,
                              level: 'guided',
                              blockedRules: [],
                            },
                          ],
                        });
                      }
                      setAddingOverride(false);
                    }}
                    className="mb-2 w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    <option value="" disabled>
                      {materials.isLoading ? 'Loading assignments…' : 'Pick an assignment…'}
                    </option>
                    {(materials.data?.assignments ?? [])
                      .filter(
                        (a) =>
                          !(settings.data?.overrides ?? []).some(
                            (o) => o.canvasAssignmentId === a.canvasAssignmentId,
                          ),
                      )
                      .map((a) => (
                        <option key={a.canvasAssignmentId} value={a.canvasAssignmentId}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  {(settings.data?.overrides ?? []).map((o) => (
                    <div key={o.canvasAssignmentId} className={cn(cardClassName, 'px-3.5 py-3')}>
                      <div className="flex items-center gap-2.5">
                        <BookOpen
                          className="h-4 w-4 shrink-0 text-text-secondary"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {o.name}
                        </span>
                        <select
                          value={o.level}
                          onChange={(e) =>
                            saveSettings.mutate({
                              overrides: (settings.data?.overrides ?? []).map((x) =>
                                x.canvasAssignmentId === o.canvasAssignmentId
                                  ? { ...x, level: e.target.value as ConsoleLevel }
                                  : x,
                              ),
                            })
                          }
                          className="shrink-0 rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold text-text-secondary outline-none"
                        >
                          {LEVEL_DEFS.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name.split(' ')[0]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="shrink-0 text-xs text-text-tertiary hover:text-text-primary"
                          onClick={() =>
                            saveSettings.mutate({
                              overrides: (settings.data?.overrides ?? []).filter(
                                (x) => x.canvasAssignmentId !== o.canvasAssignmentId,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {OVERRIDE_RULES.map((rule) => {
                          const blocked = o.blockedRules.includes(rule);
                          return (
                            <button
                              key={rule}
                              type="button"
                              onClick={() =>
                                saveSettings.mutate({
                                  overrides: (settings.data?.overrides ?? []).map((x) =>
                                    x.canvasAssignmentId === o.canvasAssignmentId
                                      ? {
                                          ...x,
                                          blockedRules: blocked
                                            ? x.blockedRules.filter((r) => r !== rule)
                                            : [...x.blockedRules, rule],
                                        }
                                      : x,
                                  ),
                                })
                              }
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                blocked
                                  ? 'border-red-500/40 bg-red-500/5 text-text-secondary line-through decoration-red-500'
                                  : 'border-green-600/40 bg-green-500/10 text-text-primary',
                              )}
                            >
                              {blocked ? rule : `✓ ${rule}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!settings.data?.overrides?.length && !addingOverride ? (
                    <div className="py-2 text-sm text-text-secondary">No overrides yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pb-4">
          <div className="pb-1.5 text-center text-xs text-text-tertiary">
            The class assistant sees session summaries only — never student transcripts.
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = draft.trim();
              startAssistantChat(text || undefined);
              setDraft('');
            }}
            className="flex items-center gap-2 rounded-3xl border border-border-medium bg-surface-primary px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-ring-primary"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about your class…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label="Ask the class assistant"
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
