/* eslint-disable i18next/no-literal-string */
import { useState, type FormEvent } from 'react';
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button, Input, Spinner, Textarea, useToastContext } from '@librechat/client';
import type { CourseAiUse } from 'librechat-data-provider';
import {
  useCourseAiUseQuery,
  useCreateCourseAiUseMutation,
  useDeleteCourseAiUseMutation,
  useUpdateCourseAiUseMutation,
} from '~/data-provider';
import { EmptyState, Field, Modal, PageHeader, Surface, Tag, errorMessage } from './ui';

type AiUseForm = {
  date: string;
  tool: string;
  task: string;
  output: string;
  evidenceUrl: string;
  reviewed: boolean;
  safetyNotes: string;
  learning: string;
};

const commonTools = [
  'ChatGPT',
  'Claude',
  'Codex',
  'Gemini',
  'GitHub Copilot',
  'Microsoft Copilot',
  'NotebookLM',
  'Perplexity',
];

function today(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : today();
}

function formatDate(value: string): string {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function emptyForm(): AiUseForm {
  return {
    date: today(),
    tool: '',
    task: '',
    output: '',
    evidenceUrl: '',
    reviewed: false,
    safetyNotes: '',
    learning: '',
  };
}

function formFor(entry: CourseAiUse): AiUseForm {
  return {
    date: dateOnly(entry.date),
    tool: entry.tool,
    task: entry.task,
    output: entry.output,
    evidenceUrl: entry.evidenceUrl ?? '',
    reviewed: entry.reviewed,
    safetyNotes: entry.safetyNotes ?? '',
    learning: entry.learning,
  };
}

export default function AiUsePage({
  courseId,
  projectId,
  onAskAI,
}: {
  courseId: string;
  projectId?: string;
  onAskAI: (message: string, privateContext?: string) => void;
}) {
  const { showToast } = useToastContext();
  const {
    data: entries = [],
    isLoading,
    isError,
  } = useCourseAiUseQuery(courseId, undefined, projectId);
  const createAiUse = useCreateCourseAiUseMutation(courseId);
  const updateAiUse = useUpdateCourseAiUseMutation(courseId);
  const deleteAiUse = useDeleteCourseAiUseMutation(courseId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CourseAiUse | null>(null);
  const [form, setForm] = useState<AiUseForm>(emptyForm);
  const [naturalLanguage, setNaturalLanguage] = useState('');
  const formId = `ai-use-editor-${editing?._id ?? 'new'}`;
  const isSaving = createAiUse.isLoading || updateAiUse.isLoading;
  const reviewedCount = entries.filter((entry) => entry.reviewed).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const openEdit = (entry: CourseAiUse) => {
    setEditing(entry);
    setForm(formFor(entry));
    setEditorOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    if (!form.tool.trim() || !form.task.trim() || !form.output.trim() || !form.learning.trim()) {
      showToast({
        message: 'Add the tool, task, result, and what you learned',
        status: 'error',
      });
      return;
    }
    const input = {
      projectId,
      date: form.date,
      tool: form.tool.trim(),
      task: form.task.trim(),
      output: form.output.trim(),
      evidenceUrl: form.evidenceUrl.trim(),
      reviewed: form.reviewed,
      safetyNotes: form.safetyNotes.trim(),
      learning: form.learning.trim(),
    };
    try {
      if (editing) {
        await updateAiUse.mutateAsync({ aiUseId: editing._id, input });
      } else {
        await createAiUse.mutateAsync(input);
      }
      showToast({ message: editing ? 'AI use updated' : 'AI use added', status: 'success' });
      setEditorOpen(false);
    } catch (error) {
      showToast({
        message: errorMessage(error, 'Could not save this AI use'),
        status: 'error',
      });
    }
  };

  const remove = async (entry: CourseAiUse) => {
    if (!window.confirm(`Delete this ${entry.tool} record?`)) {
      return;
    }
    try {
      await deleteAiUse.mutateAsync(entry._id);
      showToast({ message: 'AI use deleted', status: 'success' });
    } catch (error) {
      showToast({
        message: errorMessage(error, 'Could not delete this AI use'),
        status: 'error',
      });
    }
  };

  const sendNaturalLanguage = () => {
    const statement = naturalLanguage.trim();
    if (!statement) {
      return;
    }
    onAskAI(
      `Help me turn this statement into an AI-use record: ${JSON.stringify(
        statement,
      )}. Ask concise follow-up questions for any missing essentials: the AI tool, what I used it for, what it produced, whether I checked the result, and what I learned or changed. Do not invent my answers. Once the record is complete, save it to this project and confirm the save.`,
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Use"
        description="Keep a short record of how AI supported your work, what you checked, and what you learned."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAskAI('Help me reflect on how I used AI in this project.')}
            >
              <Bot className="size-4" />
              Ask AI
            </Button>
            <Button type="button" variant="submit" onClick={openCreate}>
              <Plus className="size-4" />
              Add AI use
            </Button>
          </>
        }
      />

      <Surface className="flex flex-col gap-2.5 border-blue-500/20 bg-blue-500/5 p-3 sm:flex-row sm:items-center">
        <Sparkles className="hidden size-4 shrink-0 text-blue-600 sm:block" aria-hidden="true" />
        <Input
          aria-label="Describe how you used AI"
          value={naturalLanguage}
          onChange={(event) => setNaturalLanguage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              sendNaturalLanguage();
            }
          }}
          placeholder="I used ChatGPT to compare two approaches, checked its answer, and changed…"
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="submit" onClick={sendNaturalLanguage}>
          Continue in chat
        </Button>
      </Surface>

      {entries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-border-light py-3 text-sm">
          <span>
            <strong>{entries.length}</strong>{' '}
            <span className="text-text-secondary">uses recorded</span>
          </span>
          <span>
            <strong>{reviewedCount}</strong>{' '}
            <span className="text-text-secondary">reviewed by you</span>
          </span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-5 text-text-secondary" />
        </div>
      ) : null}
      {!isLoading && isError ? (
        <EmptyState
          icon={CircleAlert}
          title="AI use is unavailable"
          description="Your AI-use records could not be loaded. Try refreshing the page."
        />
      ) : null}
      {!isLoading && !isError && entries.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No AI use recorded"
          description="Add a short record when AI helps you understand, create, test, or revise something."
          action={
            <Button type="button" variant="submit" onClick={openCreate}>
              <Plus className="size-4" />
              Add AI use
            </Button>
          }
        />
      ) : null}
      {!isLoading && !isError && entries.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {entries.map((entry) => (
            <Surface key={entry._id} className="flex min-w-0 flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-300">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-text-primary">{entry.tool}</h3>
                    <Tag>{entry.reviewed ? 'Reviewed' : 'Needs review'}</Tag>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {formatDate(entry.date)}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-text-primary">What I used it for</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-text-secondary">{entry.task}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">What it produced</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-text-secondary">{entry.output}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">What I learned or changed</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-text-secondary">{entry.learning}</dd>
                </div>
                {entry.safetyNotes ? (
                  <div>
                    <dt className="flex items-center gap-1.5 font-medium text-text-primary">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      Safety/privacy check
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap text-text-secondary">
                      {entry.safetyNotes}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {entry.evidenceUrl ? (
                <a
                  href={entry.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-border-medium px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Open evidence</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              ) : null}

              <div className="mt-auto flex justify-end gap-1 border-t border-border-light pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                  disabled={deleteAiUse.isLoading}
                  onClick={() => void remove(entry)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </Surface>
          ))}
        </div>
      ) : null}

      <Modal
        open={editorOpen}
        title={editing ? 'Edit AI use' : 'Add AI use'}
        description="Record the important part of the interaction, not the full chat."
        onClose={() => setEditorOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="submit" disabled={isSaving}>
              {isSaving ? <Spinner className="size-4" /> : null}
              {editing ? 'Save changes' : 'Add AI use'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </Field>
          <Field label="AI tool" hint="Choose a common tool or type another name.">
            <Input
              list="course-ai-tools"
              value={form.tool}
              onChange={(event) => setForm((current) => ({ ...current, tool: event.target.value }))}
              placeholder="ChatGPT, Codex, Claude…"
            />
            <datalist id="course-ai-tools">
              {commonTools.map((tool) => (
                <option key={tool} value={tool} />
              ))}
            </datalist>
          </Field>
          <Field label="What did you use it for?" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.task}
              onChange={(event) => setForm((current) => ({ ...current, task: event.target.value }))}
              placeholder="Debugging an API error, comparing two papers, drafting interview questions…"
            />
          </Field>
          <Field label="What did it produce?" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.output}
              onChange={(event) =>
                setForm((current) => ({ ...current, output: event.target.value }))
              }
              placeholder="A code suggestion, explanation, outline, image, or set of alternatives."
            />
          </Field>
          <Field label="Evidence link">
            <Input
              type="url"
              value={form.evidenceUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, evidenceUrl: event.target.value }))
              }
              placeholder="https://…"
            />
          </Field>
          <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-border-medium px-3 py-2">
            <input
              type="checkbox"
              checked={form.reviewed}
              onChange={(event) =>
                setForm((current) => ({ ...current, reviewed: event.target.checked }))
              }
              className="size-4 rounded border-border-heavy"
            />
            <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {form.reviewed ? (
                <CheckCircle2 className="size-4 text-green-600" aria-hidden="true" />
              ) : (
                <CircleAlert className="size-4 text-amber-600" aria-hidden="true" />
              )}
              I reviewed the output
            </span>
          </label>
          <Field
            label="Safety/privacy check"
            hint="Optional: note what you avoided sharing or what you verified."
            className="sm:col-span-2"
          >
            <Textarea
              rows={2}
              value={form.safetyNotes}
              onChange={(event) =>
                setForm((current) => ({ ...current, safetyNotes: event.target.value }))
              }
              placeholder="I removed personal data before asking, and checked the cited sources."
            />
          </Field>
          <Field label="What did you learn or change?" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.learning}
              onChange={(event) =>
                setForm((current) => ({ ...current, learning: event.target.value }))
              }
              placeholder="What did you accept, reject, revise, or understand differently?"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
