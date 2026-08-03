const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, tenantStorage, runAsSystem } = require('@librechat/data-schemas');

jest.mock('~/server/services/CourseWing', () => ({
  serviceFetch: jest.fn(),
  getCourseWingCanvasIdentity: jest.fn(),
}));

createModels(mongoose);

const { serviceFetch, getCourseWingCanvasIdentity } = require('~/server/services/CourseWing');
const {
  CourseWingReceipt,
  CourseWingCourseSetting,
  CourseWingActivity,
  CourseWingTeacherRole,
  ensureTeacherStorageIndexes,
  getCanvasCourseScope,
  getCourseSetting,
  getCourseAssistance,
  getVisibleCourseActivity,
  getConversationMessages,
  resolveConversationHelpLevel,
  refreshReceipts,
  isTeacherUser,
} = require('~/server/services/CourseWingTeacher');

const ACCOUNT_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const COURSE_KEY = 'c'.repeat(64);
const OTHER_COURSE_KEY = 'd'.repeat(64);
const THIRD_COURSE_KEY = 'e'.repeat(64);
const FOURTH_COURSE_KEY = 'f'.repeat(64);
const ERROR_COURSE_KEY = '1'.repeat(64);

let mongoServer;
let migratedIndexes;
let migratedReceiptIndexes;
let migratedRoleIndexes;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await CourseWingCourseSetting.init();
  await CourseWingReceipt.init();
  await CourseWingActivity.init();
  await CourseWingTeacherRole.init();
  await CourseWingCourseSetting.deleteMany({});
  await CourseWingReceipt.deleteMany({});
  await CourseWingTeacherRole.deleteMany({});

  // Reproduce the pre-fix production index. The compound index may already
  // exist because Mongoose initialized the updated schema; both can coexist.
  await CourseWingCourseSetting.collection.createIndex(
    { canvasCourseId: 1 },
    { name: 'canvasCourseId_1', unique: true },
  );
  await CourseWingReceipt.collection.createIndex(
    { conversationId: 1 },
    { name: 'conversationId_1', unique: true },
  );
  await CourseWingTeacherRole.collection.createIndex(
    { email: 1 },
    { name: 'email_1', unique: true },
  );
  await ensureTeacherStorageIndexes();
  migratedIndexes = await CourseWingCourseSetting.collection.indexes();
  migratedReceiptIndexes = await CourseWingReceipt.collection.indexes();
  migratedRoleIndexes = await CourseWingTeacherRole.collection.indexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await runAsSystem(() =>
    Promise.all([
      CourseWingReceipt.deleteMany({}),
      CourseWingCourseSetting.deleteMany({}),
      CourseWingActivity.deleteMany({}),
      CourseWingTeacherRole.deleteMany({}),
      mongoose.models.Conversation.deleteMany({}),
      mongoose.models.Message.deleteMany({}),
    ]),
  );
});

describe('CourseWing teacher storage isolation', () => {
  it('drops legacy global indexes and creates app-tenant/shared-course uniqueness', () => {
    expect(migratedIndexes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'canvasCourseId_1', unique: true })]),
    );
    expect(migratedIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app_tenant_canvas_course_unique',
          unique: true,
          key: { appTenantKey: 1, canvasCourseKey: 1 },
        }),
      ]),
    );
    expect(migratedReceiptIndexes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'conversationId_1', unique: true })]),
    );
    expect(migratedReceiptIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app_tenant_canvas_course_user_conversation_unique',
          unique: true,
          key: {
            appTenantKey: 1,
            canvasCourseKey: 1,
            userId: 1,
            conversationId: 1,
          },
        }),
      ]),
    );
    expect(migratedRoleIndexes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'email_1', unique: true })]),
    );
    expect(migratedRoleIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app_tenant_email_unique',
          unique: true,
          key: { appTenantKey: 1, email: 1 },
        }),
      ]),
    );
  });

  it('shares settings, activities, and receipts across account keys for one course key', async () => {
    serviceFetch
      .mockResolvedValueOnce({
        ok: true,
        body: [{ canvasCourseId: 42, courseKey: COURSE_KEY, isInstructor: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        body: [{ canvasCourseId: 42, courseKey: COURSE_KEY, isInstructor: false }],
      });
    const teacherScope = await getCanvasCourseScope(
      'teacher-user',
      { tenantId: 'teacher-canvas-tenant', canvasAccountKey: ACCOUNT_A },
      { forceRefresh: true },
    );
    const studentScope = await getCanvasCourseScope(
      'student-user',
      { tenantId: 'student-canvas-tenant', canvasAccountKey: ACCOUNT_B },
      { forceRefresh: true },
    );

    expect(teacherScope.canvasAccountKey).not.toBe(studentScope.canvasAccountKey);
    expect(teacherScope.courses.get(42)).toEqual({
      courseKey: COURSE_KEY,
      isInstructor: true,
    });
    expect(studentScope.courses.get(42)).toEqual({
      courseKey: COURSE_KEY,
      isInstructor: false,
    });

    const activity = await CourseWingActivity.create({
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: COURSE_KEY,
      canvasCourseId: 42,
      title: 'Shared practice',
      audience: ['student@example.test'],
    });
    await Promise.all([
      CourseWingCourseSetting.create({
        canvasAccountKey: ACCOUNT_A,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        helpLevel: 'socratic',
      }),
      CourseWingReceipt.create({
        canvasAccountKey: ACCOUNT_A,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        conversationId: 'student-session',
        userId: 'student-user',
        topic: 'Shared receipt',
      }),
    ]);

    const studentCourse = studentScope.courses.get(42);
    const [setting, visibleActivity, receipts] = await Promise.all([
      getCourseSetting(studentCourse.courseKey, 42),
      getVisibleCourseActivity(studentCourse.courseKey, 42, activity._id, {
        email: 'student@example.test',
      }),
      CourseWingReceipt.find({
        canvasCourseKey: studentCourse.courseKey,
        canvasCourseId: 42,
      }).lean(),
    ]);

    expect(setting).toEqual(expect.objectContaining({ helpLevel: 'socratic' }));
    expect(visibleActivity).toEqual(expect.objectContaining({ title: 'Shared practice' }));
    expect(receipts).toEqual([
      expect.objectContaining({ userId: 'student-user', topic: 'Shared receipt' }),
    ]);
    await expect(
      CourseWingCourseSetting.create({
        canvasAccountKey: ACCOUNT_B,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        helpLevel: 'open',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects a Canvas course scope whose shared key is not exactly 64 lowercase hex chars', async () => {
    serviceFetch.mockResolvedValue({
      ok: true,
      body: [{ canvasCourseId: 42, courseKey: 'c'.repeat(63), isInstructor: true }],
    });

    await expect(
      getCanvasCourseScope(
        'malformed-course-key-user',
        { tenantId: 'canvas-tenant', canvasAccountKey: ACCOUNT_A },
        { forceRefresh: true },
      ),
    ).rejects.toThrow('Canvas service returned an invalid course scope');
  });

  it('does not re-resolve an account after the request pinned no Canvas identity', async () => {
    getCourseWingCanvasIdentity.mockResolvedValue({
      tenantId: 'tenant-connected-later',
      canvasAccountKey: ACCOUNT_A,
    });

    await expect(getCanvasCourseScope('user-without-account', null)).resolves.toBeNull();
    expect(getCourseWingCanvasIdentity).not.toHaveBeenCalled();
    expect(serviceFetch).not.toHaveBeenCalled();
  });

  it('isolates teacher storage and unique identifiers across app tenants', async () => {
    const createTenantData = (tenantId, helpLevel, title) =>
      tenantStorage.run({ tenantId }, async () => {
        await Promise.all([
          CourseWingCourseSetting.create({
            canvasAccountKey: ACCOUNT_A,
            canvasCourseKey: COURSE_KEY,
            canvasCourseId: 404,
            helpLevel,
          }),
          CourseWingReceipt.create({
            canvasAccountKey: ACCOUNT_A,
            canvasCourseKey: COURSE_KEY,
            canvasCourseId: 404,
            conversationId: 'shared-conversation',
            userId: 'shared-user',
            topic: title,
          }),
          CourseWingActivity.create({
            canvasAccountKey: ACCOUNT_A,
            canvasCourseKey: COURSE_KEY,
            canvasCourseId: 404,
            title,
          }),
          CourseWingTeacherRole.create({ email: 'shared-teacher@example.test' }),
        ]);
      });

    await createTenantData('app-tenant-a', 'socratic', 'Tenant A activity');
    await createTenantData('app-tenant-b', 'open', 'Tenant B activity');

    const tenantA = await tenantStorage.run({ tenantId: 'app-tenant-a' }, async () => ({
      setting: await getCourseSetting(COURSE_KEY, 404),
      receipts: await CourseWingReceipt.find({
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 404,
      }).lean(),
      activities: await CourseWingActivity.find({
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 404,
      }).lean(),
      roles: await CourseWingTeacherRole.find({ email: 'shared-teacher@example.test' }).lean(),
    }));
    const tenantB = await tenantStorage.run({ tenantId: 'app-tenant-b' }, async () => ({
      setting: await getCourseSetting(COURSE_KEY, 404),
      receipts: await CourseWingReceipt.find({
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 404,
      }).lean(),
      activities: await CourseWingActivity.find({
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 404,
      }).lean(),
      roles: await CourseWingTeacherRole.find({ email: 'shared-teacher@example.test' }).lean(),
    }));

    expect(tenantA.setting.helpLevel).toBe('socratic');
    expect(tenantB.setting.helpLevel).toBe('open');
    expect(tenantA.receipts).toHaveLength(1);
    expect(tenantB.receipts).toHaveLength(1);
    expect(tenantA.activities[0].title).toBe('Tenant A activity');
    expect(tenantB.activities[0].title).toBe('Tenant B activity');
    expect(tenantA.roles[0].tenantId).toBe('app-tenant-a');
    expect(tenantB.roles[0].tenantId).toBe('app-tenant-b');
  });

  it('keeps teacher-role and Canvas-course caches tenant scoped', async () => {
    await tenantStorage.run({ tenantId: 'cache-tenant-a' }, async () => {
      await CourseWingTeacherRole.create({ email: 'tenant-a-only@example.test' });
    });

    await expect(
      tenantStorage.run({ tenantId: 'cache-tenant-a' }, async () =>
        isTeacherUser({ email: 'tenant-a-only@example.test', role: 'USER' }),
      ),
    ).resolves.toBe(true);
    await expect(
      tenantStorage.run({ tenantId: 'cache-tenant-b' }, async () =>
        isTeacherUser({ email: 'tenant-a-only@example.test', role: 'USER' }),
      ),
    ).resolves.toBe(false);

    serviceFetch.mockImplementation(async () => ({
      ok: true,
      body: [
        {
          canvasCourseId: tenantStorage.getStore()?.tenantId === 'cache-tenant-a' ? 111 : 222,
          courseKey:
            tenantStorage.getStore()?.tenantId === 'cache-tenant-a'
              ? OTHER_COURSE_KEY
              : THIRD_COURSE_KEY,
          isInstructor: true,
        },
      ],
    }));
    const pinnedIdentity = {
      tenantId: 'canvas-tenant',
      canvasAccountKey: ACCOUNT_A,
    };
    const scopeA = await tenantStorage.run({ tenantId: 'cache-tenant-a' }, async () =>
      getCanvasCourseScope('same-user-id', pinnedIdentity),
    );
    const scopeB = await tenantStorage.run({ tenantId: 'cache-tenant-b' }, async () =>
      getCanvasCourseScope('same-user-id', pinnedIdentity),
    );

    expect(scopeA.courseIds).toEqual(new Set([111]));
    expect(scopeB.courseIds).toEqual(new Set([222]));
    expect(serviceFetch).toHaveBeenCalledTimes(2);
  });

  it('does not expose named-tenant roles or documents to the default app tenant', async () => {
    await tenantStorage.run({ tenantId: 'named-app-tenant' }, async () => {
      await Promise.all([
        CourseWingCourseSetting.create({
          canvasCourseKey: FOURTH_COURSE_KEY,
          canvasCourseId: 606,
          helpLevel: 'open',
        }),
        CourseWingReceipt.create({
          canvasCourseKey: FOURTH_COURSE_KEY,
          canvasCourseId: 606,
          conversationId: 'named-session',
          userId: 'named-student',
          topic: 'Named tenant receipt',
        }),
        CourseWingActivity.create({
          canvasCourseKey: FOURTH_COURSE_KEY,
          canvasCourseId: 606,
          title: 'Named tenant activity',
        }),
        CourseWingTeacherRole.create({ email: 'named-only-teacher@example.test' }),
      ]);
    });

    const namedTenant = await tenantStorage.run({ tenantId: 'named-app-tenant' }, async () => ({
      setting: await getCourseSetting(FOURTH_COURSE_KEY, 606),
      receipts: await CourseWingReceipt.countDocuments({ canvasCourseKey: FOURTH_COURSE_KEY }),
      activities: await CourseWingActivity.countDocuments({ canvasCourseKey: FOURTH_COURSE_KEY }),
      isTeacher: await isTeacherUser({
        email: 'named-only-teacher@example.test',
        role: 'USER',
      }),
    }));
    const defaultTenant = {
      setting: await getCourseSetting(FOURTH_COURSE_KEY, 606),
      receipts: await CourseWingReceipt.countDocuments({ canvasCourseKey: FOURTH_COURSE_KEY }),
      activities: await CourseWingActivity.countDocuments({ canvasCourseKey: FOURTH_COURSE_KEY }),
      isTeacher: await isTeacherUser({
        email: 'named-only-teacher@example.test',
        role: 'USER',
      }),
    };

    expect(namedTenant).toEqual({
      setting: expect.objectContaining({ helpLevel: 'open' }),
      receipts: 1,
      activities: 1,
      isTeacher: true,
    });
    expect(defaultTenant).toEqual({
      setting: null,
      receipts: 0,
      activities: 0,
      isTeacher: false,
    });
  });

  it('does not expose unscoped legacy documents inside a tenant context', async () => {
    await CourseWingCourseSetting.collection.insertOne({
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: OTHER_COURSE_KEY,
      canvasCourseId: 505,
      helpLevel: 'open',
    });

    const setting = await tenantStorage.run({ tenantId: 'scoped-tenant' }, async () =>
      getCourseSetting(OTHER_COURSE_KEY, 505),
    );

    expect(setting).toBeNull();
  });

  it('quarantines a legacy setting that has no shared course key', async () => {
    await CourseWingCourseSetting.collection.insertOne({
      canvasCourseId: 77,
      helpLevel: 'open',
    });

    await expect(getCourseSetting(THIRD_COURSE_KEY, 77)).resolves.toBeNull();
  });

  it('propagates storage failures instead of silently dropping teacher restrictions', async () => {
    const storageError = new Error('settings storage unavailable');
    const findSpy = jest.spyOn(CourseWingCourseSetting, 'findOne').mockReturnValue({
      lean: jest.fn().mockRejectedValue(storageError),
    });

    try {
      await expect(getCourseAssistance(ERROR_COURSE_KEY, 7007, null)).rejects.toThrow(
        'settings storage unavailable',
      );
    } finally {
      findSpy.mockRestore();
    }
  });

  it('derives receipt help levels from scoped settings and activities, not raw markers', async () => {
    await CourseWingCourseSetting.create({
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: OTHER_COURSE_KEY,
      canvasCourseId: 84,
      helpLevel: 'socratic',
    });
    const activity = await CourseWingActivity.create({
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: THIRD_COURSE_KEY,
      canvasCourseId: 85,
      title: 'Open practice',
      level: 'open',
      audience: [],
    });

    await expect(
      resolveConversationHelpLevel(
        {
          canvasCourseId: 84,
          promptPrefix: 'Canvas course ID: 84\nCourseWing assistance level: full',
        },
        OTHER_COURSE_KEY,
        undefined,
      ),
    ).resolves.toBe('hints');
    await expect(
      resolveConversationHelpLevel(
        {
          canvasCourseId: 85,
          promptPrefix: `Canvas course ID: 85\nCourseWing activity ID: ${activity._id}`,
        },
        THIRD_COURSE_KEY,
        undefined,
      ),
    ).resolves.toBe('full');
  });

  it('does not reuse cached course membership after the Canvas account changes', async () => {
    getCourseWingCanvasIdentity
      .mockResolvedValueOnce({ tenantId: 'tenant-a', canvasAccountKey: ACCOUNT_A })
      .mockResolvedValueOnce({ tenantId: 'tenant-a', canvasAccountKey: ACCOUNT_A })
      .mockResolvedValueOnce({ tenantId: 'tenant-b', canvasAccountKey: ACCOUNT_B });
    serviceFetch.mockImplementation(async (_path, options) => ({
      ok: true,
      body:
        options.headers['X-Tenant-Id'] === 'tenant-a'
          ? [{ canvasCourseId: 42, courseKey: COURSE_KEY, isInstructor: false }]
          : [{ canvasCourseId: 99, courseKey: OTHER_COURSE_KEY, isInstructor: true }],
    }));

    const first = await getCanvasCourseScope('switching-user');
    const cached = await getCanvasCourseScope('switching-user');
    const switched = await getCanvasCourseScope('switching-user');

    expect(first.courseIds).toEqual(new Set([42]));
    expect(cached.courseIds).toEqual(new Set([42]));
    expect(switched.courseIds).toEqual(new Set([99]));
    expect(switched.canvasAccountKey).toBe(ACCOUNT_B);
    expect(serviceFetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes receipts from conversations in only the requested shared course', async () => {
    const studentId = new mongoose.Types.ObjectId().toString();
    const otherStudentId = new mongoose.Types.ObjectId().toString();
    await mongoose.models.Conversation.create([
      {
        conversationId: 'account-a-conversation',
        user: studentId,
        endpoint: 'agents',
        canvasAccountKey: ACCOUNT_A,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        promptPrefix: 'Canvas course ID: 42',
      },
      {
        conversationId: 'account-a-conversation',
        user: otherStudentId,
        endpoint: 'agents',
        canvasAccountKey: ACCOUNT_A,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        promptPrefix: 'Canvas course ID: 42',
      },
      {
        conversationId: 'account-b-conversation',
        user: studentId,
        endpoint: 'agents',
        canvasAccountKey: ACCOUNT_B,
        canvasCourseKey: OTHER_COURSE_KEY,
        canvasCourseId: 42,
        promptPrefix: 'Canvas course ID: 42',
      },
    ]);
    await mongoose.models.Message.create([
      {
        messageId: 'a-user',
        conversationId: 'account-a-conversation',
        user: studentId,
        text: 'Help me study.',
        isCreatedByUser: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        messageId: 'a-assistant',
        conversationId: 'account-a-conversation',
        user: studentId,
        text: 'Let us work through it.',
        isCreatedByUser: false,
        createdAt: new Date('2026-01-01T00:05:00.000Z'),
      },
      {
        messageId: 'a-other-user',
        conversationId: 'account-a-conversation',
        user: otherStudentId,
        text: 'Same conversation id, different student.',
        isCreatedByUser: true,
      },
      {
        messageId: 'a-other-assistant',
        conversationId: 'account-a-conversation',
        user: otherStudentId,
        text: 'This transcript must remain separate.',
        isCreatedByUser: false,
      },
      {
        messageId: 'b-user',
        conversationId: 'account-b-conversation',
        user: studentId,
        text: 'This belongs to another school.',
        isCreatedByUser: true,
      },
      {
        messageId: 'b-assistant',
        conversationId: 'account-b-conversation',
        user: studentId,
        text: 'It must not be scanned.',
        isCreatedByUser: false,
      },
    ]);
    const findSpy = jest.spyOn(mongoose.models.Conversation, 'find');
    const originalBedrockKey = process.env.BEDROCK_AWS_ACCESS_KEY_ID;
    delete process.env.BEDROCK_AWS_ACCESS_KEY_ID;

    try {
      const result = await refreshReceipts(COURSE_KEY, 42);
      const studentMessages = await getConversationMessages('account-a-conversation', studentId);

      expect(result.total).toBe(2);
      expect(studentMessages).toHaveLength(2);
      expect(studentMessages.map((message) => message.text).join(' ')).not.toContain(
        'different student',
      );
      expect(findSpy).toHaveBeenCalledWith({
        tenantId: null,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
      });
    } finally {
      findSpy.mockRestore();
      if (originalBedrockKey === undefined) {
        delete process.env.BEDROCK_AWS_ACCESS_KEY_ID;
      } else {
        process.env.BEDROCK_AWS_ACCESS_KEY_ID = originalBedrockKey;
      }
    }
  });

  it('does not refresh named-tenant conversations from the default app tenant', async () => {
    const defaultStudentId = new mongoose.Types.ObjectId().toString();
    const namedStudentId = new mongoose.Types.ObjectId().toString();
    await mongoose.models.Conversation.create({
      conversationId: 'default-conversation',
      user: defaultStudentId,
      endpoint: 'agents',
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: COURSE_KEY,
      canvasCourseId: 42,
      promptPrefix: 'Canvas course ID: 42',
    });
    await tenantStorage.run({ tenantId: 'named-app-tenant' }, () =>
      mongoose.models.Conversation.create({
        conversationId: 'named-conversation',
        user: namedStudentId,
        endpoint: 'agents',
        canvasAccountKey: ACCOUNT_B,
        canvasCourseKey: COURSE_KEY,
        canvasCourseId: 42,
        promptPrefix: 'Canvas course ID: 42',
      }),
    );

    const result = await refreshReceipts(COURSE_KEY, 42);

    expect(result.total).toBe(1);
  });

  it('does not mix named-tenant messages into default receipts or transcripts', async () => {
    const studentId = new mongoose.Types.ObjectId().toString();
    await mongoose.models.Conversation.create({
      conversationId: 'tenant-collision',
      user: studentId,
      endpoint: 'agents',
      canvasAccountKey: ACCOUNT_A,
      canvasCourseKey: COURSE_KEY,
      canvasCourseId: 42,
      promptPrefix: 'Canvas course ID: 42',
    });
    await mongoose.models.Message.create([
      {
        messageId: 'default-user',
        conversationId: 'tenant-collision',
        user: studentId,
        text: 'Default tenant question.',
        isCreatedByUser: true,
      },
      {
        messageId: 'default-assistant',
        conversationId: 'tenant-collision',
        user: studentId,
        text: 'Default tenant answer.',
        isCreatedByUser: false,
      },
    ]);
    await tenantStorage.run({ tenantId: 'named-app-tenant' }, () =>
      mongoose.models.Message.create([
        {
          messageId: 'named-user',
          conversationId: 'tenant-collision',
          user: studentId,
          text: 'Named tenant secret.',
          isCreatedByUser: true,
        },
        {
          messageId: 'named-assistant',
          conversationId: 'tenant-collision',
          user: studentId,
          text: 'Named tenant private answer.',
          isCreatedByUser: false,
        },
      ]),
    );
    await CourseWingReceipt.create({
      conversationId: 'tenant-collision',
      userId: studentId,
      canvasCourseKey: COURSE_KEY,
      canvasCourseId: 42,
      messageCount: 2,
    });

    const messages = await getConversationMessages('tenant-collision', studentId);
    const result = await refreshReceipts(COURSE_KEY, 42, { limit: 0 });

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.text)).toEqual(
      expect.arrayContaining(['Default tenant question.', 'Default tenant answer.']),
    );
    expect(messages.map((message) => message.text).join(' ')).not.toContain('Named tenant');
    expect(result).toMatchObject({ generated: 0, staleRemaining: 0, total: 1 });
  });
});
