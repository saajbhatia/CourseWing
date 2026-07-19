/* eslint-disable i18next/no-literal-string */
import { useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, MessageSquareText, Sparkles } from 'lucide-react';
import { Button, Textarea, useToastContext } from '@librechat/client';
import type { CourseFeedback } from 'librechat-data-provider';
import {
  useCourseFeedbackQuery,
  useCourseWorkQuery,
  useUpdateCourseFeedbackMutation,
} from '~/data-provider';
import {
  EmptyState,
  Field,
  Modal,
  NativeSelect,
  PageHeader,
  Surface,
  Tag,
  errorMessage,
  formatShortDate,
} from './ui';

export default function FeedbackPage({
  courseId,
  projectId,
  studentId,
  onAskAI,
}: {
  courseId: string;
  projectId?: string;
  studentId?: string;
  onAskAI: (message: string, privateContext?: string) => void;
}) {
  const { showToast } = useToastContext();
  const { data: feedback = [], isLoading } = useCourseFeedbackQuery(courseId);
  const { data: work = [] } = useCourseWorkQuery(courseId, { projectId, limit: 100 });
  const updateFeedback = useUpdateCourseFeedbackMutation(courseId);
  const visible = useMemo(
    () => feedback.filter((item) => !projectId || !item.projectId || item.projectId === projectId),
    [feedback, projectId],
  );
  const ownWork = useMemo(
    () => work.filter((entry) => !studentId || entry.studentId === studentId),
    [studentId, work],
  );
  const [respondingTo, setRespondingTo] = useState<CourseFeedback | null>(null);
  const [response, setResponse] = useState('');
  const [revisionId, setRevisionId] = useState('');

  const updateAction = (
    item: CourseFeedback,
    actionItemId: string,
    status: 'open' | 'addressed',
  ) => {
    updateFeedback.mutate(
      { feedbackId: item._id, input: { actionItemId, actionStatus: status } },
      {
        onError: (error) =>
          showToast({
            message: errorMessage(error, 'Could not update action item'),
            status: 'error',
          }),
      },
    );
  };

  const openResponse = (item: CourseFeedback) => {
    setRespondingTo(item);
    setResponse(item.studentResponse ?? '');
    setRevisionId(item.connectedRevisionId ?? '');
  };

  const saveResponse = () => {
    if (!respondingTo) {
      return;
    }
    updateFeedback.mutate(
      {
        feedbackId: respondingTo._id,
        input: {
          studentResponse: response,
          connectedRevisionId: revisionId,
        },
      },
      {
        onSuccess: () => {
          showToast({ message: 'Response saved', status: 'success' });
          setRespondingTo(null);
        },
        onError: (error) =>
          showToast({ message: errorMessage(error, 'Could not save response'), status: 'error' }),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feedback"
        description="Review teacher and AI feedback, then connect it to the changes you make."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onAskAI(
                'Review my most recent work in this project. Save the review as AI feedback with concrete action items.',
              )
            }
          >
            <Sparkles className="size-4" />
            Request AI review
          </Button>
        }
      />

      {isLoading ? (
        <Surface className="p-6 text-sm text-text-secondary">Loading feedback…</Surface>
      ) : null}
      {!isLoading && visible.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No feedback yet"
          description="Teacher comments and requested AI reviews will appear here."
          action={
            ownWork.length > 0 ? (
              <Button
                type="button"
                variant="submit"
                onClick={() =>
                  onAskAI(
                    `Review “${ownWork[0].title}” and save the review with action items.`,
                    `Use the exact work record ID ${ownWork[0]._id}.`,
                  )
                }
              >
                Ask AI to review recent work
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {!isLoading && visible.length > 0 ? (
        <div className="space-y-3">
          {visible.map((item) => {
            const target = work.find((entry) => entry._id === item.workId);
            const completed = item.actionItems.filter(
              (action) => action.status === 'addressed',
            ).length;
            return (
              <Surface key={item._id} className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-border-light p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                      {item.authorType === 'ai' ? (
                        <Sparkles className="size-4 text-blue-600 dark:text-blue-300" />
                      ) : (
                        <GraduationCap className="size-4 text-text-secondary" />
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {item.authorType === 'ai' ? 'Course AI' : 'Course team'}
                        </p>
                        <Tag>{item.authorType === 'ai' ? 'AI review' : 'Teacher feedback'}</Tag>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {target?.title || 'Project feedback'}
                      </p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-xs text-text-tertiary">
                    {formatShortDate(item.createdAt)}
                  </span>
                </div>
                <div className="p-4">
                  <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                  {item.actionItems.length > 0 ? (
                    <div className="mt-4 max-w-3xl rounded-lg bg-surface-secondary p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                          Action items
                        </p>
                        <span className="text-xs text-text-tertiary">
                          {completed}/{item.actionItems.length} complete
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-2">
                        {item.actionItems.map((action) => (
                          <label key={action.id} className="flex items-start gap-2.5 text-sm">
                            <input
                              type="checkbox"
                              checked={action.status === 'addressed'}
                              onChange={(event) =>
                                updateAction(
                                  item,
                                  action.id,
                                  event.target.checked ? 'addressed' : 'open',
                                )
                              }
                              className="mt-0.5 size-4 rounded border-border-medium"
                            />
                            <span
                              className={
                                action.status === 'addressed'
                                  ? 'text-text-tertiary line-through'
                                  : ''
                              }
                            >
                              {action.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.studentResponse ? (
                    <div className="mt-4 max-w-3xl border-l-2 border-border-heavy pl-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        Your response
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                        {item.studentResponse}
                      </p>
                      {item.connectedRevisionId ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                          <CheckCircle2 className="size-3.5" />
                          Revision connected
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => openResponse(item)}
                  >
                    {item.studentResponse ? 'Edit response' : 'Respond / connect revision'}
                  </Button>
                </div>
              </Surface>
            );
          })}
        </div>
      ) : null}

      <Modal
        open={respondingTo != null}
        title="Respond to feedback"
        description="Explain what changed and connect the work that shows the revision."
        onClose={() => setRespondingTo(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRespondingTo(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="submit"
              disabled={updateFeedback.isLoading}
              onClick={saveResponse}
            >
              Save response
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Your response">
            <Textarea
              rows={5}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder="What did you change after receiving this feedback?"
            />
          </Field>
          <Field label="Connected revision">
            <NativeSelect value={revisionId} onChange={setRevisionId}>
              <option value="">No revision selected</option>
              {ownWork.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  {entry.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
