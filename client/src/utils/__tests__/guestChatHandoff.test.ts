/** @jest-environment @happy-dom/jest-environment */
import { EModelEndpoint } from 'librechat-data-provider';
import {
  GUEST_CHAT_HANDOFF_KEY,
  consumeGuestChatHandoff,
  storeGuestChatHandoff,
} from '../guestChatHandoff';

describe('guest chat handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('privately preserves the prompt and selected model identity', () => {
    const stored = storeGuestChatHandoff('Help me understand limits', {
      conversationId: 'new',
      endpoint: EModelEndpoint.bedrock,
      title: 'New chat',
      createdAt: '',
      updatedAt: '',
      model: 'us.anthropic.claude-sonnet-4-6',
      temperature: 0.9,
      promptPrefix: 'must not be copied',
    });

    expect(stored).toBe(true);
    expect(window.location.search).toBe('');
    expect(consumeGuestChatHandoff()).toEqual({
      prompt: 'Help me understand limits',
      settings: {
        endpoint: EModelEndpoint.bedrock,
        model: 'us.anthropic.claude-sonnet-4-6',
      },
    });
    expect(sessionStorage.getItem(GUEST_CHAT_HANDOFF_KEY)).toBeNull();
  });

  it('is one-time and rejects stale or malformed values', () => {
    storeGuestChatHandoff('One time only', null);
    expect(consumeGuestChatHandoff()).toEqual({ prompt: 'One time only', settings: {} });
    expect(consumeGuestChatHandoff()).toBeNull();

    sessionStorage.setItem(
      GUEST_CHAT_HANDOFF_KEY,
      JSON.stringify({ version: 1, createdAt: 0, prompt: 'stale', settings: {} }),
    );
    expect(consumeGuestChatHandoff(2 * 60 * 60 * 1000)).toBeNull();
    expect(sessionStorage.getItem(GUEST_CHAT_HANDOFF_KEY)).toBeNull();
  });

  it('clears an older draft when a replacement cannot be stored', () => {
    const originalStorage = window.sessionStorage;
    const values = new Map<string, string>([
      [
        GUEST_CHAT_HANDOFF_KEY,
        JSON.stringify({ version: 1, createdAt: Date.now(), prompt: 'stale draft', settings: {} }),
      ],
    ]);
    const blockedStorage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    };
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: blockedStorage,
    });

    try {
      expect(storeGuestChatHandoff('new private draft', null)).toBe(false);
      expect(blockedStorage.getItem(GUEST_CHAT_HANDOFF_KEY)).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it('privately carries verified course context through login', () => {
    const promptPrefix =
      'Canvas course ID: 11464\nCurrent Canvas course: Calculus\nThe student is chatting within this course.';

    expect(
      storeGuestChatHandoff('Help me review this class', {
        conversationId: 'new',
        endpoint: EModelEndpoint.bedrock,
        title: 'New chat',
        createdAt: '',
        updatedAt: '',
        model: 'us.anthropic.claude-sonnet-4-6',
        promptPrefix,
      }),
    ).toBe(true);

    expect(consumeGuestChatHandoff()).toEqual({
      prompt: 'Help me review this class',
      settings: {
        endpoint: EModelEndpoint.bedrock,
        model: 'us.anthropic.claude-sonnet-4-6',
        promptPrefix,
      },
    });
  });
});
