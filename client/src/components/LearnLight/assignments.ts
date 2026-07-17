import type { LearnLightAssignment } from '~/data-provider/LearnLight';

export type AssignmentBuckets = {
  upNext: LearnLightAssignment[];
  overdue: LearnLightAssignment[];
  thisWeek: LearnLightAssignment[];
  later: LearnLightAssignment[];
  completed: LearnLightAssignment[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const UP_NEXT_LIMIT = 5;

export function bucketAssignments(
  assignments: LearnLightAssignment[],
  now: number,
): AssignmentBuckets {
  const overdue: LearnLightAssignment[] = [];
  const thisWeek: LearnLightAssignment[] = [];
  const later: LearnLightAssignment[] = [];
  const completed: LearnLightAssignment[] = [];
  const undated: LearnLightAssignment[] = [];

  for (const assignment of assignments) {
    if (assignment.completed) {
      completed.push(assignment);
      continue;
    }

    const due = assignment.dueAt != null ? Date.parse(assignment.dueAt) : Number.NaN;
    if (Number.isNaN(due)) {
      undated.push(assignment);
    } else if (due < now) {
      overdue.push(assignment);
    } else if (due <= now + WEEK_MS) {
      thisWeek.push(assignment);
    } else {
      later.push(assignment);
    }
  }

  const byDueAsc = (a: LearnLightAssignment, b: LearnLightAssignment) =>
    Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? '');
  overdue.sort((a, b) => byDueAsc(b, a));
  thisWeek.sort(byDueAsc);
  later.sort(byDueAsc);
  completed.sort((a, b) => byDueAsc(b, a));

  const upcoming = thisWeek.concat(later);
  const upNext = (upcoming.length > 0 ? upcoming : overdue).slice(0, UP_NEXT_LIMIT);

  return { upNext, overdue, thisWeek, later: later.concat(undated), completed };
}
