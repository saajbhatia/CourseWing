export const assistanceLevels = ['discuss', 'hints', 'worked', 'full'] as const;

export type AssistanceLevel = (typeof assistanceLevels)[number];

export const defaultAssistanceLevel: AssistanceLevel = 'full';

export const LEARNLINK_LEVEL_LINE = 'LearnLink assistance level:';
export const LEARNLINK_POLICY_MARKER = '[LearnLink assistance policy';
export const LEARNLINK_CARD_MARKER = '[LearnLink course context';

const LEVEL_LINE_PATTERN = /^LearnLink assistance level:\s*(discuss|hints|worked|full)\s*$/im;

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
