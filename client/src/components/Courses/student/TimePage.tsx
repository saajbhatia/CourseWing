/* eslint-disable i18next/no-literal-string */
import { useMemo, useState } from 'react';
import { Clock3, Link2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, useToastContext } from '@librechat/client';
import type { CourseTime } from 'librechat-data-provider';
import {
  useCourseTimeQuery,
  useCreateCourseTimeMutation,
  useDeleteCourseTimeMutation,
  useUpdateCourseTimeMutation,
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
  formatMinutes,
} from './ui';

type TimeForm = {
  date: string;
  minutes: string;
  category: CourseTime['category'];
  customCategory: string;
  description: string;
  outcome: string;
  evidenceUrl: string;
  reflection: string;
};

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const emptyTimeForm = (): TimeForm => ({
  date: today(),
  minutes: '',
  category: 'class',
  customCategory: '',
  description: '',
  outcome: '',
  evidenceUrl: '',
  reflection: '',
});

function dateOnly(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : today();
}

function formatTimeDate(value: string): string {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const categories: Array<{ value: CourseTime['category']; label: string }> = [
  { value: 'class', label: 'Class' },
  { value: 'reading', label: 'Reading' },
  { value: 'research', label: 'Research' },
  { value: 'coding', label: 'Coding' },
  { value: 'design', label: 'Design' },
  { value: 'ai_experimentation', label: 'AI experimentation' },
  { value: 'office_hours', label: 'Office hours' },
  { value: 'team_meeting', label: 'Team meeting' },
  { value: 'slide_building', label: 'Slide building' },
  { value: 'demo_video', label: 'Demo/video' },
  { value: 'website', label: 'Website' },
  { value: 'fundraising_ip', label: 'Fundraising/IP' },
  { value: 'testing', label: 'Testing' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

function categoryLabel(category: CourseTime['category'], customCategory?: string): string {
  if (category === 'other' && customCategory?.trim()) {
    return customCategory.trim();
  }
  return categories.find((item) => item.value === category)?.label ?? category;
}

export default function TimePage({
  courseId,
  projectId,
  onAskAI,
}: {
  courseId: string;
  projectId?: string;
  onAskAI: (message: string, privateContext?: string) => void;
}) {
  const { showToast } = useToastContext();
  const { data: entries = [], isLoading } = useCourseTimeQuery(courseId, undefined, projectId);
  const createTime = useCreateCourseTimeMutation(courseId);
  const updateTime = useUpdateCourseTimeMutation(courseId);
  const deleteTime = useDeleteCourseTimeMutation(courseId);
  const [filter, setFilter] = useState('all');
  const [naturalLanguage, setNaturalLanguage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CourseTime | null>(null);
  const [form, setForm] = useState<TimeForm>(emptyTimeForm);

  const filtered = useMemo(
    () => entries.filter((entry) => filter === 'all' || entry.category === filter),
    [entries, filter],
  );
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const categoryCount = new Set(
    entries.map((entry) => `${entry.category}:${entry.customCategory ?? ''}`),
  ).size;
  const evidenceCount = entries.filter((entry) => entry.evidenceUrl).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyTimeForm());
    setEditorOpen(true);
  };

  const openEdit = (entry: CourseTime) => {
    setEditing(entry);
    setForm({
      date: dateOnly(entry.date),
      minutes: String(entry.minutes),
      category: entry.category,
      customCategory: entry.customCategory ?? '',
      description: entry.description,
      outcome: entry.outcome ?? '',
      evidenceUrl: entry.evidenceUrl ?? '',
      reflection: entry.reflection ?? '',
    });
    setEditorOpen(true);
  };

  const save = () => {
    const minutes = Number(form.minutes);
    if (!form.description.trim() || !Number.isFinite(minutes) || minutes < 1) {
      showToast({ message: 'Add a description and a valid duration', status: 'error' });
      return;
    }
    if (form.category === 'other' && !form.customCategory.trim()) {
      showToast({ message: 'Name your custom category', status: 'error' });
      return;
    }
    const input = {
      projectId,
      date: form.date,
      minutes,
      category: form.category,
      customCategory: form.category === 'other' ? form.customCategory.trim() : '',
      description: form.description,
      outcome: form.outcome,
      evidenceUrl: form.evidenceUrl,
      reflection: form.reflection,
    };
    const callbacks = {
      onSuccess: () => {
        showToast({
          message: editing ? 'Time entry updated' : 'Time entry added',
          status: 'success',
        });
        setEditorOpen(false);
      },
      onError: (error: unknown) => {
        showToast({ message: errorMessage(error, 'Could not save time entry'), status: 'error' });
      },
    };
    if (editing) {
      updateTime.mutate({ timeId: editing._id, input }, callbacks);
    } else {
      createTime.mutate(input, callbacks);
    }
  };

  const remove = (entry: CourseTime) => {
    if (!window.confirm('Delete this time entry?')) {
      return;
    }
    deleteTime.mutate(entry._id, {
      onSuccess: () => showToast({ message: 'Time entry deleted', status: 'success' }),
      onError: (error) =>
        showToast({ message: errorMessage(error, 'Could not delete time entry'), status: 'error' }),
    });
  };

  const sendNaturalLanguage = () => {
    const command = naturalLanguage.trim();
    if (!command) {
      return;
    }
    onAskAI(
      `Update my time log from this statement: "${command}". Save every requested row now and return a receipt.`,
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Time"
        description="A spreadsheet-like record of the time spent on this project."
        actions={
          <Button type="button" variant="outline" onClick={openCreate}>
            <Plus className="size-4" />
            Add row
          </Button>
        }
      />

      <Surface className="flex flex-col gap-2.5 border-blue-500/20 bg-blue-500/5 p-3 sm:flex-row sm:items-center">
        <Sparkles className="hidden size-4 shrink-0 text-blue-600 sm:block" />
        <Input
          aria-label="Update this sheet with natural language"
          value={naturalLanguage}
          onChange={(event) => setNaturalLanguage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              sendNaturalLanguage();
            }
          }}
          placeholder="I spent 2 hours debugging the API and 30 minutes updating slides."
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="submit" onClick={sendNaturalLanguage}>
          Update log
        </Button>
      </Surface>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-border-light py-3 text-sm">
        <span>
          <strong>{formatMinutes(totalMinutes)}</strong>{' '}
          <span className="text-text-secondary">recorded</span>
        </span>
        <span>
          <strong>{categoryCount}</strong> <span className="text-text-secondary">categories</span>
        </span>
        <span>
          <strong>{evidenceCount}</strong>{' '}
          <span className="text-text-secondary">evidence links</span>
        </span>
        <div className="ml-auto w-44">
          <NativeSelect value={filter} onChange={setFilter} ariaLabel="Filter time entries">
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {isLoading ? (
        <Surface className="p-6 text-sm text-text-secondary">Loading time entries…</Surface>
      ) : null}
      {!isLoading && filtered.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title="No time entries"
          description="Add a row manually, or describe what you worked on in one sentence."
          action={
            <Button type="button" variant="submit" onClick={openCreate}>
              Add time
            </Button>
          }
        />
      ) : null}
      {!isLoading && filtered.length > 0 ? (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-border-light bg-surface-secondary text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="w-28 px-4 py-3">Date</th>
                  <th className="w-24 px-4 py-3">Duration</th>
                  <th className="w-32 px-4 py-3">Category</th>
                  <th className="px-4 py-3">What I did</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="w-44 px-4 py-3">Evidence</th>
                  <th className="w-20 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filtered.map((entry) => (
                  <tr key={entry._id} className="group hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {formatTimeDate(entry.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold">
                      {formatMinutes(entry.minutes)}
                    </td>
                    <td className="px-4 py-3">
                      <Tag>{categoryLabel(entry.category, entry.customCategory)}</Tag>
                    </td>
                    <td className="max-w-sm px-4 py-3 text-sm text-text-secondary">
                      {entry.description}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-sm">{entry.outcome || '—'}</td>
                    <td className="px-4 py-3">
                      {entry.evidenceUrl ? (
                        <a
                          href={entry.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-40 items-center gap-1.5 truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-300"
                        >
                          <Link2 className="size-3.5 shrink-0" />
                          Open evidence
                        </a>
                      ) : (
                        <span className="text-sm text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex">
                        <button
                          type="button"
                          aria-label="Edit time entry"
                          onClick={() => openEdit(entry)}
                          className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-active-alt hover:text-text-primary"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete time entry"
                          onClick={() => remove(entry)}
                          className="rounded-md p-1.5 text-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : null}

      <Modal
        open={editorOpen}
        title={editing ? 'Edit time entry' : 'Add time entry'}
        onClose={() => setEditorOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="submit"
              disabled={createTime.isLoading || updateTime.isLoading}
              onClick={save}
            >
              Save row
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              type="number"
              min="1"
              max="1440"
              value={form.minutes}
              onChange={(event) =>
                setForm((current) => ({ ...current, minutes: event.target.value }))
              }
              placeholder="90"
            />
          </Field>
          <Field label="Category">
            <NativeSelect
              value={form.category}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  category: value as CourseTime['category'],
                }))
              }
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {form.category === 'other' ? (
            <Field label="Custom category">
              <Input
                value={form.customCategory}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customCategory: event.target.value }))
                }
                placeholder="Mentor interview"
              />
            </Field>
          ) : null}
          <Field label="Outcome">
            <Input
              value={form.outcome}
              onChange={(event) =>
                setForm((current) => ({ ...current, outcome: event.target.value }))
              }
              placeholder="Working API connection"
            />
          </Field>
          <Field label="What I did" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
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
          <Field label="Reflection">
            <Textarea
              rows={2}
              value={form.reflection}
              onChange={(event) =>
                setForm((current) => ({ ...current, reflection: event.target.value }))
              }
              placeholder="What did you learn or change?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
