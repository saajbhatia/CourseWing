import { useMemo } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Plus,
  Users,
  Shield,
  ArrowLeft,
  BookOpen,
  Sparkles,
  BarChart3,
  FolderPlus,
  MessageCircle,
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { request } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useConversationsInfiniteQuery, useGetStartupConfig } from '~/data-provider';
import { useCurrentCoursesQuery } from '~/data-provider/LearnLight';
import {
  openTeacherAssistantChat,
  getDisplayCourseName,
  clearPendingCourse,
  getCourseInitial,
  getCoursePrefix,
  getCourseColor,
  openCourseChat,
} from './utils';
import { useAuthContext } from '~/hooks/AuthContext';
import { useCourseChatMap } from './chats';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn } from '~/utils';

type CoursePanelProps = {
  canvasCourseId: number;
  canvasAccountKey: string;
  conversations: Array<TConversation | null>;
  toggleNav: () => void;
};

function getChatDateLabel(conversation: TConversation): string | null {
  const raw = conversation.updatedAt || conversation.createdAt;
  const date = raw ? new Date(raw) : null;
  if (date == null || Number.isNaN(date.getTime())) {
    return null;
  }
  return format(date, 'MMM d');
}

export default function CoursePanel({
  canvasCourseId,
  canvasAccountKey,
  conversations,
  toggleNav,
}: CoursePanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { newConversation } = useNewConvo();
  const { conversationId } = useParams();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const teacherMe = useQuery(
    ['tcMe'],
    () => request.get<{ isTeacher: boolean }>('/api/learnlight/teacher/me'),
    { enabled: isAuthenticated, retry: false, staleTime: 300_000 },
  );
  const isTeacher = teacherMe.data?.isTeacher === true;
  const teacherQueue = useQuery(
    ['tcQueue', canvasCourseId],
    () =>
      request.get<{ queue: { flagStatus: string }[] }>(
        `/api/learnlight/teacher/courses/${canvasCourseId}/queue`,
      ),
    { enabled: isTeacher, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const pendingFlags = (teacherQueue.data?.queue ?? []).filter(
    (item) => item.flagStatus === 'pending',
  ).length;
  const chatMap = useCourseChatMap();
  const { data: currentCourses = [] } = useCurrentCoursesQuery();
  const {
    data: courseChatData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversationsInfiniteQuery(
    { canvasCourseId },
    { staleTime: 30000, cacheTime: 300000 },
    canvasAccountKey,
  );
  const course = currentCourses.find((item) => item.canvasCourseId === canvasCourseId);

  const courseChats = useMemo(() => {
    const fetched = courseChatData?.pages.flatMap((page) => page.conversations) ?? [];
    const optimistic = conversations.filter(
      (conversation) =>
        conversation?.conversationId != null &&
        chatMap[conversation.conversationId] === canvasCourseId,
    );
    const seen = new Set<string>();
    return [...fetched, ...optimistic].filter(
      (conversation): conversation is TConversation =>
        conversation?.conversationId != null &&
        !seen.has(conversation.conversationId) &&
        Boolean(seen.add(conversation.conversationId)),
    );
  }, [courseChatData, conversations, chatMap, canvasCourseId]);

  const goHome = () => {
    clearPendingCourse();
    newConversation();
    toggleNav();
  };

  const openCoursePage = () => {
    navigate(`/courses/${canvasCourseId}`);
    toggleNav();
  };

  const startChat = () => {
    if (course != null) {
      const opened = openCourseChat(navigate, newConversation, course, {
        promptPrefix: getCoursePrefix(course),
        greeting: localize('com_ui_course_chat_greeting'),
      });
      if (opened) {
        toggleNav();
      } else {
        showToast({
          status: 'error',
          message: localize('com_ui_guest_handoff_error'),
        });
      }
    }
  };

  const openChat = (conversation: TConversation) => {
    navigate(`/c/${conversation.conversationId}`);
    toggleNav();
  };

  const displayName = course != null ? getDisplayCourseName(course.name) : '';
  const color = getCourseColor(canvasCourseId);

  const onCoursePage = location.pathname === `/courses/${canvasCourseId}`;
  const activeTab = onCoursePage
    ? (new URLSearchParams(location.search).get('tab') ?? 'pulse')
    : null;
  const goTeacherTab = (tab: string) => {
    navigate(
      tab === 'pulse' ? `/courses/${canvasCourseId}` : `/courses/${canvasCourseId}?tab=${tab}`,
    );
    toggleNav();
  };
  const startAssistantChat = () => {
    if (course == null) {
      return;
    }
    const defaultSpec = startupConfig?.modelSpecs?.list?.find((spec) => spec.default)?.name;
    const opened = openTeacherAssistantChat(navigate, newConversation, course, {
      ...(defaultSpec ? { spec: defaultSpec } : {}),
    });
    if (opened) {
      toggleNav();
    } else {
      showToast({ status: 'error', message: localize('com_ui_guest_handoff_error') });
    }
  };
  const teacherNav: Array<{
    key: string;
    label: string;
    Icon: typeof BarChart3;
    badge?: number;
    onClick?: () => void;
  }> = [
    { key: 'pulse', label: localize('com_ui_teacher_class_pulse'), Icon: BarChart3 },
    { key: 'students', label: localize('com_ui_teacher_students'), Icon: Users },
    { key: 'assign', label: localize('com_ui_teacher_assign'), Icon: FolderPlus },
    {
      key: 'assistant',
      label: localize('com_ui_teacher_assistant'),
      Icon: Sparkles,
      onClick: startAssistantChat,
    },
    {
      key: 'queue',
      label: localize('com_ui_teacher_review_queue'),
      Icon: Shield,
      badge: pendingFlags,
    },
    { key: 'levels', label: localize('com_ui_teacher_help_levels'), Icon: BookOpen },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-3 pt-2 text-sm">
      <button
        type="button"
        onClick={goHome}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        {localize('com_ui_back_to_home')}
      </button>

      {course != null && (
        <button
          type="button"
          onClick={openCoursePage}
          className="mt-1 flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{ backgroundColor: color.background, color: color.foreground }}
            aria-hidden="true"
          >
            {getCourseInitial(displayName)}
          </span>
          <span className="min-w-0 truncate font-semibold text-text-primary">{displayName}</span>
        </button>
      )}

      {isTeacher && (
        <>
          <div className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {localize('com_ui_teacher_class')}
          </div>
          <ul className="m-0 list-none p-0">
            {teacherNav.map((item) => (
              <li key={item.key} className="list-none">
                <button
                  type="button"
                  onClick={item.onClick ?? (() => goTeacherTab(item.key))}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
                    activeTab === item.key
                      ? 'bg-surface-active-alt text-text-primary'
                      : 'text-text-primary hover:bg-surface-active-alt',
                  )}
                >
                  <item.Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {localize('com_ui_chats_in_course')}
      </div>

      <button
        type="button"
        onClick={startChat}
        className="flex items-center gap-2.5 rounded-lg bg-surface-tertiary px-2 py-2 text-left font-medium text-text-primary transition-colors hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      >
        <Plus className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        {localize('com_ui_start_chat')}
      </button>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {courseChats.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-text-secondary">
            {localize('com_ui_no_course_chats')}
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {courseChats.map((conversation) => {
              const dateLabel = getChatDateLabel(conversation);
              return (
                <li key={conversation.conversationId} className="list-none">
                  <button
                    type="button"
                    onClick={() => openChat(conversation)}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
                      conversation.conversationId === conversationId
                        ? 'bg-surface-active-alt'
                        : 'hover:bg-surface-active-alt',
                    )}
                  >
                    <MessageCircle
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {conversation.title || localize('com_ui_untitled')}
                    </span>
                    {dateLabel != null && (
                      <span className="shrink-0 text-xs text-text-tertiary">{dateLabel}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasNextPage && (
          <button
            type="button"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
            className="mt-1 w-full rounded-lg px-2 py-2 text-center text-xs font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
          >
            {localize('com_ui_load_more')}
          </button>
        )}
      </div>
    </div>
  );
}
