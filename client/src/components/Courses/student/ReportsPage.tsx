/* eslint-disable i18next/no-literal-string */
import { FileBarChart, Sparkles } from 'lucide-react';
import { Button } from '@librechat/client';
import { useCourseReportsQuery } from '~/data-provider';
import { EmptyState, PageHeader, Surface, Tag, formatShortDate } from './ui';

function displaySectionTitle(title: string): string {
  return title === 'Teacher narrative and next milestones'
    ? 'Teacher narrative and next steps'
    : title;
}

export default function ReportsPage({
  courseId,
  onAskAI,
}: {
  courseId: string;
  onAskAI: (message: string, privateContext?: string) => void;
}) {
  const { data: reports = [], isLoading } = useCourseReportsQuery(courseId);
  const released = [...reports]
    .filter((report) => report.status === 'released')
    .sort(
      (left, right) =>
        new Date(right.releasedAt ?? right.updatedAt).getTime() -
        new Date(left.releasedAt ?? left.updatedAt).getTime(),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Progress and final reports released by your teaching team."
        actions={
          released.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onAskAI('Summarize my latest released report and help me plan the next steps.')
              }
            >
              <Sparkles className="size-4" />
              Do with AI
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <Surface className="p-6 text-sm text-text-secondary">Loading reports…</Surface>
      ) : null}

      {!isLoading && released.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No released reports yet"
          description="A progress or final report will appear here after your teaching team releases it."
        />
      ) : null}

      {released.map((report) => (
        <Surface key={report._id} className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light px-4 py-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">
                  {report.kind === 'progress' ? 'Progress report' : 'Final report'}
                </h3>
                <Tag>Released</Tag>
                <Tag>Version {report.version}</Tag>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                Released {formatShortDate(report.releasedAt ?? report.updatedAt)}
              </p>
            </div>
          </div>

          <div className="divide-y divide-border-light">
            {report.sections.map((section) => (
              <section key={section.key} className="px-4 py-4">
                <h4 className="text-sm font-semibold">{displaySectionTitle(section.title)}</h4>
                <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                  {section.content || 'No narrative was added for this section.'}
                </p>
              </section>
            ))}
          </div>
        </Surface>
      ))}
    </div>
  );
}
