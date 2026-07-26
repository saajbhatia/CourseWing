import {
  extractAssistanceLevel,
  stripCourseWingBlocks,
  COURSEWING_LEVEL_LINE,
  COURSEWING_POLICY_MARKER,
  COURSEWING_CARD_MARKER,
} from '../src/coursewing';

const basePrefix = [
  'Current Canvas course: Chemistry',
  'Canvas course ID: 12345',
  'The student is chatting within this course.',
].join('\n');

const withBlocks = [
  basePrefix,
  `${COURSEWING_LEVEL_LINE} hints`,
  '',
  `${COURSEWING_POLICY_MARKER} — set for this conversation]`,
  'ASSISTANCE LEVEL: Hints.',
  '',
  `${COURSEWING_CARD_MARKER} — synced from Canvas]`,
  'Course: Chemistry',
].join('\n');

describe('extractAssistanceLevel', () => {
  it('returns null for empty or unmarked prefixes', () => {
    expect(extractAssistanceLevel(undefined)).toBeNull();
    expect(extractAssistanceLevel(null)).toBeNull();
    expect(extractAssistanceLevel(basePrefix)).toBeNull();
  });

  it('extracts the level from a marker line anywhere in the prefix', () => {
    expect(extractAssistanceLevel(`${basePrefix}\n${COURSEWING_LEVEL_LINE} worked`)).toBe('worked');
    expect(extractAssistanceLevel(withBlocks)).toBe('hints');
  });

  it('ignores unknown levels', () => {
    expect(extractAssistanceLevel(`${COURSEWING_LEVEL_LINE} everything`)).toBeNull();
  });
});

describe('stripCourseWingBlocks', () => {
  it('returns the prefix unchanged when no blocks are present', () => {
    expect(stripCourseWingBlocks(basePrefix)).toBe(basePrefix);
  });

  it('drops everything from the earliest server-appended marker', () => {
    expect(stripCourseWingBlocks(withBlocks)).toBe(`${basePrefix}\n${COURSEWING_LEVEL_LINE} hints`);
  });

  it('handles a card without a policy block', () => {
    const prefix = `${basePrefix}\n\n${COURSEWING_CARD_MARKER} — synced]\nCourse: Chemistry`;
    expect(stripCourseWingBlocks(prefix)).toBe(basePrefix);
  });
});

describe('legacy CourseWing compatibility', () => {
  const legacyPrefix = [
    basePrefix,
    'CourseWing assistance level: hints',
    '',
    '[CourseWing tutor — set for this conversation]',
    'Tutor block text.',
    '',
    '[CourseWing course context — synced from Canvas]',
    'Course: Chemistry',
  ].join('\n');

  it('still extracts the level from a pre-rename marker line', () => {
    expect(extractAssistanceLevel(legacyPrefix)).toBe('hints');
  });

  it('still strips pre-rename server-appended blocks', () => {
    expect(stripCourseWingBlocks(legacyPrefix)).toBe(
      `${basePrefix}\nCourseWing assistance level: hints`,
    );
  });
});
