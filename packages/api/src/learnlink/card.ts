import type { LearnLinkAssignment, LearnLinkCourseContext } from './types';
import { getLearnLinkNow, getLearnLinkTimezone } from './config';

const MAX_CARD_ASSIGNMENTS = 5;

export { extractCanvasCourseId } from 'librechat-data-provider';

export function buildCourseCard(context: LearnLinkCourseContext): string {
  const { course, hasSyllabus, upcomingAssignments, recentAnnouncements, materialCounts } = context;
  const today = getLearnLinkNow();
  const lines: string[] = [
    '[LearnLink course context — synced from Canvas, refreshed automatically]',
    `Today: ${formatDate(today.toISOString())}, ${today.getFullYear()}`,
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

  if (context.gradeSummary?.currentScore != null) {
    const { currentScore, currentGrade } = context.gradeSummary;
    lines.push(`Current grade: ${currentScore}%${currentGrade ? ` (${currentGrade})` : ''}`);
  }

  const gradedWork = context.recentGradedWork ?? [];
  if (gradedWork.length > 0) {
    lines.push('Recent graded work (most recent first):');
    for (const assignment of gradedWork) {
      lines.push(formatGradedLine(assignment));
    }
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

  const masteryTool =
    (context.masteryOutcomeCount ?? 0) > 0
      ? `, learnlink_get_mastery (Learning Mastery — ${context.masteryOutcomeCount} outcomes tracked)`
      : '';

  if (context.moduleNames != null && context.moduleNames.length > 0) {
    lines.push(`Course structure (modules, in order): ${context.moduleNames.join(' | ')}`);
  }

  lines.push(
    `Synced materials: ${materialCounts.files} files, ${materialCounts.pages} pages, ${materialCounts.modules} modules (${materialCounts.readableMaterials} readable)${hasSyllabus ? '; syllabus posted' : ''}.`,
    `Tools: learnlink_get_assignments (assignment details, rubrics + teacher feedback — grades and scores are already listed above, so only call it for details this card lacks), learnlink_get_modules (syllabus + course structure), learnlink_search_materials (find content in course files/pages), learnlink_read_material (read one)${masteryTool}. Answer from the card when it already has what you need; when the student asks about course specifics beyond it — what a unit or exam covers, what was taught, how something was defined in class — look it up with one or two targeted calls instead of answering from general knowledge.`,
    "When the student asks for a document or link, give them the actual URL from tool results as a markdown link (canvasUrl for the material itself, or an entry from its links array). These open through the student's own school login — including Office365/SharePoint ones — so share them directly instead of describing where to click in Canvas.",
    'Only when an answer draws on course materials, end it with a one-line "Sources:" footer linking each material you actually used (markdown links via canvasUrl). If the materials conflict or you are not confident the answer matches what was taught in class, add a short caution (e.g. "low confidence — confirm with your teacher"). When you answered from your own knowledge, write no footer and no attribution at all — never "Sources: general knowledge".',
  );

  return lines.join('\n');
}

function formatGradedLine(assignment: LearnLinkAssignment): string {
  const parts = [assignment.name];

  if (assignment.score != null && assignment.pointsPossible != null && assignment.pointsPossible > 0) {
    const percent = Math.round((assignment.score / assignment.pointsPossible) * 1000) / 10;
    parts.push(`${assignment.score}/${assignment.pointsPossible} (${percent}%)`);
  } else if (assignment.score != null) {
    parts.push(`score ${assignment.score}`);
  }
  if (assignment.grade != null && assignment.grade !== String(assignment.score)) {
    parts.push(assignment.grade);
  }
  const due = formatDate(assignment.dueAt);
  if (due) {
    parts.push(due);
  }

  return `- ${parts.join(' — ')}`;
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
