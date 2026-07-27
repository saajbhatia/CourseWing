import { Types } from 'mongoose';
import { createMemoryMethods } from './memory';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

function methodsFor(updatedDates: string[]) {
  const memories = updatedDates.map((updatedAt, index) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    key: `key-${index}`,
    value: `value-${index}`,
    tokenCount: 1,
    updated_at: new Date(updatedAt),
  }));
  const lean = jest.fn().mockResolvedValue(memories);
  const find = jest.fn(() => ({ lean }));
  const fakeMongoose = {
    models: {
      MemoryEntry: { find },
    },
  } as unknown as typeof import('mongoose');

  return createMemoryMethods(fakeMongoose);
}

describe('memory timestamp formatting', () => {
  it('caps dates at the trusted request-specific ceiling', async () => {
    const methods = methodsFor(['2026-06-01T12:00:00.000Z', '2026-08-05T12:00:00.000Z']);

    const result = await methods.getFormattedMemories({
      userId: 'user-1',
      displayDateCeiling: '2026-07-15T12:00:00.000Z',
    });

    expect(result.withKeys).toContain('[2026-06-01]');
    expect(result.withKeys).toContain('[2026-07-15]');
    expect(result.withoutKeys).not.toContain('[2026-08-05]');
  });

  it('does not use the old process-global CourseWing clock', async () => {
    const previous = process.env.COURSEWING_FAKE_NOW;
    process.env.COURSEWING_FAKE_NOW = '2000-01-01T00:00:00.000Z';
    try {
      const methods = methodsFor(['2026-08-05T12:00:00.000Z']);

      const result = await methods.getFormattedMemories({ userId: 'user-1' });

      expect(result.withoutKeys).toContain('[2026-08-05]');
    } finally {
      if (previous == null) {
        delete process.env.COURSEWING_FAKE_NOW;
      } else {
        process.env.COURSEWING_FAKE_NOW = previous;
      }
    }
  });
});
