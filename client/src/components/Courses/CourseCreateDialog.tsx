import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  Textarea,
  useToastContext,
} from '@librechat/client';
import { useCreateCourseMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function CourseCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const formId = useId();
  const { showToast } = useToastContext();
  const createCourse = useCreateCourseMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || createCourse.isLoading) {
      return;
    }
    try {
      const access = await createCourse.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onOpenChange(false);
      navigate(`/workspace/courses/${access.course._id}`);
      onCreated?.();
    } catch {
      showToast({ message: localize('com_course_create_error'), status: 'error' });
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_course_create')}
        showCloseButton={true}
        className="w-11/12 max-w-lg bg-surface-primary text-text-primary"
        main={
          <form id={formId} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-name`}>{localize('com_course_name')}</Label>
              <Input
                ref={nameInputRef}
                id={`${formId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={localize('com_course_name_placeholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-description`}>{localize('com_course_description')}</Label>
              <Textarea
                id={`${formId}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={localize('com_course_description_placeholder')}
                rows={4}
              />
            </div>
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!name.trim() || createCourse.isLoading}
          >
            {createCourse.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_course_create')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
