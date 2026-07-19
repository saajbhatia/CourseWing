/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  FolderKanban,
  Link2,
  Plus,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type { CourseOverview, CoursePost } from 'librechat-data-provider';
import { Modal, PageHeader, Surface, formatShortDate } from './ui';

type DatedPost = CoursePost & {
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
};

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export default function HomePage({
  overview,
  onOpenProject,
  onCreateProject,
}: {
  overview: CourseOverview;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  const posts = overview.posts as DatedPost[];
  const announcements = posts.filter((post) => post.kind === 'announcement');
  const deadlines = posts
    .filter((post) => post.kind === 'deadline')
    .sort((left, right) => {
      return (
        new Date(left.dueAt ?? left.publishedAt).getTime() -
        new Date(right.dueAt ?? right.publishedAt).getTime()
      );
    });
  const schedule = posts
    .filter((post) => {
      if (post.kind !== 'schedule') {
        return false;
      }
      const startsAt = new Date(post.startsAt ?? post.publishedAt);
      return !Number.isNaN(startsAt.getTime()) && isSameLocalDay(startsAt, new Date());
    })
    .sort((left, right) => {
      return (
        new Date(left.startsAt ?? left.publishedAt).getTime() -
        new Date(right.startsAt ?? right.publishedAt).getTime()
      );
    });
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<DatedPost | null>(null);

  return (
    <div className="space-y-3">
      <PageHeader
        title={overview.course.name}
        description="Announcements, deadlines, today’s plan, and your projects."
        actions={
          <Button type="button" variant="submit" onClick={onCreateProject}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-3">
          <Surface className="overflow-hidden bg-surface-secondary shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border-light px-3 py-2.5">
              <Bell className="size-4 text-text-secondary" />
              <h3 className="text-sm font-semibold">Announcements</h3>
              <span className="ml-auto text-xs text-text-tertiary">{announcements.length}</span>
            </div>
            <div className="max-h-40 divide-y divide-border-light overflow-y-auto">
              {announcements.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-tertiary">No announcements yet.</p>
              ) : (
                announcements.map((announcement) => (
                  <button
                    key={announcement._id}
                    type="button"
                    onClick={() => setSelectedAnnouncement(announcement)}
                    className="block w-full px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {announcement.title}
                      </p>
                      <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                        {formatShortDate(announcement.publishedAt)}
                      </span>
                    </div>
                    {announcement.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-text-secondary">
                        {announcement.body}
                      </p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </Surface>

          <Surface className="overflow-hidden bg-surface-secondary shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border-light px-3 py-2.5">
              <CalendarDays className="size-4 text-text-secondary" />
              <h3 className="text-sm font-semibold">Assignments & deadlines</h3>
              <span className="ml-auto text-xs text-text-tertiary">{deadlines.length}</span>
            </div>
            <div className="max-h-36 divide-y divide-border-light overflow-y-auto">
              {deadlines.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-tertiary">No upcoming deadlines.</p>
              ) : (
                deadlines.map((deadline) => (
                  <div key={deadline._id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-active-alt text-text-primary">
                      <span className="whitespace-nowrap text-[10px] font-semibold uppercase leading-3">
                        {formatShortDate(deadline.dueAt).split(' ')[0]}
                      </span>
                      <span className="text-sm font-bold leading-4">
                        {formatShortDate(deadline.dueAt).split(' ')[1] ?? ''}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{deadline.title}</p>
                      {deadline.body ? (
                        <p className="truncate text-xs text-text-tertiary">{deadline.body}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                      Due {formatShortDate(deadline.dueAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>

        <Surface className="flex h-full flex-col overflow-hidden bg-surface-secondary shadow-sm">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-border-light px-3 py-2.5">
            <Clock3 className="size-4 text-text-secondary" />
            <h3 className="text-sm font-semibold">Plan for today</h3>
            <span className="ml-auto text-xs text-text-tertiary">{schedule.length}</span>
          </div>
          <div className="max-h-80 min-h-36 flex-1 overflow-y-auto px-3 py-3">
            {schedule.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nothing has been scheduled yet.</p>
            ) : (
              schedule.map((item, index) => {
                const startsAt = new Date(item.startsAt ?? item.publishedAt);
                const endsAt = item.endsAt ? new Date(item.endsAt) : null;
                const timeOptions: Intl.DateTimeFormatOptions = {
                  hour: 'numeric',
                  minute: '2-digit',
                };
                return (
                  <div key={item._id} className="relative flex gap-3 pb-3.5 last:pb-0">
                    <span className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-border-heavy bg-surface-primary" />
                    {index < schedule.length - 1 ? (
                      <span className="absolute bottom-0 left-[0.28rem] top-3 w-px bg-border-medium" />
                    ) : null}
                    <div className="min-w-0">
                      <span className="whitespace-nowrap text-xs font-semibold text-text-tertiary">
                        {startsAt.toLocaleTimeString('en-US', timeOptions)}
                        {endsAt && !Number.isNaN(endsAt.getTime())
                          ? ` – ${endsAt.toLocaleTimeString('en-US', timeOptions)}`
                          : ''}
                      </span>
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      {item.body ? (
                        <p className="line-clamp-2 text-xs leading-4 text-text-secondary">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Surface>
      </div>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your projects</h3>
          <span className="text-xs text-text-tertiary">{overview.projects.length}</span>
        </div>
        {overview.projects.length === 0 ? (
          <Surface className="flex items-center gap-3 bg-surface-secondary p-3 shadow-sm">
            <FolderKanban className="size-5 text-text-secondary" />
            <p className="min-w-0 flex-1 text-sm text-text-secondary">
              Create your first project to start organizing work.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onCreateProject}>
              Create project
            </Button>
          </Surface>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {overview.projects.map((project) => (
              <button
                key={project._id}
                type="button"
                onClick={() => onOpenProject(project._id)}
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-border-medium bg-surface-secondary px-3 py-2.5 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-heavy hover:shadow-md"
              >
                <FolderKanban className="size-4 shrink-0 text-text-secondary" />
                <span className="min-w-0 flex-1 truncate font-medium">{project.title}</span>
                <ChevronRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={selectedAnnouncement != null}
        title={selectedAnnouncement?.title ?? 'Announcement'}
        description={
          selectedAnnouncement
            ? `Published ${formatShortDate(selectedAnnouncement.publishedAt)}`
            : undefined
        }
        onClose={() => setSelectedAnnouncement(null)}
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          {selectedAnnouncement?.body || 'No additional details were provided.'}
        </p>
        {selectedAnnouncement?.links?.length ? (
          <div className="mt-5 space-y-2">
            {selectedAnnouncement.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm font-medium hover:bg-surface-hover"
              >
                <Link2 className="size-4 text-text-secondary" />
                <span className="min-w-0 flex-1 truncate">{link.label || link.url}</span>
                <ExternalLink className="size-3.5 text-text-tertiary" />
              </a>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
