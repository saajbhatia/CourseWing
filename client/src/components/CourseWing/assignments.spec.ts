import type { CourseWingAssignment } from '~/data-provider/CourseWing';
import { bucketAssignments } from './assignments';

function assignment(overrides: Partial<CourseWingAssignment>): CourseWingAssignment {
  return {
    id: String(overrides.canvasAssignmentId ?? 1),
    canvasAssignmentId: overrides.canvasAssignmentId ?? 1,
    name: 'Assignment',
    dueAt: null,
    completed: false,
    ...overrides,
  };
}

describe('CourseWing assignment buckets', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');

  it('does not label submitted or graded past work overdue', () => {
    const overdue = assignment({
      canvasAssignmentId: 1,
      dueAt: '2026-07-10T12:00:00Z',
    });
    const submitted = assignment({
      canvasAssignmentId: 2,
      dueAt: '2026-07-11T12:00:00Z',
      completed: true,
    });
    const graded = assignment({
      canvasAssignmentId: 3,
      dueAt: '2026-07-12T12:00:00Z',
      completed: true,
    });

    const buckets = bucketAssignments([overdue, submitted, graded], now);

    expect(buckets.overdue.map((item) => item.canvasAssignmentId)).toEqual([1]);
    expect(buckets.completed.map((item) => item.canvasAssignmentId)).toEqual([3, 2]);
    expect(buckets.upNext.map((item) => item.canvasAssignmentId)).toEqual([1]);
  });

  it('keeps completed future work out of Up next', () => {
    const submittedEarly = assignment({
      canvasAssignmentId: 1,
      dueAt: '2026-07-16T12:00:00Z',
      completed: true,
    });
    const upcoming = assignment({
      canvasAssignmentId: 2,
      dueAt: '2026-07-17T12:00:00Z',
    });

    const buckets = bucketAssignments([submittedEarly, upcoming], now);

    expect(buckets.upNext.map((item) => item.canvasAssignmentId)).toEqual([2]);
    expect(buckets.completed.map((item) => item.canvasAssignmentId)).toEqual([1]);
  });
});
