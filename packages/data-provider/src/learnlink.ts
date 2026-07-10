export const assistanceLevels = ['discuss', 'hints', 'worked', 'full'] as const;

const COURSE_ID_PATTERN = /Canvas course ID:\s*(\d+)/i;

export function extractCanvasCourseId(promptPrefix?: string | null): number | null {
  if (!promptPrefix) {
    return null;
  }

  const match = COURSE_ID_PATTERN.exec(promptPrefix);
  if (!match) {
    return null;
  }

  const canvasCourseId = Number(match[1]);
  return Number.isFinite(canvasCourseId) ? canvasCourseId : null;
}

/**
 * Resolves the Canvas course a conversation belongs to, preferring the persisted
 * `canvasCourseId` field and falling back to the marker line in `promptPrefix`
 * (present on optimistic client-side conversation objects before the first save).
 */
export function getConversationCourseId(
  conversation?: { canvasCourseId?: number | null; promptPrefix?: string | null } | null,
): number | null {
  if (conversation == null) {
    return null;
  }
  return conversation.canvasCourseId ?? extractCanvasCourseId(conversation.promptPrefix);
}

export type AssistanceLevel = (typeof assistanceLevels)[number];

export const defaultAssistanceLevel: AssistanceLevel = 'full';

export const learnLinkPersonas = ['socratic', 'direct', 'storyteller', 'encourager'] as const;

export type LearnLinkPersona = (typeof learnLinkPersonas)[number];

export const LEARNLINK_LEVEL_LINE = 'LearnLink assistance level:';
export const LEARNLINK_PERSONA_LINE = 'LearnLink persona:';
export const LEARNLINK_POLICY_MARKER = '[LearnLink assistance policy';
export const LEARNLINK_TUTOR_MARKER = '[LearnLink tutor';
export const LEARNLINK_PERSONA_MARKER = '[LearnLink persona';
export const LEARNLINK_CARD_MARKER = '[LearnLink course context';

const LEVEL_LINE_PATTERN = /^LearnLink assistance level:\s*(discuss|hints|worked|full)\s*$/im;
const PERSONA_LINE_PATTERN = /^LearnLink persona:\s*(socratic|direct|storyteller|encourager)\s*$/im;

export function isAssistanceLevel(value?: string | null): value is AssistanceLevel {
  return assistanceLevels.includes(value as AssistanceLevel);
}

export function extractAssistanceLevel(promptPrefix?: string | null): AssistanceLevel | null {
  if (!promptPrefix) {
    return null;
  }

  const match = LEVEL_LINE_PATTERN.exec(promptPrefix);
  const level = match?.[1]?.toLowerCase();
  return isAssistanceLevel(level) ? level : null;
}

/**
 * Removes server-appended LearnLink blocks (assistance policy, course card) from a
 * promptPrefix, leaving only the client-authored base prefix. Blocks are always the
 * suffix of the prefix, so everything from the earliest marker onward is dropped.
 */
export function stripLearnLinkBlocks(promptPrefix: string): string {
  const indices = [
    promptPrefix.indexOf(LEARNLINK_POLICY_MARKER),
    promptPrefix.indexOf(LEARNLINK_TUTOR_MARKER),
    promptPrefix.indexOf(LEARNLINK_PERSONA_MARKER),
    promptPrefix.indexOf(LEARNLINK_CARD_MARKER),
  ].filter((index) => index !== -1);

  if (indices.length === 0) {
    return promptPrefix.trimEnd();
  }

  return promptPrefix.slice(0, Math.min(...indices)).trimEnd();
}

/**
 * Returns a new base prefix carrying the given assistance level as a marker line,
 * replacing any previous level line and dropping server-appended blocks (the server
 * rebuilds those every turn).
 */
export function setAssistanceLevelInPrefix(
  promptPrefix: string | null | undefined,
  level: AssistanceLevel,
): string {
  const base = stripLearnLinkBlocks(promptPrefix ?? '')
    .split('\n')
    .filter((line) => !line.startsWith(LEARNLINK_LEVEL_LINE))
    .join('\n')
    .trimEnd();

  const levelLine = `${LEARNLINK_LEVEL_LINE} ${level}`;
  return base ? `${base}\n${levelLine}` : levelLine;
}

export function isLearnLinkPersona(value?: string | null): value is LearnLinkPersona {
  return learnLinkPersonas.includes(value as LearnLinkPersona);
}

export function extractPersona(promptPrefix?: string | null): LearnLinkPersona | null {
  if (!promptPrefix) {
    return null;
  }

  const match = PERSONA_LINE_PATTERN.exec(promptPrefix);
  const persona = match?.[1]?.toLowerCase();
  return isLearnLinkPersona(persona) ? persona : null;
}

/**
 * Returns a new base prefix carrying the given persona as a marker line, replacing
 * any previous persona line; `null` clears the persona (default tutor voice).
 */
export function setPersonaInPrefix(
  promptPrefix: string | null | undefined,
  persona: LearnLinkPersona | null,
): string {
  const base = stripLearnLinkBlocks(promptPrefix ?? '')
    .split('\n')
    .filter((line) => !line.startsWith(LEARNLINK_PERSONA_LINE))
    .join('\n')
    .trimEnd();

  if (persona == null) {
    return base;
  }

  const personaLine = `${LEARNLINK_PERSONA_LINE} ${persona}`;
  return base ? `${base}\n${personaLine}` : personaLine;
}
