import {
  extractAssistanceLevel,
  stripLearnLightBlocks,
  LEARNLIGHT_LEVEL_LINE,
  LEARNLIGHT_POLICY_MARKER,
  LEARNLIGHT_CARD_MARKER,
} from '../src/learnlight';

const basePrefix = [
  'Current Canvas course: Chemistry',
  'Canvas course ID: 12345',
  'The student is chatting within this course.',
].join('\n');

const withBlocks = [
  basePrefix,
  `${LEARNLIGHT_LEVEL_LINE} hints`,
  '',
  `${LEARNLIGHT_POLICY_MARKER} — set for this conversation]`,
  'ASSISTANCE LEVEL: Hints.',
  '',
  `${LEARNLIGHT_CARD_MARKER} — synced from Canvas]`,
  'Course: Chemistry',
].join('\n');

describe('extractAssistanceLevel', () => {
  it('returns null for empty or unmarked prefixes', () => {
    expect(extractAssistanceLevel(undefined)).toBeNull();
    expect(extractAssistanceLevel(null)).toBeNull();
    expect(extractAssistanceLevel(basePrefix)).toBeNull();
  });

  it('extracts the level from a marker line anywhere in the prefix', () => {
    expect(extractAssistanceLevel(`${basePrefix}\n${LEARNLIGHT_LEVEL_LINE} worked`)).toBe('worked');
    expect(extractAssistanceLevel(withBlocks)).toBe('hints');
  });

  it('ignores unknown levels', () => {
    expect(extractAssistanceLevel(`${LEARNLIGHT_LEVEL_LINE} everything`)).toBeNull();
  });
});

describe('stripLearnLightBlocks', () => {
  it('returns the prefix unchanged when no blocks are present', () => {
    expect(stripLearnLightBlocks(basePrefix)).toBe(basePrefix);
  });

  it('drops everything from the earliest server-appended marker', () => {
    expect(stripLearnLightBlocks(withBlocks)).toBe(`${basePrefix}\n${LEARNLIGHT_LEVEL_LINE} hints`);
  });

  it('handles a card without a policy block', () => {
    const prefix = `${basePrefix}\n\n${LEARNLIGHT_CARD_MARKER} — synced]\nCourse: Chemistry`;
    expect(stripLearnLightBlocks(prefix)).toBe(basePrefix);
  });
});

describe('legacy LearnLink compatibility', () => {
  const legacyPrefix = [
    basePrefix,
    'LearnLink assistance level: hints',
    '',
    '[LearnLink tutor — set for this conversation]',
    'Tutor block text.',
    '',
    '[LearnLink course context — synced from Canvas]',
    'Course: Chemistry',
  ].join('\n');

  it('still extracts the level from a pre-rename marker line', () => {
    expect(extractAssistanceLevel(legacyPrefix)).toBe('hints');
  });

  it('still strips pre-rename server-appended blocks', () => {
    expect(stripLearnLightBlocks(legacyPrefix)).toBe(
      `${basePrefix}\nLearnLink assistance level: hints`,
    );
  });
});
