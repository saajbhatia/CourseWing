/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderKanban, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, useToastContext } from '@librechat/client';
import type { CourseLink, CourseOverview, CourseProject } from 'librechat-data-provider';
import {
  useCreateCourseProjectMutation,
  useDeleteCourseProjectMutation,
  useUpdateCourseProjectByIdMutation,
} from '~/data-provider';
import { EmptyState, Field, Modal, PageHeader, Surface, errorMessage } from './ui';

type ProjectForm = {
  title: string;
  problem: string;
  targetUser: string;
  valueProposition: string;
  capability: string;
  dataInput: string;
  output: string;
  evaluation: string;
  safeguards: string;
  risks: string;
  links: string;
  collaboratorEmails: string;
};

const emptyForm: ProjectForm = {
  title: '',
  problem: '',
  targetUser: '',
  valueProposition: '',
  capability: '',
  dataInput: '',
  output: '',
  evaluation: '',
  safeguards: '',
  risks: '',
  links: '',
  collaboratorEmails: '',
};

function projectToForm(project?: CourseProject): ProjectForm {
  if (!project) {
    return emptyForm;
  }
  return {
    title: project.title ?? '',
    problem: project.problem ?? '',
    targetUser: project.targetUser ?? '',
    valueProposition: project.valueProposition ?? '',
    capability: project.technicalRoute?.capability ?? '',
    dataInput: project.technicalRoute?.dataInput ?? '',
    output: project.technicalRoute?.output ?? '',
    evaluation: project.technicalRoute?.evaluation ?? '',
    safeguards: project.technicalRoute?.safeguards ?? '',
    risks: (project.risks ?? []).join('\n'),
    links: (project.links ?? [])
      .map((link) => `${link.label ? `${link.label} | ` : ''}${link.url}`)
      .join('\n'),
    collaboratorEmails: (
      (project as CourseProject & { collaboratorEmails?: string[] }).collaboratorEmails ?? []
    ).join(', '),
  };
}

function parseLinks(value: string): CourseLink[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...rest] = line.split('|').map((item) => item.trim());
      if (rest.length === 0) {
        return { url: first };
      }
      return { label: first, url: rest.join('|').trim() };
    })
    .filter((link) => /^https?:\/\//i.test(link.url));
}

export default function ProjectPage({
  courseId,
  overview,
  projectId,
  createRequested,
  onOpenProject,
  onCloseCreate,
  onGoHome,
}: {
  courseId: string;
  overview: CourseOverview;
  projectId?: string;
  createRequested: boolean;
  onOpenProject: (projectId: string) => void;
  onCloseCreate: () => void;
  onGoHome: () => void;
}) {
  const { showToast } = useToastContext();
  const project = useMemo(
    () => overview.projects.find((item) => item._id === projectId),
    [overview.projects, projectId],
  );
  const [section, setSection] = useState<'details' | 'technical' | 'links'>('details');
  const [form, setForm] = useState<ProjectForm>(() => projectToForm(project));
  const [createOpen, setCreateOpen] = useState(createRequested);
  const [createTitle, setCreateTitle] = useState('');
  const [createProblem, setCreateProblem] = useState('');
  const [collaborators, setCollaborators] = useState('');
  const createProject = useCreateCourseProjectMutation(courseId);
  const updateProject = useUpdateCourseProjectByIdMutation(courseId);
  const deleteProject = useDeleteCourseProjectMutation(courseId);
  const isProjectCreator =
    project != null &&
    (project as CourseProject & { createdBy?: string }).createdBy === overview.membership.userId;
  const canDelete = isProjectCreator;
  const canManageCollaborators = isProjectCreator || overview.membership.role === 'teacher';

  useEffect(() => {
    setForm(projectToForm(project));
  }, [project]);

  useEffect(() => {
    if (createRequested) {
      setCreateOpen(true);
    }
  }, [createRequested]);

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateTitle('');
    setCreateProblem('');
    setCollaborators('');
    onCloseCreate();
  };

  const saveProject = () => {
    if (!project || !form.title.trim()) {
      return;
    }
    const collaboratorEmails = form.collaboratorEmails
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter(Boolean);
    updateProject.mutate(
      {
        projectId: project._id,
        input: {
          title: form.title,
          problem: form.problem,
          targetUser: form.targetUser,
          valueProposition: form.valueProposition,
          technicalRoute: {
            capability: form.capability,
            dataInput: form.dataInput,
            output: form.output,
            evaluation: form.evaluation,
            safeguards: form.safeguards,
          },
          risks: form.risks
            .split('\n')
            .map((risk) => risk.trim())
            .filter(Boolean),
          links: parseLinks(form.links),
          ...(canManageCollaborators ? { collaboratorEmails } : {}),
        },
      },
      {
        onSuccess: () => {
          showToast({ message: 'Project saved', status: 'success' });
        },
        onError: (error) => {
          showToast({ message: errorMessage(error, 'Could not save project'), status: 'error' });
        },
      },
    );
  };

  const create = () => {
    if (!createTitle.trim()) {
      showToast({ message: 'Add a project title', status: 'error' });
      return;
    }
    createProject.mutate(
      {
        title: createTitle,
        problem: createProblem,
        collaboratorEmails: collaborators
          .split(/[,\n]/)
          .map((email) => email.trim())
          .filter(Boolean),
      },
      {
        onSuccess: (created) => {
          showToast({ message: 'Project created', status: 'success' });
          closeCreate();
          onOpenProject(created._id);
        },
        onError: (error) => {
          showToast({ message: errorMessage(error, 'Could not create project'), status: 'error' });
        },
      },
    );
  };

  const remove = () => {
    if (
      !project ||
      !window.confirm(
        `Delete “${project.title}”? Its work, papers, time entries, milestones, and feedback will also be removed.`,
      )
    ) {
      return;
    }
    deleteProject.mutate(project._id, {
      onSuccess: () => {
        showToast({ message: 'Project deleted', status: 'success' });
        onGoHome();
      },
      onError: (error) => {
        showToast({ message: errorMessage(error, 'Could not delete project'), status: 'error' });
      },
    });
  };

  if (!project) {
    return (
      <>
        <EmptyState
          icon={FolderKanban}
          title="Choose or create a project"
          description="Projects connect your work, research, time, and feedback."
          action={
            <Button type="button" variant="submit" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New project
            </Button>
          }
        />
        <CreateProjectModal
          open={createOpen}
          title={createTitle}
          problem={createProblem}
          collaborators={collaborators}
          busy={createProject.isLoading}
          onTitleChange={setCreateTitle}
          onProblemChange={setCreateProblem}
          onCollaboratorsChange={setCollaborators}
          onClose={closeCreate}
          onCreate={create}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={project.title}
        description={project.problem || 'Add the problem this project is exploring.'}
        actions={
          <>
            {canDelete ? (
              <Button type="button" variant="outline" onClick={remove}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="submit"
              disabled={updateProject.isLoading}
              onClick={saveProject}
            >
              {updateProject.isLoading ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="flex w-fit rounded-lg bg-surface-secondary p-1">
        {[
          ['details', 'Details'],
          ['technical', 'Technical route'],
          ['links', 'Links & risks'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id as typeof section)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              section === id
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'details' ? (
        <Surface className="grid gap-5 p-5 md:grid-cols-2">
          <Field label="Project title">
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </Field>
          <Field label="Problem">
            <Input
              value={form.problem}
              onChange={(event) =>
                setForm((current) => ({ ...current, problem: event.target.value }))
              }
            />
          </Field>
          <Field label="Target users">
            <Textarea
              rows={4}
              value={form.targetUser}
              onChange={(event) =>
                setForm((current) => ({ ...current, targetUser: event.target.value }))
              }
            />
          </Field>
          <Field label="Core idea / hypothesis">
            <Textarea
              rows={4}
              value={form.valueProposition}
              onChange={(event) =>
                setForm((current) => ({ ...current, valueProposition: event.target.value }))
              }
            />
          </Field>
          <Field
            label="Collaborator emails"
            hint={
              canManageCollaborators
                ? 'Everyone listed must already be an active student in this course.'
                : 'Only the project creator can change collaborators.'
            }
            className="md:col-span-2"
          >
            <Textarea
              rows={3}
              value={form.collaboratorEmails}
              disabled={!canManageCollaborators}
              onChange={(event) =>
                setForm((current) => ({ ...current, collaboratorEmails: event.target.value }))
              }
            />
          </Field>
        </Surface>
      ) : null}

      {section === 'technical' ? (
        <Surface className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['capability', 'What are you building?'],
            ['dataInput', 'Data or inputs'],
            ['output', 'Output / prototype'],
            ['evaluation', 'How will you evaluate it?'],
            ['safeguards', 'Responsible-use safeguards'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <Textarea
                rows={4}
                value={form[key as keyof ProjectForm]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </Field>
          ))}
        </Surface>
      ) : null}

      {section === 'links' ? (
        <Surface className="grid gap-5 p-5 md:grid-cols-2">
          <Field label="Project links" hint="One per line. Use “Label | https://…” or just a URL.">
            <Textarea
              rows={9}
              value={form.links}
              onChange={(event) =>
                setForm((current) => ({ ...current, links: event.target.value }))
              }
              placeholder="GitHub | https://github.com/…"
            />
          </Field>
          <Field label="Risks and open questions" hint="One item per line.">
            <Textarea
              rows={9}
              value={form.risks}
              onChange={(event) =>
                setForm((current) => ({ ...current, risks: event.target.value }))
              }
              placeholder="We still need to narrow the first test scenario."
            />
          </Field>
        </Surface>
      ) : null}

      <CreateProjectModal
        open={createOpen}
        title={createTitle}
        problem={createProblem}
        collaborators={collaborators}
        busy={createProject.isLoading}
        onTitleChange={setCreateTitle}
        onProblemChange={setCreateProblem}
        onCollaboratorsChange={setCollaborators}
        onClose={closeCreate}
        onCreate={create}
      />
    </div>
  );
}

function CreateProjectModal({
  open,
  title,
  problem,
  collaborators,
  busy,
  onTitleChange,
  onProblemChange,
  onCollaboratorsChange,
  onClose,
  onCreate,
}: {
  open: boolean;
  title: string;
  problem: string;
  collaborators: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onProblemChange: (value: string) => void;
  onCollaboratorsChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Modal
      open={open}
      title="New project"
      description="Work independently, or add classmates who already belong to this course."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="submit" disabled={busy} onClick={onCreate}>
            {busy ? 'Creating…' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project title">
          <Input
            ref={titleInputRef}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="What are you working on?"
          />
        </Field>
        <Field label="Problem">
          <Textarea
            rows={3}
            value={problem}
            onChange={(event) => onProblemChange(event.target.value)}
            placeholder="What problem are you exploring?"
          />
        </Field>
        <Field
          label="Collaborator emails"
          hint="Optional. Separate multiple emails with commas or new lines."
        >
          <Textarea
            rows={3}
            value={collaborators}
            onChange={(event) => onCollaboratorsChange(event.target.value)}
            placeholder="student@school.edu"
          />
        </Field>
      </div>
    </Modal>
  );
}
