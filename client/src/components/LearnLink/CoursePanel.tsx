import { useMemo } from 'react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Plus } from 'lucide-react';
import { getConversationCourseId } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useCurrentCoursesQuery } from '~/data-provider/LearnLink';
import {
  getDisplayCourseName,
  clearPendingCourse,
  getCourseInitial,
  getCoursePrefix,
  getCourseColor,
  openCourseChat,
} from './utils';
import { useCourseChatMap } from './chats';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn } from '~/utils';

type CoursePanelProps = {
  canvasCourseId: number;
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
  conversations,
  toggleNav,
}: CoursePanelProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { newConversation } = useNewConvo();
  const { conversationId } = useParams();
  const chatMap = useCourseChatMap();
  const { data: currentCourses = [] } = useCurrentCoursesQuery();
  const course = currentCourses.find((item) => item.canvasCourseId === canvasCourseId);

  const courseChats = useMemo(
    () =>
      conversations.filter(
        (conversation): conversation is TConversation =>
          conversation?.conversationId != null &&
          (chatMap[conversation.conversationId] ?? getConversationCourseId(conversation)) ===
            canvasCourseId,
      ),
    [conversations, chatMap, canvasCourseId],
  );

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
      openCourseChat(navigate, newConversation, course, {
        promptPrefix: getCoursePrefix(course),
        greeting: localize('com_ui_course_chat_greeting'),
      });
      toggleNav();
    }
  };

  const openChat = (conversation: TConversation) => {
    navigate(`/c/${conversation.conversationId}`);
    toggleNav();
  };

  const displayName = course != null ? getDisplayCourseName(course.name) : '';
  const color = getCourseColor(canvasCourseId);

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
      </div>
    </div>
  );
}
