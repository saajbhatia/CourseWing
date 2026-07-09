import { useCallback } from 'react';
import {
  assistanceLevels,
  extractAssistanceLevel,
  defaultAssistanceLevel,
  setAssistanceLevelInPrefix,
} from 'librechat-data-provider';
import type { AssistanceLevel } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const levelLabelKeys = {
  discuss: 'com_ui_assistance_discuss',
  hints: 'com_ui_assistance_hints',
  worked: 'com_ui_assistance_worked',
  full: 'com_ui_assistance_full',
} as const;

const levelDescriptionKeys = {
  discuss: 'com_ui_assistance_discuss_desc',
  hints: 'com_ui_assistance_hints_desc',
  worked: 'com_ui_assistance_worked_desc',
  full: 'com_ui_assistance_full_desc',
} as const;

function useAssistanceLevel() {
  const { conversation, setConversation } = useChatContext();
  const level = extractAssistanceLevel(conversation?.promptPrefix) ?? defaultAssistanceLevel;

  const setLevel = useCallback(
    (next: AssistanceLevel) => {
      setConversation((prev) =>
        prev == null
          ? prev
          : { ...prev, promptPrefix: setAssistanceLevelInPrefix(prev.promptPrefix, next) },
      );
    },
    [setConversation],
  );

  return { level, setLevel };
}

export function AssistanceLevelNote() {
  const localize = useLocalize();
  const { level } = useAssistanceLevel();

  return (
    <div className="px-3 pb-1.5 text-sm text-text-secondary" aria-live="polite">
      {localize(levelDescriptionKeys[level])}
    </div>
  );
}

export default function AssistanceLevelBar() {
  const localize = useLocalize();
  const { level, setLevel } = useAssistanceLevel();

  return (
    <div
      role="radiogroup"
      aria-label={localize('com_ui_assistance_level')}
      className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-light p-1"
    >
      {assistanceLevels.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={level === value}
          onClick={() => setLevel(value)}
          className={cn(
            'whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors',
            level === value
              ? 'bg-text-primary font-medium text-surface-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {localize(levelLabelKeys[value])}
        </button>
      ))}
    </div>
  );
}
