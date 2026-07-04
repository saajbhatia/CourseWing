import type { LearnLinkAssignment, LearnLinkCourseContext } from './types';
import { getLearnLinkTimezone } from './config';

const COURSE_ID_PATTERN = /Canvas course ID:\s*(\d+)/i;
const MAX_CARD_ASSIGNMENTS = 5;

export function extractCanvasCourseId(promptPrefix?: string | null): number | null {
  if (!promptPrefix) {
    return null;
  }

  const match = COURSE_ID_PATTERN.exec(promptPrefix);
  if (!match) {
    return null;
  }

  const canvasCourseId = Number(match[1]);
  return Number.isFinite(canvasCourseId) ? canvasCourseId : null;
}

export function buildCourseCard(context: LearnLinkCourseContext): string {
  const { course, hasSyllabus, upcomingAssignments, recentAnnouncements, materialCounts } = context;
  const lines: string[] = [
    '[LearnLink course context — synced from Canvas, refreshed automatically]',
    `Today: ${formatDate(new Date().toISOString())}, ${new Date().getFullYear()}`,
    `Course: ${course.name}${course.courseCode ? ` (${course.courseCode})` : ''} — Canvas course ID: ${course.canvasCourseId}`,
  ];

  if (upcomingAssignments.length > 0) {
    lines.push(
      `Upcoming assignments (next ${Math.min(upcomingAssignments.length, MAX_CARD_ASSIGNMENTS)}):`,
    );
    for (const assignment of upcomingAssignments.slice(0, MAX_CARD_ASSIGNMENTS)) {
      lines.push(formatAssignmentLine(assignment));
    }
  } else {
    lines.push('No upcoming assignments with due dates.');
  }

  if (recentAnnouncements.length > 0) {
    lines.push('Recent announcements:');
    for (const announcement of recentAnnouncements) {
      const posted = formatDate(announcement.postedAt);
      lines.push(
        `- "${announcement.title}"${posted ? ` (${posted})` : ''}${
          announcement.preview ? `: ${announcement.preview}` : ''
        }`,
      );
    }
  }

  lines.push(
    `Synced materials: ${materialCounts.files} files, ${materialCounts.pages} pages, ${materialCounts.modules} modules (${materialCounts.readableMaterials} readable)${hasSyllabus ? '; syllabus posted' : ''}.`,
    'Tools: learnlink_get_assignments (details, official grades, group weights, past work), learnlink_get_modules (syllabus + course structure), learnlink_search_materials (find content in course files/pages), learnlink_read_material (read one). Prefer this synced context over guessing.',
    "When the student asks for a document or link, give them the actual URL from tool results as a markdown link (canvasUrl for the material itself, or an entry from its links array). These open through the student's own school login — including Office365/SharePoint ones — so share them directly instead of describing where to click in Canvas.",
  );

  return lines.join('\n');
}

function formatAssignmentLine(assignment: LearnLinkAssignment): string {
  const parts = [assignment.name];
  const due = formatDate(assignment.dueAt, true);

  if (due) {
    parts.push(`due ${due}`);
  }
  if (assignment.pointsPossible != null) {
    parts.push(`${assignment.pointsPossible} pts`);
  }
  if (assignment.submissionStatus) {
    parts.push(assignment.submissionStatus);
  }

  return `- ${parts.join(' — ')}`;
}

function formatDate(isoDate: string | null | undefined, withTime = false): string | null {
  if (!isoDate) {
    return null;
  }

  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: getLearnLinkTimezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(timestamp));
}
