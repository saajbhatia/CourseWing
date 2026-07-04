import { useCallback, useEffect, useState, useMemo, memo, lazy, Suspense, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, SquarePen } from 'lucide-react';
import { Constants, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse, TConversation } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import {
  useLocalize,
  useHasAccess,
  useNewConvo,
  useAuthContext,
  useLocalStorage,
  useNavScrolling,
} from '~/hooks';
import {
  getPendingCourse,
  usePendingCourse,
  clearPendingCourse,
  iconButtonClassName,
} from '~/components/LearnLink/utils';
import { recordCourseChat, useCourseChatMap } from '~/components/LearnLink/chats';
import { useConversationsInfiniteQuery, useTitleGeneration } from '~/data-provider';
import ProjectsSection from '~/components/Conversations/ProjectsSection';
import CoursesSection from '~/components/Conversations/CoursesSection';
import FavoritesList from '~/components/Nav/Favorites/FavoritesList';
import CoursePanel from '~/components/LearnLink/CoursePanel';
import { Conversations } from '~/components/Conversations';
import Convo from '~/components/Conversations/Convo';
import SearchBar from '~/components/Nav/SearchBar';
import { cn } from '~/utils';
import store from '~/store';

const BookmarkNav = lazy(() => import('~/components/Nav/Bookmarks/BookmarkNav'));

const RECENT_CHATS_LIMIT = 4;

const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const { courseId, conversationId } = useParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);
  const [panelPage, setPanelPage] = useState<'home' | 'chats'>('home');
  const [showLoading, setShowLoading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const chatMap = useCourseChatMap();

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const search = useRecoilValue(store.search);

  const { data, fetchNextPage, isFetchingNextPage, isLoading, isFetching } =
    useConversationsInfiniteQuery(
      {
        tags: tags.length === 0 ? undefined : tags,
        search: search.debouncedQuery || undefined,
      },
      {
        enabled: isAuthenticated,
        staleTime: 30000,
        cacheTime: 300000,
      },
    );

  const computedHasNextPage = useMemo(() => {
    if (data?.pages && data.pages.length > 0) {
      const lastPage: ConversationListResponse = data.pages[data.pages.length - 1];
      return lastPage.nextCursor !== null;
    }
    return false;
  }, [data?.pages]);

  const conversationsRef = useRef<List | null>(null);

  const { moveToTop } = useNavScrolling<ConversationListResponse>({
    setShowLoading,
    fetchNextPage: async (options?) => {
      if (computedHasNextPage) {
        return fetchNextPage(options);
      }
      return Promise.resolve({} as InfiniteQueryObserverResult<ConversationListResponse, unknown>);
    },
    isFetchingNext: isFetchingNextPage,
  });

  const conversations = useMemo(() => {
    return data ? data.pages.flatMap((page) => page.conversations) : [];
  }, [data]);

  const recentConversations = useMemo(
    () =>
      conversations
        .filter(
          (conversation): conversation is TConversation => conversation?.conversationId != null,
        )
        .slice(0, RECENT_CHATS_LIMIT),
    [conversations],
  );

  const pendingCourseId = usePendingCourse();

  const activeCourseId = useMemo(() => {
    if (courseId != null) {
      const parsed = Number.parseInt(courseId, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (conversationId == null) {
      return null;
    }
    if (conversationId !== Constants.NEW_CONVO) {
      return chatMap[conversationId] ?? null;
    }
    return pendingCourseId;
  }, [courseId, conversationId, chatMap, pendingCourseId]);

  const submission = useRecoilValue(store.submissionByIndex(0));

  const prevConvoRef = useRef(conversationId);
  useEffect(() => {
    const prev = prevConvoRef.current;
    prevConvoRef.current = conversationId;
    if (
      conversationId == null ||
      conversationId === prev ||
      conversationId === Constants.NEW_CONVO
    ) {
      return;
    }
    const pending = getPendingCourse();
    if (pending == null) {
      return;
    }
    const isNewlyCreated = prev === Constants.NEW_CONVO && submission?.userMessage != null;
    if (isNewlyCreated) {
      recordCourseChat(conversationId, pending);
    }
    clearPendingCourse();
  }, [conversationId, submission]);

  const showCoursePanel = activeCourseId != null && !search.query;

  useEffect(() => {
    if (showCoursePanel) {
      setPanelPage('home');
    }
  }, [showCoursePanel]);

  const toggleNav = useCallback(() => {
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }
  }, [isSmallScreen, setSidebarExpanded]);

  const loadMoreConversations = useCallback(() => {
    if (isFetchingNextPage || !computedHasNextPage) {
      return;
    }
    fetchNextPage();
  }, [isFetchingNextPage, computedHasNextPage, fetchNextPage]);

  const [isSearchLoading, setIsSearchLoading] = useState(
    !!search.query && (search.isTyping || isLoading || isFetching),
  );

  useEffect(() => {
    if (search.isTyping) {
      setIsSearchLoading(true);
    } else if (!isLoading && !isFetching) {
      setIsSearchLoading(false);
    } else if (!!search.query && (isLoading || isFetching)) {
      setIsSearchLoading(true);
    }
  }, [search.query, search.isTyping, isLoading, isFetching]);

  const openNewChat = useCallback(() => {
    clearPendingCourse();
    newConversation();
    toggleNav();
  }, [newConversation, toggleNav]);

  const showAllChats = !!search.query || panelPage === 'chats';

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3 pt-2"
      role="region"
      aria-label={localize('com_ui_chat_history')}
    >
      {showCoursePanel ? (
        <CoursePanel
          canvasCourseId={activeCourseId}
          conversations={conversations}
          toggleNav={toggleNav}
        />
      ) : (
        <>
          <div className="flex items-center gap-0.5 px-3">
            {hasAccessToBookmarks && (
              <Suspense fallback={null}>
                <BookmarkNav tags={tags} setTags={setTags} />
              </Suspense>
            )}
            {search.enabled && <SearchBar isSmallScreen={isSmallScreen} />}
          </div>
          {showAllChats ? (
            <>
              {!search.query && (
                <button
                  type="button"
                  onClick={() => setPanelPage('home')}
                  className="mx-3 mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {localize('com_ui_back_to_home')}
                </button>
              )}
              <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
                <Conversations
                  conversations={conversations}
                  moveToTop={moveToTop}
                  toggleNav={toggleNav}
                  containerRef={conversationsRef}
                  loadMoreConversations={loadMoreConversations}
                  isLoading={isFetchingNextPage || showLoading || isLoading}
                  isSearchLoading={isSearchLoading}
                  isChatsExpanded={isChatsExpanded}
                  setIsChatsExpanded={setIsChatsExpanded}
                  showFavorites={false}
                />
              </div>
            </>
          ) : (
            <>
              <div className="px-3">
                <FavoritesList isSmallScreen={isSmallScreen} toggleNav={toggleNav} />
              </div>
              <ProjectsSection toggleNav={toggleNav} isAuthenticated={isAuthenticated} />
              <CoursesSection toggleNav={toggleNav} />
              <div className="mt-1 flex min-h-0 flex-col overflow-hidden border-t border-border-light px-3 pt-1">
                <div className="flex h-8 w-full shrink-0 items-center gap-0.5 pr-2">
                  <button
                    onClick={() => setIsChatsExpanded(!isChatsExpanded)}
                    className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
                    type="button"
                    aria-expanded={isChatsExpanded}
                  >
                    <span className="select-none truncate">{localize('com_ui_chats')}</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform duration-200',
                        isChatsExpanded ? '' : '-rotate-90',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={localize('com_ui_new_chat')}
                    className={iconButtonClassName}
                    onClick={openNewChat}
                  >
                    <SquarePen className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {isChatsExpanded && (
                  <div className="min-h-0 overflow-y-auto">
                    {recentConversations.map((conversation) => (
                      <Convo
                        key={conversation.conversationId}
                        conversation={conversation}
                        retainView={moveToTop}
                        toggleNav={toggleNav}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setPanelPage('chats')}
                      className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-sm font-medium text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
                    >
                      {localize('com_ui_all_chats')}
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-text-tertiary"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
