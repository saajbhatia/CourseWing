import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  BriefcaseBusiness,
  Clock3,
  FileBarChart,
  FolderKanban,
  Home,
  MessageSquareText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type { CourseOverview } from 'librechat-data-provider';
import { cn } from '~/utils';
import type { StudentTab } from './navigation';
import AssistantDrawer, { type CourseAssistantRequest } from './student/AssistantDrawer';
import AiUsePage from './student/AiUsePage';
import FeedbackPage from './student/FeedbackPage';
import HomePage from './student/HomePage';
import ProjectPage from './student/ProjectPage';
import ReportsPage from './student/ReportsPage';
import ResearchPage from './student/ResearchPage';
import TimePage from './student/TimePage';
import WorkPage from './student/WorkPage';

type NavigationItem = {
  id: StudentTab;
  label: string;
  icon: LucideIcon;
  needsProject?: boolean;
};

const navigation: NavigationItem[] = [
  { id: 'home', label: 'Course Home', icon: Home },
  { id: 'project', label: 'Overview', icon: FolderKanban, needsProject: true },
  { id: 'portfolio', label: 'Work', icon: BriefcaseBusiness, needsProject: true },
  { id: 'papers', label: 'Research', icon: BookOpen, needsProject: true },
  { id: 'time', label: 'Time', icon: Clock3, needsProject: true },
  { id: 'ai-use', label: 'AI Use', icon: Sparkles, needsProject: true },
  { id: 'feedback', label: 'Feedback', icon: MessageSquareText, needsProject: true },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
];

const pageNames = Object.fromEntries(navigation.map((item) => [item.id, item.label])) as Partial<
  Record<StudentTab, string>
>;

export default function StudentWorkspace({
  courseId,
  overview,
  tab,
}: {
  courseId: string;
  overview: CourseOverview;
  tab: StudentTab;
}) {
  const queryClient = useQueryClient();
  const refreshCourseData = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) => queryKey[1] === courseId,
    });
  }, [courseId, queryClient]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('project') ?? undefined;
  const selectedProject =
    overview.projects.find((project) => project._id === requestedProjectId) ?? overview.projects[0];
  const projectId = selectedProject?._id;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantRequest, setAssistantRequest] = useState<CourseAssistantRequest>();
  const activePage = pageNames[tab] ?? 'Course Home';
  const isCourseLevel = tab === 'home' || tab === 'reports';
  const mobileNavigation = useMemo(
    () => navigation.filter((item) => !item.needsProject || projectId),
    [projectId],
  );

  const setProjectView = (nextTab: StudentTab, nextProjectId = projectId) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', nextTab);
    if (nextTab === 'reports') {
      next.delete('project');
    } else if (nextProjectId) {
      next.set('project', nextProjectId);
    }
    next.delete('createProject');
    setSearchParams(next);
  };

  const openProject = (nextProjectId: string) => {
    setProjectView('project', nextProjectId);
  };

  const createProject = () => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'project');
    next.set('createProject', '1');
    if (projectId) {
      next.set('project', projectId);
    }
    setSearchParams(next);
  };

  const closeCreateProject = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('createProject');
    setSearchParams(next, { replace: true });
  };

  const goHome = () => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'home');
    next.delete('project');
    next.delete('createProject');
    setSearchParams(next);
  };

  const askAI = (message?: string, privateContext?: string) => {
    setAssistantRequest(message ? { message, privateContext } : undefined);
    setAssistantOpen(true);
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-primary text-text-primary">
      <header className="shrink-0 border-b border-border-light px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button type="button" onClick={goHome} className="min-w-0 text-left">
            <h1 className="truncate text-sm font-semibold hover:underline">
              {overview.course.name}
            </h1>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {!isCourseLevel && selectedProject
                ? `${selectedProject.title} · ${activePage}`
                : activePage}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => askAI()}>
              <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
              {tab === 'home' ? 'Ask across course' : 'Ask AI'}
            </Button>
          </div>
        </div>
      </header>

      <nav className="shrink-0 overflow-x-auto border-b border-border-light px-3 py-2 md:hidden">
        <div className="flex w-max gap-1">
          {mobileNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (id === 'home') {
                  goHome();
                } else {
                  setProjectView(id);
                }
              }}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:py-5">
        <div className="mx-auto w-full max-w-7xl">
          {tab === 'home' ? (
            <HomePage
              overview={overview}
              onOpenProject={openProject}
              onCreateProject={createProject}
            />
          ) : null}
          {tab === 'project' ? (
            <ProjectPage
              courseId={courseId}
              overview={overview}
              projectId={projectId}
              createRequested={searchParams.get('createProject') === '1'}
              onOpenProject={openProject}
              onCloseCreate={closeCreateProject}
              onGoHome={goHome}
            />
          ) : null}
          {tab === 'portfolio' ? (
            <WorkPage
              courseId={courseId}
              projectId={projectId}
              studentId={overview.membership.userId}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'papers' ? (
            <ResearchPage
              courseId={courseId}
              projectId={projectId}
              studentId={overview.membership.userId}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'time' ? (
            <TimePage courseId={courseId} projectId={projectId} onAskAI={askAI} />
          ) : null}
          {tab === 'ai-use' ? (
            <AiUsePage courseId={courseId} projectId={projectId} onAskAI={askAI} />
          ) : null}
          {tab === 'feedback' ? (
            <FeedbackPage
              courseId={courseId}
              projectId={projectId}
              studentId={overview.membership.userId}
              onAskAI={askAI}
            />
          ) : null}
          {tab === 'reports' ? <ReportsPage courseId={courseId} onAskAI={askAI} /> : null}
        </div>
      </div>

      <AssistantDrawer
        open={assistantOpen}
        courseId={courseId}
        courseName={overview.course.name}
        projectId={isCourseLevel ? undefined : projectId}
        projectName={isCourseLevel ? undefined : selectedProject?.title}
        context={activePage}
        initialPrompt={assistantRequest}
        onInitialPromptConsumed={() => setAssistantRequest(undefined)}
        onCourseDataChanged={refreshCourseData}
        onOpenChange={(open) => {
          setAssistantOpen(open);
          if (!open) {
            refreshCourseData();
          }
        }}
      />
    </main>
  );
}
