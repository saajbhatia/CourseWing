import {
  assistanceLevels,
  stripLearnLightBlocks,
  LEARNLIGHT_TUTOR_MARKER,
  LEARNLIGHT_POLICY_MARKER,
} from 'librechat-data-provider';
import { buildCourseCard, extractCanvasCourseId } from '../card';
import { clearCourseContextCache } from '../service';
import { buildAssistancePolicy, buildLearningDefault } from '../prompts';
import {
  createLearnLightTool,
  LEARNLIGHT_GET_ASSIGNMENTS,
  LEARNLIGHT_SEARCH_MATERIALS,
  LEARNLIGHT_SEND_FEEDBACK,
} from '../tools';
import type { LearnLightCourseContext } from '../types';

const courseContext: LearnLightCourseContext = {
  course: {
    canvasCourseId: 754,
    name: 'AP Chemistry',
    courseCode: 'CHEM-AP',
    termName: '2025-2026',
  },
  hasSyllabus: true,
  upcomingAssignments: [
    {
      canvasAssignmentId: 101,
      courseId: '754',
      name: 'Titration Lab Report',
      dueAt: '2026-07-08T06:59:00Z',
      pointsPossible: 25,
      submissionStatus: 'unsubmitted',
      score: null,
      grade: null,
      htmlUrl: 'https://school.instructure.com/courses/754/assignments/101',
    },
  ],
  recentAnnouncements: [
    {
      title: 'Exam moved to Friday',
      author: 'Ms. Rivera',
      postedAt: '2026-07-01T15:00:00Z',
      preview: 'The unit exam is now on Friday so we have one more review day.',
    },
  ],
  materialCounts: { modules: 9, files: 42, pages: 12, readableMaterials: 40 },
  lastSyncAt: '2026-07-04T18:00:00Z',
  moduleNames: ['Unit P: Precalc Review', 'Unit 1: Limits and Continuity', 'Unit 2: Differentiation'],
  gradeSummary: {
    currentScore: 96.4,
    currentGrade: 'A',
    weightedGrading: false,
    groupWeights: null,
  },
  recentGradedWork: [
    {
      canvasAssignmentId: 88,
      courseId: '754',
      name: 'Unit 4 Test',
      dueAt: '2026-06-20T06:59:00Z',
      pointsPossible: 33,
      submissionStatus: 'graded',
      score: 31,
      grade: '31',
      htmlUrl: 'https://school.instructure.com/courses/754/assignments/88',
    },
    {
      canvasAssignmentId: 87,
      courseId: '754',
      name: 'Unit 3 Test',
      dueAt: '2026-06-05T06:59:00Z',
      pointsPossible: 40,
      submissionStatus: 'graded',
      score: 38,
      grade: '38',
      htmlUrl: 'https://school.instructure.com/courses/754/assignments/87',
    },
  ],
};

describe('extractCanvasCourseId', () => {
  it('extracts the course id from a prompt prefix', () => {
    const prefix = 'Current Canvas course: AP Chemistry\nCanvas course ID: 754\nMore text';
    expect(extractCanvasCourseId(prefix)).toBe(754);
  });

  it('returns null when no marker is present', () => {
    expect(extractCanvasCourseId('Just a normal prompt prefix')).toBeNull();
    expect(extractCanvasCourseId(undefined)).toBeNull();
    expect(extractCanvasCourseId(null)).toBeNull();
  });
});

describe('buildAssistancePolicy', () => {
  it('builds a marker-prefixed policy block for every level', () => {
    for (const level of assistanceLevels) {
      const policy = buildAssistancePolicy(level);
      expect(policy.startsWith(LEARNLIGHT_POLICY_MARKER)).toBe(true);
      expect(policy).toContain('ASSISTANCE LEVEL:');
    }
  });

  it('scopes each level to its own permissions', () => {
    expect(buildAssistancePolicy('discuss')).toContain('Discuss only');
    expect(buildAssistancePolicy('hints')).toContain('next small step');
    expect(buildAssistancePolicy('worked')).toContain('analogous problems');
    expect(buildAssistancePolicy('full')).toContain('No restrictions');
  });
});

describe('buildLearningDefault', () => {
  it('builds a tutor block without policy framing', () => {
    const tutor = buildLearningDefault();
    expect(tutor.startsWith(LEARNLIGHT_TUTOR_MARKER)).toBe(true);
    expect(tutor).toContain('Answer direct questions fully');
    expect(tutor).not.toContain(LEARNLIGHT_POLICY_MARKER);
    expect(tutor).not.toContain('ASSISTANCE LEVEL:');
    expect(tutor).not.toContain('Follow it strictly');
  });

  it('draws the boundary at answers to any item of assigned work', () => {
    const tutor = buildLearningDefault();
    expect(tutor).toContain('do not give answers to ANY of its items');
    expect(tutor).toContain('not even one item worked "as an example"');
    expect(tutor).toContain('no going item-by-item with hints');
    expect(tutor).toContain('analogous example you invent with different content');
    expect(tutor).toContain('never lecture about academic integrity unprompted');
  });

  it('persists the boundary across crops, re-uploads, and rewordings', () => {
    const tutor = buildLearningDefault();
    expect(tutor).toContain('covers the task, not the message');
    expect(tutor).toContain('re-upload');
  });

  it('tells the tutor to ground school-life questions in real data via tools', () => {
    const tutor = buildLearningDefault();
    expect(tutor).toContain('learnlight_* tools');
    expect(tutor).toContain('ALL of their classes');
    expect(tutor).toContain('Never fill a plan with placeholder blanks');
  });
});

describe('stripLearnLightBlocks', () => {
  it('strips a server-appended learning default block', () => {
    const prefix = `Some base prefix\n\n${buildLearningDefault()}`;
    expect(stripLearnLightBlocks(prefix)).toBe('Some base prefix');
  });
});

describe('buildCourseCard', () => {
  it('renders a compact card with course, assignments, and announcements', () => {
    const card = buildCourseCard(courseContext);

    expect(card).toContain('AP Chemistry (CHEM-AP)');
    expect(card).toContain('Canvas course ID: 754');
    expect(card).toContain('Titration Lab Report');
    expect(card).toContain('25 pts');
    expect(card).toContain('unsubmitted');
    expect(card).toContain('Exam moved to Friday');
    expect(card).toContain('learnlight_search_materials');
    expect(card.length).toBeLessThan(3000);
  });

  it('renders current grade and recent graded work with percentages', () => {
    const card = buildCourseCard(courseContext);

    expect(card).toContain('Current grade: 96.4% (A)');
    expect(card).toContain('Recent graded work');
    expect(card).toContain('Unit 4 Test — 31/33 (93.9%)');
    expect(card).toContain('Unit 3 Test — 38/40 (95%)');
  });

  it('renders the course module structure in order', () => {
    const card = buildCourseCard(courseContext);

    expect(card).toContain(
      'Course structure (modules, in order): Unit P: Precalc Review | Unit 1: Limits and Continuity | Unit 2: Differentiation',
    );
  });

  it('instructs a sources footer only for course materials, never general knowledge', () => {
    const card = buildCourseCard(courseContext);

    expect(card).toContain('Only when an answer draws on course materials');
    expect(card).toContain('never "Sources: general knowledge"');
  });

  it('omits grade lines when the service returned no graded work', () => {
    const card = buildCourseCard({
      ...courseContext,
      gradeSummary: undefined,
      recentGradedWork: undefined,
    });

    expect(card).not.toContain('Current grade:');
    expect(card).not.toContain('Recent graded work');
  });

  it('handles a course with no upcoming work', () => {
    const card = buildCourseCard({
      ...courseContext,
      upcomingAssignments: [],
      recentAnnouncements: [],
    });

    expect(card).toContain('No upcoming assignments');
  });
});

describe('learnlight tools', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearCourseContextCache();
    jest.restoreAllMocks();
  });

  const mockFetchResponse = (payload: unknown, ok = true, status = 200) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;
  };

  it('returns assignment JSON from the service', async () => {
    const payload = {
      course: { canvasCourseId: 754, name: 'AP Chemistry' },
      assignments: [{ canvasAssignmentId: 101, name: 'Titration Lab Report' }],
    };
    mockFetchResponse(payload);

    const result = await createLearnLightTool(LEARNLIGHT_GET_ASSIGNMENTS).invoke({
      canvasCourseId: 754,
      filter: 'upcoming',
    });

    expect(JSON.parse(result as string)).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/learnlight/courses/754/assignments?filter=upcoming'),
      expect.anything(),
    );
  });

  it('returns a friendly message when the service is down', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch;

    const result = await createLearnLightTool(LEARNLIGHT_GET_ASSIGNMENTS).invoke({});

    expect(result).toContain('temporarily unavailable');
  });

  it('suggests alternatives when search has no hits', async () => {
    mockFetchResponse({ query: 'entropy', hits: [] });

    const result = await createLearnLightTool(LEARNLIGHT_SEARCH_MATERIALS).invoke({
      query: 'entropy',
    });

    expect(result).toContain('No course materials matched');
  });

  const mockFetchByUrl = (routes: Array<{ match: string; payload: unknown }>) => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      const route = routes.find((r) => String(url).includes(r.match));
      return {
        ok: route != null,
        status: route != null ? 200 : 404,
        json: async () => route?.payload,
        text: async () => JSON.stringify(route?.payload),
      };
    }) as unknown as typeof fetch;
  };

  it('reports sync-in-progress instead of an empty assignment list while the tenant syncs', async () => {
    mockFetchByUrl([
      { match: '/assignments', payload: { assignments: [] } },
      {
        match: '/tenants/tenant-1',
        payload: { tenantId: 'tenant-1', syncing: true, lastSyncAt: null, courseCount: 0 },
      },
    ]);

    const result = await createLearnLightTool(LEARNLIGHT_GET_ASSIGNMENTS, {
      tenantId: 'tenant-1',
    }).invoke({});

    expect(result).toContain('still syncing');
    expect(result).toContain('Do NOT guess');
  });

  it('returns the empty assignment list unchanged once the tenant has synced', async () => {
    mockFetchByUrl([
      { match: '/assignments', payload: { assignments: [] } },
      {
        match: '/tenants/tenant-1',
        payload: {
          tenantId: 'tenant-1',
          syncing: false,
          lastSyncAt: '2026-07-09T18:00:00Z',
          courseCount: 7,
        },
      },
    ]);

    const result = await createLearnLightTool(LEARNLIGHT_GET_ASSIGNMENTS, {
      tenantId: 'tenant-1',
    }).invoke({});

    expect(JSON.parse(result as string)).toEqual({ assignments: [] });
  });

  it('sends app feedback and instructs the follow-up share-chat ask', async () => {
    mockFetchResponse({ feedback: { id: 1, chatShared: false } });

    const result = await createLearnLightTool(LEARNLIGHT_SEND_FEEDBACK, {
      tenantId: 'tenant-1',
      conversationId: 'convo-9',
      userName: 'Saaj',
      userEmail: 'saaj@school.test',
    }).invoke({ message: 'The review sessions are awesome', category: 'praise' });

    expect(result).toContain('Feedback sent');
    expect(result).toContain('share this chat');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('/api/learnlight/feedback');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe('The review sessions are awesome');
    expect(body.conversationId).toBe('convo-9');
    expect(body.userEmail).toBe('saaj@school.test');
  });

  it('attaches the chat on a shareChat-only follow-up call', async () => {
    mockFetchResponse({ updated: 1 });

    const result = await createLearnLightTool(LEARNLIGHT_SEND_FEEDBACK, {
      conversationId: 'convo-9',
    }).invoke({ shareChat: true });

    expect(result).toContain('now attached');
  });

  it('tells the model to resend when there is no feedback to attach the chat to', async () => {
    mockFetchResponse({ updated: 0 });

    const result = await createLearnLightTool(LEARNLIGHT_SEND_FEEDBACK, {
      conversationId: 'convo-9',
    }).invoke({ shareChat: true });

    expect(result).toContain('no earlier feedback');
  });

  it('reports sync-in-progress for empty search results while the tenant syncs', async () => {
    mockFetchByUrl([
      { match: '/api/learnlight/search', payload: { query: 'entropy', hits: [] } },
      {
        match: '/tenants/tenant-1',
        payload: { tenantId: 'tenant-1', syncing: true, lastSyncAt: null, courseCount: 0 },
      },
    ]);

    const result = await createLearnLightTool(LEARNLIGHT_SEARCH_MATERIALS, {
      tenantId: 'tenant-1',
    }).invoke({ query: 'entropy' });

    expect(result).toContain('still syncing');
  });
});
