export const assistanceLevels = ['discuss', 'hints', 'worked', 'full'] as const;

const COURSE_ID_PATTERN = /^Canvas course ID:\s*(\d+)\s*$/im;
const ASSIGNMENT_ID_PATTERN = /^Canvas assignment ID:\s*(\d+)\s*$/im;

function extractMarkedId(pattern: RegExp, promptPrefix?: string | null): number | null {
  if (!promptPrefix) {
    return null;
  }

  const matches = Array.from(
    promptPrefix.matchAll(new RegExp(pattern.source, `${pattern.flags}g`)),
  );
  if (matches.length !== 1) {
    return null;
  }

  const id = Number(matches[0][1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function extractCanvasCourseId(promptPrefix?: string | null): number | null {
  return extractMarkedId(COURSE_ID_PATTERN, promptPrefix);
}

/** Set by assignment-launched chats so the server can inject that assignment's context card. */
export function extractCanvasAssignmentId(promptPrefix?: string | null): number | null {
  return extractMarkedId(ASSIGNMENT_ID_PATTERN, promptPrefix);
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

export const courseWingPersonas = ['socratic', 'direct', 'storyteller', 'encourager'] as const;

export type CourseWingPersona = (typeof courseWingPersonas)[number];

export const COURSEWING_LEVEL_LINE = 'CourseWing assistance level:';
export const COURSEWING_PERSONA_LINE = 'CourseWing persona:';
export const COURSEWING_POLICY_MARKER = '[CourseWing assistance policy';
export const COURSEWING_TUTOR_MARKER = '[CourseWing tutor';
export const COURSEWING_PERSONA_MARKER = '[CourseWing persona';
export const COURSEWING_CARD_MARKER = '[CourseWing course context';
export const COURSEWING_ASSIGNMENT_MARKER = '[CourseWing assignment context';

/** Pre-rename ("LearnLight"/"LearnLink") lines still stored in existing conversations' prompt prefixes. */
const LEGACY_PERSONA_LINES = ['LearnLight persona:', 'LearnLink persona:'];
const LEVEL_LINE_PATTERN =
  /^(?:CourseWing|LearnLi(?:ght|nk)) assistance level:\s*(discuss|hints|worked|full)\s*$/im;
const PERSONA_LINE_PATTERN =
  /^(?:CourseWing|LearnLi(?:ght|nk)) persona:\s*(socratic|direct|storyteller|encourager)\s*$/im;

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
 * Removes server-appended CourseWing blocks (assistance policy, course card) from a
 * promptPrefix, leaving only the client-authored base prefix. Blocks are always the
 * suffix of the prefix, so everything from the earliest marker onward is dropped.
 */
export function stripCourseWingBlocks(promptPrefix: string): string {
  const marker =
    /^\[(?:CourseWing|LearnLi(?:ght|nk)) (?:assistance policy|tutor|persona|course context|assignment context)(?:\b|\])/im.exec(
      promptPrefix,
    );
  if (!marker || marker.index == null) {
    return promptPrefix.trimEnd();
  }

  return promptPrefix.slice(0, marker.index).trimEnd();
}

export function isCourseWingPersona(value?: string | null): value is CourseWingPersona {
  return courseWingPersonas.includes(value as CourseWingPersona);
}

export function extractPersona(promptPrefix?: string | null): CourseWingPersona | null {
  if (!promptPrefix) {
    return null;
  }

  const match = PERSONA_LINE_PATTERN.exec(promptPrefix);
  const persona = match?.[1]?.toLowerCase();
  return isCourseWingPersona(persona) ? persona : null;
}

/**
 * Returns a new base prefix carrying the given persona as a marker line, replacing
 * any previous persona line; `null` clears the persona (default tutor voice).
 */
export function setPersonaInPrefix(
  promptPrefix: string | null | undefined,
  persona: CourseWingPersona | null,
): string {
  const base = stripCourseWingBlocks(promptPrefix ?? '')
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith(COURSEWING_PERSONA_LINE) &&
        !LEGACY_PERSONA_LINES.some((legacyLine) => line.startsWith(legacyLine)),
    )
    .join('\n')
    .trimEnd();

  if (persona == null) {
    return base;
  }

  const personaLine = `${COURSEWING_PERSONA_LINE} ${persona}`;
  return base ? `${base}\n${personaLine}` : personaLine;
}
