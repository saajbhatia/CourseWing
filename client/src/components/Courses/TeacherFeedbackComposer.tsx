/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { Button, Textarea, useToastContext } from '@librechat/client';
import { useCreateCourseFeedbackMutation } from '~/data-provider';
import { Field, Modal, NativeSelect, errorMessage } from './student/ui';

const ALL_RECIPIENTS = '__all__';

export type TeacherFeedbackRecipient = {
  key: string;
  name: string;
  userId?: string;
  active: boolean;
};

export type TeacherFeedbackTarget = {
  title: string;
  recipients: TeacherFeedbackRecipient[];
  workId?: string;
  projectId?: string;
  allowAll?: boolean;
  defaultRecipientId?: string;
};

export default function TeacherFeedbackComposer({
  courseId,
  open,
  target,
  onClose,
}: {
  courseId: string;
  open: boolean;
  target: TeacherFeedbackTarget | null;
  onClose: () => void;
}) {
  const { showToast } = useToastContext();
  const createFeedback = useCreateCourseFeedbackMutation(courseId);
  const [recipientId, setRecipientId] = useState('');
  const [content, setContent] = useState('');
  const [actionItems, setActionItems] = useState('');
  const [privateNote, setPrivateNote] = useState(false);

  const activeRecipients = useMemo(
    () => target?.recipients.filter((recipient) => recipient.active && recipient.userId) ?? [],
    [target],
  );
  const canChooseAll = Boolean(target?.allowAll && activeRecipients.length > 1);

  useEffect(() => {
    if (!open || !target) {
      return;
    }
    const defaultRecipient =
      target.defaultRecipientId &&
      activeRecipients.some((recipient) => recipient.userId === target.defaultRecipientId)
        ? target.defaultRecipientId
        : '';
    setRecipientId(
      defaultRecipient ||
        (target.allowAll && activeRecipients.length > 1
          ? ALL_RECIPIENTS
          : (activeRecipients[0]?.userId ?? '')),
    );
    setContent('');
    setActionItems('');
    setPrivateNote(false);
  }, [activeRecipients, open, target]);

  const selectedRecipients =
    recipientId === ALL_RECIPIENTS
      ? activeRecipients
      : activeRecipients.filter((recipient) => recipient.userId === recipientId);
  const canSubmit = Boolean(target && content.trim() && selectedRecipients.length > 0);

  const submit = async () => {
    if (!target || !canSubmit) {
      return;
    }
    const parsedActionItems = actionItems
      .split('\n')
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text }));

    try {
      await Promise.all(
        selectedRecipients.map((recipient) =>
          createFeedback.mutateAsync({
            studentId: recipient.userId as string,
            workId: target.workId,
            projectId: target.projectId,
            visibility: privateNote ? 'teacher' : 'student',
            content: content.trim(),
            actionItems: parsedActionItems,
          }),
        ),
      );
      showToast({
        message:
          selectedRecipients.length === 1
            ? 'Feedback saved'
            : `Feedback saved for ${selectedRecipients.length} students`,
        status: 'success',
      });
      onClose();
    } catch (error) {
      showToast({
        message: errorMessage(error, 'Could not save feedback'),
        status: 'error',
      });
    }
  };

  const showRecipientPicker = Boolean(
    target && (target.recipients.length > 1 || target.recipients.some((item) => !item.active)),
  );
  let submitLabel = 'Send feedback';
  if (createFeedback.isLoading) {
    submitLabel = 'Saving…';
  } else if (privateNote) {
    submitLabel = 'Save private note';
  }

  return (
    <Modal
      open={open && target != null}
      title="Give feedback"
      description={target?.title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="submit"
            disabled={!canSubmit || createFeedback.isLoading}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {showRecipientPicker ? (
          <Field label="Student">
            <NativeSelect value={recipientId} onChange={setRecipientId}>
              {canChooseAll ? (
                <option value={ALL_RECIPIENTS}>All active project students</option>
              ) : null}
              {target?.recipients.map((recipient) => (
                <option
                  key={recipient.key}
                  value={recipient.userId || `pending-${recipient.key}`}
                  disabled={!recipient.active || !recipient.userId}
                >
                  {recipient.name}
                  {!recipient.active || !recipient.userId ? ' (not active yet)' : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {!showRecipientPicker && activeRecipients[0] ? (
          <div className="rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
            For <span className="font-medium text-text-primary">{activeRecipients[0].name}</span>
          </div>
        ) : null}
        {!showRecipientPicker && !activeRecipients[0] ? (
          <div className="rounded-lg border border-border-medium px-3 py-2 text-sm text-text-secondary">
            This student must join the course before feedback can be saved.
          </div>
        ) : null}

        <Field label="Feedback">
          <Textarea
            rows={6}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What is working, and what should change?"
          />
        </Field>
        <Field label="Action items" hint="Optional. Add one action per line.">
          <Textarea
            rows={4}
            value={actionItems}
            onChange={(event) => setActionItems(event.target.value)}
            placeholder={'Clarify the evaluation metric\nAdd evidence for the main claim'}
          />
        </Field>
        <label className="flex items-start gap-2.5 rounded-lg border border-border-medium p-3 text-sm">
          <input
            type="checkbox"
            checked={privateNote}
            onChange={(event) => setPrivateNote(event.target.checked)}
            className="mt-0.5 size-4 rounded border-border-medium"
          />
          <span>
            <span className="block font-medium text-text-primary">
              Only teaching staff can see this
            </span>
            <span className="mt-0.5 block text-xs text-text-tertiary">
              Private notes are saved immediately and are not sent to the student.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
