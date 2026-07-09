import {
  extractAssistanceLevel,
  stripLearnLinkBlocks,
  setAssistanceLevelInPrefix,
  LEARNLINK_LEVEL_LINE,
  LEARNLINK_POLICY_MARKER,
  LEARNLINK_CARD_MARKER,
} from '../src/learnlink';

const basePrefix = [
  'Current Canvas course: Chemistry',
  'Canvas course ID: 12345',
  'The student is chatting within this course.',
].join('\n');

const withBlocks = [
  basePrefix,
  `${LEARNLINK_LEVEL_LINE} hints`,
  '',
  `${LEARNLINK_POLICY_MARKER} — set for this conversation]`,
  'ASSISTANCE LEVEL: Hints.',
  '',
  `${LEARNLINK_CARD_MARKER} — synced from Canvas]`,
  'Course: Chemistry',
].join('\n');

describe('extractAssistanceLevel', () => {
  it('returns null for empty or unmarked prefixes', () => {
    expect(extractAssistanceLevel(undefined)).toBeNull();
    expect(extractAssistanceLevel(null)).toBeNull();
    expect(extractAssistanceLevel(basePrefix)).toBeNull();
  });

  it('extracts the level from a marker line anywhere in the prefix', () => {
    expect(extractAssistanceLevel(`${basePrefix}\n${LEARNLINK_LEVEL_LINE} worked`)).toBe('worked');
    expect(extractAssistanceLevel(withBlocks)).toBe('hints');
  });

  it('ignores unknown levels', () => {
    expect(extractAssistanceLevel(`${LEARNLINK_LEVEL_LINE} everything`)).toBeNull();
  });
});

describe('stripLearnLinkBlocks', () => {
  it('returns the prefix unchanged when no blocks are present', () => {
    expect(stripLearnLinkBlocks(basePrefix)).toBe(basePrefix);
  });

  it('drops everything from the earliest server-appended marker', () => {
    expect(stripLearnLinkBlocks(withBlocks)).toBe(`${basePrefix}\n${LEARNLINK_LEVEL_LINE} hints`);
  });

  it('handles a card without a policy block', () => {
    const prefix = `${basePrefix}\n\n${LEARNLINK_CARD_MARKER} — synced]\nCourse: Chemistry`;
    expect(stripLearnLinkBlocks(prefix)).toBe(basePrefix);
  });
});

describe('setAssistanceLevelInPrefix', () => {
  it('appends a level line to a bare prefix', () => {
    expect(setAssistanceLevelInPrefix(basePrefix, 'discuss')).toBe(
      `${basePrefix}\n${LEARNLINK_LEVEL_LINE} discuss`,
    );
  });

  it('creates just the level line when there is no prefix', () => {
    expect(setAssistanceLevelInPrefix(null, 'full')).toBe(`${LEARNLINK_LEVEL_LINE} full`);
    expect(setAssistanceLevelInPrefix('', 'hints')).toBe(`${LEARNLINK_LEVEL_LINE} hints`);
  });

  it('replaces an existing level line and strips server-appended blocks', () => {
    const result = setAssistanceLevelInPrefix(withBlocks, 'worked');
    expect(result).toBe(`${basePrefix}\n${LEARNLINK_LEVEL_LINE} worked`);
    expect(extractAssistanceLevel(result)).toBe('worked');
  });

  it('round-trips with extractAssistanceLevel', () => {
    const result = setAssistanceLevelInPrefix(basePrefix, 'discuss');
    expect(extractAssistanceLevel(result)).toBe('discuss');
    expect(extractAssistanceLevel(setAssistanceLevelInPrefix(result, 'full'))).toBe('full');
  });
});
