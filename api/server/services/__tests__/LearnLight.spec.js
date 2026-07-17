jest.mock('mongoose', () => ({
  models: {
    Conversation: { find: jest.fn(), bulkWrite: jest.fn() },
    PluginAuth: { deleteMany: jest.fn(), find: jest.fn() },
  },
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('@librechat/api', () => {
  /** The real bounded-reader lives in packages/api; the barrel can't load here because this
   * spec mocks mongoose, so pull the three real symbols from the service module directly. */
  const { readBoundedJson, MAX_CANVAS_SERVICE_RESPONSE_BYTES, CanvasServiceResponseTooLargeError } =
    jest.requireActual('../../../../packages/api/src/learnlight/service');
  return {
    decrypt: jest.fn(),
    getCanvasServiceUrl: jest.fn(),
    readBoundedJson,
    MAX_CANVAS_SERVICE_RESPONSE_BYTES,
    CanvasServiceResponseTooLargeError,
  };
});
jest.mock('librechat-data-provider', () => ({
  Constants: { NO_PARENT: 'root' },
  extractCanvasCourseId: jest.fn(),
}));
jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));
jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  getMessage: jest.fn(),
}));

const mongoose = require('mongoose');
const { decrypt, getCanvasServiceUrl } = require('@librechat/api');
const {
  LEARNLIGHT_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
  serviceFetch,
  backfillCourseChats,
  getLearnLightTenantId,
  getLearnLightCanvasIdentity,
  clearLearnLightCanvasIdentityCache,
  selectLegacyCanvasTenantId,
  getOwnedChatSnapshot,
  purgeLegacyCanvasTokens,
} = require('../LearnLight');
const db = require('~/models');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

describe('LearnLight service response limits', () => {
  const originalFetch = global.fetch;
  const originalServiceKey = process.env.LEARNLIGHT_SERVICE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LEARNLIGHT_SERVICE_KEY = 'test-service-key';
    getCanvasServiceUrl.mockReturnValue('https://canvas-service.example.test');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalServiceKey == null) {
      delete process.env.LEARNLIGHT_SERVICE_KEY;
    } else {
      process.env.LEARNLIGHT_SERVICE_KEY = originalServiceKey;
    }
  });

  it('rejects an oversized declared Content-Length before parsing JSON', async () => {
    let cancelled = false;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(MAX_CANVAS_SERVICE_RESPONSE_BYTES + 1),
          },
        },
      ),
    );

    await expect(serviceFetch('/api/learnlight/courses/707')).rejects.toEqual(
      expect.objectContaining({
        name: CanvasServiceResponseTooLargeError.name,
        code: 'CANVAS_SERVICE_RESPONSE_TOO_LARGE',
        message: expect.stringContaining(
          `exceeds the ${MAX_CANVAS_SERVICE_RESPONSE_BYTES}-byte safety limit`,
        ),
      }),
    );
    expect(cancelled).toBe(true);
  });

  it('cancels an oversized chunked response while it is still streaming', async () => {
    let chunksEmitted = 0;
    let cancelled = false;
    const chunkBytes = 512 * 1024;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            chunksEmitted += 1;
            controller.enqueue(new Uint8Array(chunkBytes));
            if (chunksEmitted >= 20) {
              controller.close();
            }
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(serviceFetch('/api/learnlight/courses/707')).rejects.toBeInstanceOf(
      CanvasServiceResponseTooLargeError,
    );
    expect(cancelled).toBe(true);
    expect(chunksEmitted).toBeLessThan(20);
  });

  it('parses a normal bounded JSON response and sends the internal service key', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ assignments: [], truncated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(serviceFetch('/api/learnlight/courses/707')).resolves.toEqual({
      ok: true,
      status: 200,
      body: { assignments: [], truncated: false },
    });
    const requestOptions = global.fetch.mock.calls[0][1];
    expect(requestOptions.headers['X-LearnLight-Service-Key']).toBe('test-service-key');
  });
});

describe('LearnLight credential migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.models.PluginAuth.deleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  it('purges old Canvas bearer copies while retaining tenant mappings', async () => {
    await purgeLegacyCanvasTokens();

    expect(mongoose.models.PluginAuth.deleteMany).toHaveBeenCalledWith({
      authField: { $in: [CANVAS_TOKEN_FIELD, LEGACY_CANVAS_TOKEN_FIELD] },
    });
  });

  it('accepts only an exact lowercase 16-hex stored tenant id', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce('0123456789abcdef');

    await expect(getLearnLightTenantId('user-1')).resolves.toBe('0123456789abcdef');
    expect(getUserPluginAuthValue).toHaveBeenCalledWith(
      'user-1',
      CANVAS_TENANT_FIELD,
      false,
      LEARNLIGHT_PLUGIN_KEY,
    );
    expect(getUserPluginAuthValue).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed stored tenant ids before they can reach a service path or header', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce('../admin/delete')
      .mockResolvedValueOnce('0123456789ABCDE');

    await expect(getLearnLightTenantId('user-1')).resolves.toBeNull();
  });

  it('can fall back from an invalid current mapping to an exact legacy mapping', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce('not-a-tenant')
      .mockResolvedValueOnce('fedcba9876543210');

    await expect(getLearnLightTenantId('user-1')).resolves.toBe('fedcba9876543210');
    expect(getUserPluginAuthValue).toHaveBeenNthCalledWith(
      2,
      'user-1',
      LEGACY_CANVAS_TENANT_FIELD,
      false,
      'learnlink',
    );
  });

  it('binds legacy chats to the Canvas account provably active at creation time', () => {
    const mapping = {
      authField: CANVAS_TENANT_FIELD,
      value: 'fedcba9876543210',
      createdAt: new Date('2026-07-10T12:00:00Z'),
      updatedAt: new Date('2026-07-10T12:00:00Z'),
    };

    expect(selectLegacyCanvasTenantId([], new Date('2026-07-11T00:00:00Z'))).toBeNull();
    expect(selectLegacyCanvasTenantId([mapping], new Date('2026-07-09T00:00:00Z'))).toBeNull();
    expect(selectLegacyCanvasTenantId([mapping], new Date('2026-07-11T00:00:00Z'))).toBe(
      'fedcba9876543210',
    );
  });

  it('leaves the pre-update interval unbound when a mapping was replaced in place', () => {
    const replacedMapping = {
      authField: CANVAS_TENANT_FIELD,
      value: 'fedcba9876543210',
      createdAt: new Date('2026-07-10T12:00:00Z'),
      updatedAt: new Date('2026-07-12T12:00:00Z'),
    };

    expect(
      selectLegacyCanvasTenantId([replacedMapping], new Date('2026-07-11T00:00:00Z')),
    ).toBeUndefined();
    expect(selectLegacyCanvasTenantId([replacedMapping], new Date('2026-07-13T00:00:00Z'))).toBe(
      'fedcba9876543210',
    );
  });

  it('snapshots only an owned conversation and orders visible text chronologically', async () => {
    db.getConvo.mockResolvedValue({ title: 'Course chat' });
    const messages = {
      'assistant-visible': {
        messageId: 'assistant-visible',
        conversationId: 'conversation-1',
        parentMessageId: 'user-visible',
        sender: 'Tutor',
        text: 'Newest answer',
        isCreatedByUser: false,
        createdAt: new Date('2026-07-15T12:01:00Z'),
      },
      'user-visible': {
        messageId: 'user-visible',
        conversationId: 'conversation-1',
        parentMessageId: 'root',
        sender: 'Student',
        text: 'Earlier question',
        isCreatedByUser: true,
        createdAt: new Date('2026-07-15T12:00:00Z'),
      },
      'assistant-hidden-sibling': {
        messageId: 'assistant-hidden-sibling',
        conversationId: 'conversation-1',
        parentMessageId: 'user-visible',
        text: 'Regenerated answer that was not selected',
        isCreatedByUser: false,
      },
    };
    db.getMessage.mockImplementation(async ({ messageId }) => messages[messageId] ?? null);

    const snapshot = await getOwnedChatSnapshot('user-1', 'conversation-1', 'assistant-visible');

    expect(db.getConvo).toHaveBeenCalledWith('user-1', 'conversation-1');
    expect(db.getMessage.mock.calls.map(([query]) => query.messageId)).toEqual([
      'assistant-visible',
      'user-visible',
    ]);
    expect(snapshot).toMatchObject({
      version: 1,
      conversationId: 'conversation-1',
      targetMessageId: 'assistant-visible',
      title: 'Course chat',
      truncated: false,
      messages: [
        { role: 'user', text: 'Earlier question' },
        { role: 'assistant', text: 'Newest answer' },
      ],
    });
    expect(snapshot.messages.map((message) => message.text)).not.toContain(
      'Regenerated answer that was not selected',
    );
  });

  it('caps the serialized snapshot by UTF-8 bytes for multibyte transcripts', async () => {
    db.getConvo.mockResolvedValue({ title: '多'.repeat(10_000) });
    db.getMessage.mockImplementation(async ({ messageId }) => {
      const index = Number(messageId.replace('message-', ''));
      if (!Number.isInteger(index) || index < 0) {
        return null;
      }
      return {
        messageId,
        conversationId: 'conversation-1',
        parentMessageId: index === 0 ? 'root' : `message-${index - 1}`,
        sender: '学生'.repeat(1_000),
        text: '🙂漢'.repeat(30_000),
        isCreatedByUser: index % 2 === 0,
      };
    });

    const snapshot = await getOwnedChatSnapshot('user-1', 'conversation-1', 'message-20');

    expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(800_000);
    expect(snapshot.truncated).toBe(true);
  });

  it('refuses to snapshot a conversation the user does not own', async () => {
    db.getConvo.mockResolvedValue(null);

    await expect(
      getOwnedChatSnapshot('user-1', 'conversation-2', 'target-message'),
    ).resolves.toBeNull();
    expect(db.getMessage).not.toHaveBeenCalled();
  });
});

describe('LearnLight effective Canvas identity', () => {
  const originalFetch = global.fetch;
  const originalServiceKey = process.env.LEARNLIGHT_SERVICE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    clearLearnLightCanvasIdentityCache();
    process.env.LEARNLIGHT_SERVICE_KEY = 'identity-test-service-key';
    getCanvasServiceUrl.mockReturnValue('https://canvas-service.example.test');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalServiceKey == null) {
      delete process.env.LEARNLIGHT_SERVICE_KEY;
    } else {
      process.env.LEARNLIGHT_SERVICE_KEY = originalServiceKey;
    }
  });

  it('decrypts mapping history and backfills default and personal legacy chats separately', async () => {
    const emptyCursor = {
      async *[Symbol.asyncIterator]() {},
    };
    mongoose.models.Conversation.find.mockImplementation((filter) => {
      if (filter.canvasCourseId?.$exists === false) {
        return { lean: () => ({ cursor: () => emptyCursor }) };
      }
      return {
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'default-chat',
            user: 'user-1',
            createdAt: new Date('2026-07-09T00:00:00Z'),
          },
          {
            _id: 'personal-chat',
            user: 'user-1',
            createdAt: new Date('2026-07-11T00:00:00Z'),
          },
        ]),
      };
    });
    mongoose.models.Conversation.bulkWrite.mockResolvedValue({ modifiedCount: 2 });
    mongoose.models.PluginAuth.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          authField: CANVAS_TENANT_FIELD,
          value: 'encrypted-personal-tenant',
          createdAt: new Date('2026-07-10T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z'),
        },
      ]),
    });
    decrypt.mockResolvedValue('fedcba9876543210');
    global.fetch = jest.fn().mockImplementation(async (_url, options) => {
      const personal = options.headers['X-Tenant-Id'] === 'fedcba9876543210';
      return new Response(
        JSON.stringify({
          tenantId: personal ? 'fedcba9876543210' : '0123456789abcdef',
          canvasAccountKey: personal ? 'bbbbbbbbbbbbbbbbbbbbbbbb' : 'aaaaaaaaaaaaaaaaaaaaaaaa',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await backfillCourseChats();

    expect(decrypt).toHaveBeenCalledWith('encrypted-personal-tenant');
    expect(mongoose.models.Conversation.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: 'default-chat', canvasAccountKey: { $exists: false } },
          update: { $set: { canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa' } },
        },
      },
      {
        updateOne: {
          filter: { _id: 'personal-chat', canvasAccountKey: { $exists: false } },
          update: { $set: { canvasAccountKey: 'bbbbbbbbbbbbbbbbbbbbbbbb' } },
        },
      },
    ]);
  });

  it('resolves and caches the server-owned default identity when the user has no mapping', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tenantId: '0123456789abcdef',
          canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(getLearnLightCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    await expect(getLearnLightCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://canvas-service.example.test/api/learnlight/tenant',
    );
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('X-Tenant-Id');
  });

  it('falls back to the default only when a stored personal tenant is gone', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce('fedcba9876543210');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'unknown tenant' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: '0123456789abcdef',
            canvasAccountKey: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(getLearnLightCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers['X-Tenant-Id']).toBe('fedcba9876543210');
    expect(global.fetch.mock.calls[1][1].headers).not.toHaveProperty('X-Tenant-Id');
  });

  it('does not silently switch accounts on a Canvas service failure', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce('fedcba9876543210');
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getLearnLightCanvasIdentity('user-1')).rejects.toThrow(
      'Canvas tenant status failed with 503',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
