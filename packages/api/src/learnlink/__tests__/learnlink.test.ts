import { assistanceLevels, LEARNLINK_POLICY_MARKER } from 'librechat-data-provider';
import { buildCourseCard, extractCanvasCourseId } from '../card';
import { clearCourseContextCache } from '../service';
import { buildAssistancePolicy } from '../prompts';
import {
  createLearnLinkTool,
  LEARNLINK_GET_ASSIGNMENTS,
  LEARNLINK_SEARCH_MATERIALS,
} from '../tools';
import type { LearnLinkCourseContext } from '../types';

const courseContext: LearnLinkCourseContext = {
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
      expect(policy.startsWith(LEARNLINK_POLICY_MARKER)).toBe(true);
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

describe('buildCourseCard', () => {
  it('renders a compact card with course, assignments, and announcements', () => {
    const card = buildCourseCard(courseContext);

    expect(card).toContain('AP Chemistry (CHEM-AP)');
    expect(card).toContain('Canvas course ID: 754');
    expect(card).toContain('Titration Lab Report');
    expect(card).toContain('25 pts');
    expect(card).toContain('unsubmitted');
    expect(card).toContain('Exam moved to Friday');
    expect(card).toContain('learnlink_search_materials');
    expect(card.length).toBeLessThan(2500);
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

describe('learnlink tools', () => {
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

    const result = await createLearnLinkTool(LEARNLINK_GET_ASSIGNMENTS).invoke({
      canvasCourseId: 754,
      filter: 'upcoming',
    });

    expect(JSON.parse(result as string)).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/learnlink/courses/754/assignments?filter=upcoming'),
      expect.anything(),
    );
  });

  it('returns a friendly message when the service is down', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch;

    const result = await createLearnLinkTool(LEARNLINK_GET_ASSIGNMENTS).invoke({});

    expect(result).toContain('temporarily unavailable');
  });

  it('suggests alternatives when search has no hits', async () => {
    mockFetchResponse({ query: 'entropy', hits: [] });

    const result = await createLearnLinkTool(LEARNLINK_SEARCH_MATERIALS).invoke({
      query: 'entropy',
    });

    expect(result).toContain('No course materials matched');
  });
});
