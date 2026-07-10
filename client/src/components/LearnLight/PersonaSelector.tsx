import { useCallback, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, Drama } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { extractPersona, learnLightPersonas, setPersonaInPrefix } from 'librechat-data-provider';
import type { LearnLightPersona } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const personaLabelKeys = {
  socratic: 'com_ui_persona_socratic',
  direct: 'com_ui_persona_direct',
  storyteller: 'com_ui_persona_storyteller',
  encourager: 'com_ui_persona_encourager',
} as const;

function usePersona() {
  const { conversation, setConversation } = useChatContext();
  const persona = extractPersona(conversation?.promptPrefix);

  const setPersona = useCallback(
    (next: LearnLightPersona | null) => {
      setConversation((prev) =>
        prev == null
          ? prev
          : { ...prev, promptPrefix: setPersonaInPrefix(prev.promptPrefix, next) },
      );
    },
    [setConversation],
  );

  return { persona, setPersona };
}

export default function PersonaSelector() {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const { persona, setPersona } = usePersona();

  const options: Array<{ value: LearnLightPersona | null; label: string }> = [
    { value: null, label: localize('com_ui_persona_default') },
    ...learnLightPersonas.map((value) => ({ value, label: localize(personaLabelKeys[value]) })),
  ];

  const items = options.map((option) => ({
    label: option.label,
    onClick: () => setPersona(option.value),
    icon:
      persona === option.value ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <span className="h-4 w-4" aria-hidden="true" />
      ),
  }));

  const trigger = (
    <Ariakit.MenuButton
      aria-label={localize('com_ui_persona')}
      className={cn(
        'group relative inline-flex items-center justify-center gap-1.5',
        'rounded-full border border-border-medium text-sm font-medium',
        'size-9 max-w-fit p-2 transition-all md:w-full md:p-3',
        'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',
        persona != null && 'border-green-600/40 bg-green-500/10 hover:bg-green-700/10',
      )}
    >
      <span className="icon-md text-text-primary">
        <Drama className="icon-md" aria-hidden="true" />
      </span>
      <span className="hidden truncate md:block">
        {persona != null ? localize(personaLabelKeys[persona]) : localize('com_ui_persona')}
      </span>
    </Ariakit.MenuButton>
  );

  return (
    <DropdownPopup
      menuId="learnlight-persona-menu"
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      trigger={trigger}
      items={items}
      modal={true}
      unmountOnHide={true}
    />
  );
}
