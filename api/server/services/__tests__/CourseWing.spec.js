jest.mock('mongoose', () => ({
  models: {
    Conversation: { find: jest.fn(), bulkWrite: jest.fn() },
    PluginAuth: { deleteMany: jest.fn(), find: jest.fn() },
    CourseWingMutationLock: {
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    },
  },
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  runAsSystem: jest.fn(async (fn) => fn()),
}));
jest.mock('@librechat/api', () => {
  /** The real bounded-reader lives in packages/api; the barrel can't load here because this
   * spec mocks mongoose, so pull the three real symbols from the service module directly. */
  const { readBoundedJson, MAX_CANVAS_SERVICE_RESPONSE_BYTES, CanvasServiceResponseTooLargeError } =
    jest.requireActual('../../../../packages/api/src/coursewing/service');
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
  getOptionalUserPluginAuthValue: jest.fn(),
}));
jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  getMessage: jest.fn(),
}));

const mongoose = require('mongoose');
const { decrypt, getCanvasServiceUrl } = require('@librechat/api');
const {
  COURSEWING_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
  serviceFetch,
  backfillCourseChats,
  getCourseWingTenantId,
  acquireCourseWingMutationLease,
  getCourseWingTenantReferenceStatus,
  hasOtherCourseWingTenantReference,
  getCourseWingCanvasContext,
  getCourseWingFrozenNow,
  getCourseWingCanvasIdentity,
  clearCourseWingCanvasIdentityCache,
  selectLegacyCanvasTenantId,
  getOwnedChatSnapshot,
  purgeLegacyCanvasTokens,
} = require('../CourseWing');
const db = require('~/models');
const {
  getOptionalUserPluginAuthValue: getUserPluginAuthValue,
} = require('~/server/services/PluginService');

describe('CourseWing service response limits', () => {
  const originalFetch = global.fetch;
  const originalServiceKey = process.env.COURSEWING_SERVICE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COURSEWING_SERVICE_KEY = 'test-service-key';
    getCanvasServiceUrl.mockReturnValue('https://canvas-service.example.test');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalServiceKey == null) {
      delete process.env.COURSEWING_SERVICE_KEY;
    } else {
      process.env.COURSEWING_SERVICE_KEY = originalServiceKey;
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

    await expect(serviceFetch('/api/coursewing/courses/707')).rejects.toEqual(
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

    await expect(serviceFetch('/api/coursewing/courses/707')).rejects.toBeInstanceOf(
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

    await expect(serviceFetch('/api/coursewing/courses/707')).resolves.toEqual({
      ok: true,
      status: 200,
      body: { assignments: [], truncated: false },
    });
    const requestOptions = global.fetch.mock.calls[0][1];
    expect(requestOptions.headers['X-CourseWing-Service-Key']).toBe('test-service-key');
  });
});

describe('CourseWing credential migration', () => {
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

    await expect(getCourseWingTenantId('user-1')).resolves.toBe('0123456789abcdef');
    expect(getUserPluginAuthValue).toHaveBeenCalledWith(
      'user-1',
      CANVAS_TENANT_FIELD,
      COURSEWING_PLUGIN_KEY,
    );
    expect(getUserPluginAuthValue).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed stored tenant ids before they can reach a service path or header', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce('../admin/delete')
      .mockResolvedValueOnce('0123456789ABCDE');

    await expect(getCourseWingTenantId('user-1')).resolves.toBeNull();
  });

  it('can fall back from an invalid current mapping to an exact legacy mapping', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce('not-a-tenant')
      .mockResolvedValueOnce('fedcba9876543210');

    await expect(getCourseWingTenantId('user-1')).resolves.toBe('fedcba9876543210');
    expect(getUserPluginAuthValue).toHaveBeenNthCalledWith(
      2,
      'user-1',
      LEGACY_CANVAS_TENANT_FIELD,
      'learnlink',
    );
  });

  it('fails closed when an optional tenant mapping read encounters a storage error', async () => {
    getUserPluginAuthValue.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(getCourseWingTenantId('user-1')).rejects.toThrow('database unavailable');
  });

  it('acquires and releases a Mongo-backed mutation lease for one opaque binding', async () => {
    mongoose.models.CourseWingMutationLock.findOneAndUpdate.mockImplementation(
      (_filter, update) => ({
        lean: jest.fn().mockResolvedValue({
          owner: update.$set.owner,
          expiresAt: update.$set.expiresAt,
        }),
      }),
    );
    mongoose.models.CourseWingMutationLock.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const release = await acquireCourseWingMutationLease('a'.repeat(64));

    expect(mongoose.models.CourseWingMutationLock.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'a'.repeat(64),
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $lte: expect.any(Date) } }],
      },
      {
        $set: {
          owner: expect.stringMatching(/^[a-f\d]{32}$/),
          expiresAt: expect.any(Date),
        },
        $setOnInsert: { _id: 'a'.repeat(64) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await release();
    expect(mongoose.models.CourseWingMutationLock.deleteOne).toHaveBeenCalledWith({
      _id: 'a'.repeat(64),
      owner: expect.stringMatching(/^[a-f\d]{32}$/),
    });
  });

  it('renews a held mutation lease before it can expire', async () => {
    jest.useFakeTimers();
    try {
      mongoose.models.CourseWingMutationLock.findOneAndUpdate.mockImplementation(
        (_filter, update) => ({
          lean: jest.fn().mockResolvedValue({
            owner: update.$set.owner,
            expiresAt: update.$set.expiresAt,
          }),
        }),
      );
      mongoose.models.CourseWingMutationLock.updateOne.mockResolvedValue({ matchedCount: 1 });
      mongoose.models.CourseWingMutationLock.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const release = await acquireCourseWingMutationLease('b'.repeat(64));
      await jest.advanceTimersByTimeAsync(60_000);

      expect(mongoose.models.CourseWingMutationLock.updateOne).toHaveBeenCalledWith(
        {
          _id: 'b'.repeat(64),
          owner: expect.stringMatching(/^[a-f\d]{32}$/),
        },
        {
          $set: {
            expiresAt: expect.any(Date),
          },
        },
      );
      await release();
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails the operation when another owner has taken its mutation lease', async () => {
    jest.useFakeTimers();
    try {
      mongoose.models.CourseWingMutationLock.findOneAndUpdate.mockImplementation(
        (_filter, update) => ({
          lean: jest.fn().mockResolvedValue({
            owner: update.$set.owner,
            expiresAt: update.$set.expiresAt,
          }),
        }),
      );
      mongoose.models.CourseWingMutationLock.updateOne.mockResolvedValue({ matchedCount: 0 });
      mongoose.models.CourseWingMutationLock.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const release = await acquireCourseWingMutationLease('c'.repeat(64));
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(release()).rejects.toThrow('CourseWing mutation lease');
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails release when the owner-filtered lease deletion no longer matches', async () => {
    mongoose.models.CourseWingMutationLock.findOneAndUpdate.mockImplementation(
      (_filter, update) => ({
        lean: jest.fn().mockResolvedValue({
          owner: update.$set.owner,
          expiresAt: update.$set.expiresAt,
        }),
      }),
    );
    mongoose.models.CourseWingMutationLock.deleteOne.mockResolvedValue({ deletedCount: 0 });

    const release = await acquireCourseWingMutationLease('d'.repeat(64));

    await expect(release()).rejects.toThrow('CourseWing mutation lease');
  });

  it('fails release when the owner-filtered lease deletion cannot be confirmed', async () => {
    mongoose.models.CourseWingMutationLock.findOneAndUpdate.mockImplementation(
      (_filter, update) => ({
        lean: jest.fn().mockResolvedValue({
          owner: update.$set.owner,
          expiresAt: update.$set.expiresAt,
        }),
      }),
    );
    mongoose.models.CourseWingMutationLock.deleteOne.mockRejectedValue(
      new Error('database unavailable'),
    );

    const release = await acquireCourseWingMutationLease('e'.repeat(64));

    await expect(release()).rejects.toThrow('CourseWing mutation lease');
  });

  it('checks encrypted tenant mappings across app tenants while excluding the current user', async () => {
    mongoose.models.PluginAuth.find.mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue([
          { value: 'encrypted-other-tenant' },
          { value: 'encrypted-shared-tenant' },
        ]),
    });
    decrypt.mockResolvedValueOnce('1111111111111111').mockResolvedValueOnce('fedcba9876543210');

    await expect(hasOtherCourseWingTenantReference('fedcba9876543210', 'user-1')).resolves.toBe(
      true,
    );
    expect(mongoose.models.PluginAuth.find).toHaveBeenCalledWith(
      {
        authField: { $in: [CANVAS_TENANT_FIELD, LEGACY_CANVAS_TENANT_FIELD] },
        userId: { $ne: 'user-1' },
      },
      'value',
    );
  });

  it('preserves a service tenant when any candidate mapping cannot be decrypted', async () => {
    mongoose.models.PluginAuth.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ value: 'corrupt-mapping' }]),
    });
    decrypt.mockRejectedValueOnce(new Error('bad ciphertext'));

    await expect(getCourseWingTenantReferenceStatus('fedcba9876543210')).resolves.toBe(
      'indeterminate',
    );
    decrypt.mockRejectedValueOnce(new Error('bad ciphertext'));
    await expect(hasOtherCourseWingTenantReference('fedcba9876543210')).resolves.toBe(true);
  });

  it('prefers a confirmed reference over an earlier corrupt candidate mapping', async () => {
    mongoose.models.PluginAuth.find.mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue([{ value: 'corrupt-mapping' }, { value: 'confirmed-mapping' }]),
    });
    decrypt
      .mockRejectedValueOnce(new Error('bad ciphertext'))
      .mockResolvedValueOnce('fedcba9876543210');

    await expect(getCourseWingTenantReferenceStatus('fedcba9876543210')).resolves.toBe(
      'referenced',
    );
  });

  it('preserves a service tenant when a stored mapping decrypts to an invalid tenant id', async () => {
    mongoose.models.PluginAuth.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ value: 'malformed-mapping' }]),
    });
    decrypt.mockResolvedValueOnce('not-a-tenant-id');

    await expect(getCourseWingTenantReferenceStatus('fedcba9876543210')).resolves.toBe(
      'indeterminate',
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

describe('CourseWing effective Canvas identity', () => {
  const originalFetch = global.fetch;
  const originalServiceKey = process.env.COURSEWING_SERVICE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCourseWingCanvasIdentityCache();
    process.env.COURSEWING_SERVICE_KEY = 'identity-test-service-key';
    getCanvasServiceUrl.mockReturnValue('https://canvas-service.example.test');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalServiceKey == null) {
      delete process.env.COURSEWING_SERVICE_KEY;
    } else {
      process.env.COURSEWING_SERVICE_KEY = originalServiceKey;
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

    await expect(getCourseWingCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    await expect(getCourseWingCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://canvas-service.example.test/api/coursewing/tenant',
    );
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('X-Tenant-Id');
  });

  it('rejects common identity resolution while a durable disconnect is pending', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({ type: 'disconnect', tenantIds: ['0123456789abcdef'] }),
    );
    global.fetch = jest.fn();

    await expect(getCourseWingCanvasIdentity('user-1')).rejects.toMatchObject({
      code: 'COURSEWING_DISCONNECT_PENDING',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects common identity resolution while a typed malformed replacement is pending', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(
      JSON.stringify({
        type: 'replacement',
        tenantId: '0123456789abcdef',
        replacementTenantId: 'not-a-tenant-id',
      }),
    );
    global.fetch = jest.fn();

    await expect(getCourseWingCanvasIdentity('user-1')).rejects.toMatchObject({
      code: 'COURSEWING_DISCONNECT_PENDING',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an identity resolved while a durable disconnect begins', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fedcba9876543210')
      .mockResolvedValueOnce(
        JSON.stringify({ type: 'disconnect', tenantIds: ['fedcba9876543210'] }),
      );
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tenantId: 'fedcba9876543210',
          canvasAccountKey: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(getCourseWingCanvasIdentity('user-1')).rejects.toMatchObject({
      code: 'COURSEWING_DISCONNECT_PENDING',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a default identity resolved while the personal mapping is replaced', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fedcba9876543210')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('aaaaaaaaaaaaaaaa');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'old tenant deleted' }), {
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

    await expect(getCourseWingCanvasIdentity('user-1')).rejects.toMatchObject({
      code: 'COURSEWING_TENANT_CHANGED',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the default tenant frozen clock when the user has no personal mapping', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const body = String(url).endsWith('/api/coursewing/tenant')
        ? {
            tenantId: '1111111111111111',
            canvasAccountKey: 'dddddddddddddddddddddddd',
          }
        : {
            tenantId: '1111111111111111',
            frozenNow: '2026-07-15T12:00:00.000Z',
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(getCourseWingFrozenNow('user-with-default')).resolves.toEqual(
      new Date('2026-07-15T12:00:00.000Z'),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toBe(
      'https://canvas-service.example.test/api/coursewing/tenants/1111111111111111',
    );
  });

  it('returns the frozen clock with the exact identity snapshot that supplied it', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const body = String(url).endsWith('/api/coursewing/tenant')
        ? {
            tenantId: '8888888888888888',
            canvasAccountKey: 'efefefefefefefefefefefef',
          }
        : {
            tenantId: '8888888888888888',
            frozenNow: '2026-07-15T12:00:00.000Z',
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(getCourseWingCanvasContext('user-with-coherent-clock')).resolves.toEqual({
      identity: {
        tenantId: '8888888888888888',
        canvasAccountKey: 'efefefefefefefefefefefef',
      },
      frozenNow: new Date('2026-07-15T12:00:00.000Z'),
    });
  });

  it('does not mask or cache a failed frozen-clock lookup as the host clock', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: '2222222222222222',
            canvasAccountKey: 'eeeeeeeeeeeeeeeeeeeeeeee',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(getCourseWingFrozenNow('user-with-failed-clock')).rejects.toThrow(
      'Canvas frozen-clock lookup failed with 503',
    );
    await expect(getCourseWingFrozenNow('user-with-failed-clock')).rejects.toThrow(
      'Canvas frozen-clock lookup failed with 503',
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not cache a frozen clock resolved while a durable disconnect begins', async () => {
    const tenantId = '4444444444444444';
    let pendingReads = 0;
    getUserPluginAuthValue.mockImplementation(async (_userId, authField) => {
      if (authField === CANVAS_TENANT_FIELD) {
        return tenantId;
      }
      if (authField === CANVAS_PENDING_REVOCATION_FIELD) {
        pendingReads += 1;
        return pendingReads === 2
          ? JSON.stringify({ type: 'disconnect', tenantIds: [tenantId] })
          : null;
      }
      return null;
    });
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const body = String(url).endsWith('/api/coursewing/tenant')
        ? {
            tenantId,
            canvasAccountKey: 'abababababababababababab',
          }
        : { tenantId, frozenNow: '2026-07-15T12:00:00.000Z' };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(getCourseWingFrozenNow('user-racing-disconnect')).rejects.toMatchObject({
      code: 'COURSEWING_DISCONNECT_PENDING',
    });

    getUserPluginAuthValue.mockImplementation(async (_userId, authField) =>
      authField === CANVAS_TENANT_FIELD ? tenantId : null,
    );
    await expect(getCourseWingFrozenNow('user-racing-disconnect')).resolves.toEqual(
      new Date('2026-07-15T12:00:00.000Z'),
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects a default frozen clock resolved while the personal mapping is replaced', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('5555555555555555')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('6666666666666666');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'old tenant deleted' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: '7777777777777777',
            canvasAccountKey: 'cdcdcdcdcdcdcdcdcdcdcdcd',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: '7777777777777777',
            frozenNow: '2026-07-15T12:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(getCourseWingFrozenNow('user-replacing-account')).rejects.toMatchObject({
      code: 'COURSEWING_TENANT_CHANGED',
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('allows an ordinary chat when no personal or default Canvas tenant exists', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'no default tenant' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getCourseWingFrozenNow('user-without-canvas')).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a persisted tenant and its default fallback are both gone', async () => {
    getUserPluginAuthValue.mockResolvedValue('fedcba9876543210');
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unknown tenant' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getCourseWingFrozenNow('user-with-missing-mapping')).rejects.toThrow(
      'Canvas tenant status failed with 404',
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers['X-Tenant-Id']).toBe('fedcba9876543210');
    expect(global.fetch.mock.calls[1][1].headers).not.toHaveProperty('X-Tenant-Id');
  });

  it('rejects malformed frozen-clock metadata', async () => {
    getUserPluginAuthValue.mockResolvedValue(null);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: '3333333333333333',
            canvasAccountKey: 'ffffffffffffffffffffffff',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ frozenNow: 'not-a-date' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(getCourseWingFrozenNow('user-with-bad-clock')).rejects.toThrow(
      'Canvas service returned an invalid frozen clock',
    );
  });

  it('falls back to the default only when a stored personal tenant is gone', async () => {
    getUserPluginAuthValue
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fedcba9876543210')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fedcba9876543210');
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

    await expect(getCourseWingCanvasIdentity('user-1')).resolves.toEqual({
      tenantId: '0123456789abcdef',
      canvasAccountKey: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers['X-Tenant-Id']).toBe('fedcba9876543210');
    expect(global.fetch.mock.calls[1][1].headers).not.toHaveProperty('X-Tenant-Id');
  });

  it('does not silently switch accounts on a Canvas service failure', async () => {
    getUserPluginAuthValue.mockResolvedValueOnce(null).mockResolvedValueOnce('fedcba9876543210');
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getCourseWingCanvasIdentity('user-1')).rejects.toThrow(
      'Canvas tenant status failed with 503',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
