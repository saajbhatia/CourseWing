/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Sparkles, Users } from 'lucide-react';
import { Button, Textarea, useToastContext } from '@librechat/client';
import type { CourseMembership, CourseReport, CourseReportSection } from 'librechat-data-provider';
import {
  useCourseReportsQuery,
  useGenerateCourseReportMutation,
  useReleaseCourseReportMutation,
  useUpdateCourseReportMutation,
} from '~/data-provider';
import { cn } from '~/utils';
import { EmptyState, NativeSelect, PageHeader, Surface, Tag } from './student/ui';

type CourseAssistantRequest = (message?: string, privateContext?: string) => void;

type PeopleModel = {
  projectByStudent: Map<string, string>;
};

function studentId(student: CourseMembership): string {
  return student.userId || student._id;
}

function studentName(student: CourseMembership): string {
  return student.preferredName || student.email.split('@')[0] || student.email;
}

function initials(student: CourseMembership): string {
  return studentName(student)
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function latestReport(
  reports: CourseReport[],
  selectedStudentId: string,
  kind: CourseReport['kind'],
): CourseReport | undefined {
  return reports
    .filter((report) => report.studentId === selectedStudentId && report.kind === kind)
    .sort((left, right) => right.version - left.version)[0];
}

function editableSections(report?: CourseReport): CourseReportSection[] {
  return (
    report?.sections.map((section) => ({
      ...section,
      title:
        section.title === 'Teacher narrative and next milestones'
          ? 'Teacher narrative and next steps'
          : section.title,
    })) ?? []
  );
}

export default function TeacherReportsPage({
  courseId,
  students,
  people,
  onAskAI,
}: {
  courseId: string;
  students: CourseMembership[];
  people: PeopleModel;
  onAskAI: CourseAssistantRequest;
}) {
  const { showToast } = useToastContext();
  const { data: reports = [] } = useCourseReportsQuery(courseId);
  const generateReport = useGenerateCourseReportMutation(courseId);
  const updateReport = useUpdateCourseReportMutation(courseId);
  const releaseReport = useReleaseCourseReportMutation(courseId);
  const [selectedId, setSelectedId] = useState('');
  const [kind, setKind] = useState<CourseReport['kind']>('progress');
  const [sections, setSections] = useState<CourseReportSection[]>([]);
  const selected = students.find((student) => studentId(student) === selectedId) ?? students[0];
  const selectedUserId = selected ? studentId(selected) : '';
  const report = useMemo(
    () => latestReport(reports, selectedUserId, kind),
    [kind, reports, selectedUserId],
  );

  useEffect(() => {
    setSections(editableSections(report));
  }, [report]);

  const generate = async () => {
    if (!selected?.userId) {
      showToast({ message: 'This student has not joined the course yet.', status: 'warning' });
      return;
    }
    try {
      const created = await generateReport.mutateAsync({
        studentId: selected.userId,
        kind,
      });
      setSections(editableSections(created));
      showToast({
        message: `${kind === 'progress' ? 'Progress' : 'Final'} report generated.`,
        status: 'success',
      });
    } catch {
      showToast({ message: 'The report could not be generated.', status: 'error' });
    }
  };

  const save = async () => {
    if (!report) {
      return;
    }
    try {
      await updateReport.mutateAsync({ reportId: report._id, sections });
      showToast({ message: 'Report draft saved.', status: 'success' });
    } catch {
      showToast({ message: 'The report draft could not be saved.', status: 'error' });
    }
  };

  const release = async () => {
    if (!report || !window.confirm(`Release this report to ${studentName(selected)}?`)) {
      return;
    }
    try {
      await releaseReport.mutateAsync(report._id);
      showToast({ message: 'Report released to the student.', status: 'success' });
    } catch {
      showToast({ message: 'The report could not be released.', status: 'error' });
    }
  };
  const generateLabel = report ? 'New version' : 'Generate';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        actions={
          selected ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onAskAI(
                  `Help me create or improve ${studentName(selected)}’s ${kind} report.`,
                  JSON.stringify({
                    studentId: selected.userId,
                    studentName: studentName(selected),
                    reportId: report?._id,
                    reportKind: kind,
                    reportStatus: report?.status,
                  }),
                )
              }
            >
              <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
              Do with AI
            </Button>
          ) : undefined
        }
      />

      {students.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No student reports"
          description="Student reports will appear after students join the course."
        />
      ) : (
        <Surface className="grid min-h-[36rem] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)]">
          <section className="border-b border-border-light bg-surface-secondary lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2.5 border-b border-border-light px-3 py-2.5">
              <Users className="size-4 text-text-secondary" />
              <h3 className="text-sm font-semibold">Students</h3>
              <span className="ml-auto text-xs text-text-tertiary">{students.length}</span>
            </div>
            <div className="max-h-64 divide-y divide-border-light overflow-y-auto lg:max-h-[33rem]">
              {students.map((student) => {
                const studentReport = latestReport(reports, studentId(student), kind);
                return (
                  <button
                    key={studentId(student)}
                    type="button"
                    onClick={() => setSelectedId(studentId(student))}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover',
                      selected &&
                        studentId(selected) === studentId(student) &&
                        'bg-surface-primary',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-active-alt text-[10px] font-semibold text-text-secondary">
                      {initials(student)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {studentName(student)}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {people.projectByStudent.get(studentId(student)) || 'No project'}
                      </span>
                    </span>
                    {studentReport ? <Tag>{studentReport.status}</Tag> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{studentName(selected)}</h2>
                  {report ? <Tag>{report.status}</Tag> : <Tag>Not generated</Tag>}
                  {report ? <Tag>Version {report.version}</Tag> : null}
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {people.projectByStudent.get(studentId(selected)) || 'No project'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  value={kind}
                  onChange={(value) => setKind(value as CourseReport['kind'])}
                  className="w-32"
                  ariaLabel="Report type"
                >
                  <option value="progress">Progress</option>
                  <option value="final">Final</option>
                </NativeSelect>
                <Button
                  type="button"
                  variant="outline"
                  disabled={generateReport.isLoading || !selected.userId}
                  onClick={generate}
                >
                  {generateReport.isLoading ? 'Generating…' : generateLabel}
                </Button>
                <Button
                  type="button"
                  variant="submit"
                  disabled={!report || report.status === 'released' || releaseReport.isLoading}
                  onClick={release}
                >
                  {releaseReport.isLoading ? 'Releasing…' : 'Release'}
                </Button>
              </div>
            </div>

            {report ? (
              <>
                <div className="mt-5 space-y-4">
                  {sections.map((section, index) => (
                    <label key={`${section.key}-${index}`} className="block">
                      <span className="text-sm font-medium">{section.title}</span>
                      <Textarea
                        className="mt-1.5 min-h-28"
                        value={section.content}
                        disabled={report.status === 'released'}
                        onChange={(event) =>
                          setSections(
                            sections.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, content: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      {section.evidenceIds.length > 0 ? (
                        <span className="mt-1 block text-xs text-text-tertiary">
                          {section.evidenceIds.length} connected evidence item
                          {section.evidenceIds.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
                {report.status !== 'released' ? (
                  <div className="mt-5 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateReport.isLoading}
                      onClick={save}
                    >
                      {updateReport.isLoading ? 'Saving…' : 'Save draft'}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center text-center">
                <FileBarChart className="size-6 text-text-tertiary" />
                <p className="mt-3 text-sm font-medium">No {kind} report yet</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  Generate a draft from this student’s current course evidence.
                </p>
              </div>
            )}
          </section>
        </Surface>
      )}
    </div>
  );
}
