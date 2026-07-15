import type { LearnLightAssignment, LearnLightCourseContext } from './types';
import { getLearnLightNow, getLearnLightTimezone } from './config';

const MAX_CARD_ASSIGNMENTS = 5;
const CARD_INSTRUCTIONS_LIMIT = 800;
const CARD_SUBMISSION_BODY_LIMIT = 1200;
const CARD_COMMENT_LIMIT = 300;

export { extractCanvasCourseId, extractCanvasAssignmentId } from 'librechat-data-provider';

export function buildCourseCard(context: LearnLightCourseContext): string {
  const { course, hasSyllabus, upcomingAssignments, recentAnnouncements, materialCounts } = context;
  const today = getLearnLightNow();
  const lines: string[] = [
    '[LearnLight course context — synced from Canvas, refreshed automatically]',
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
      ? `, learnlight_get_mastery (Learning Mastery — ${context.masteryOutcomeCount} outcomes tracked)`
      : '';

  if (context.moduleNames != null && context.moduleNames.length > 0) {
    lines.push(`Course structure (modules, in order): ${context.moduleNames.join(' | ')}`);
  }

  lines.push(
    `Synced materials: ${materialCounts.files} files, ${materialCounts.pages} pages, ${materialCounts.modules} modules (${materialCounts.readableMaterials} readable)${hasSyllabus ? '; syllabus posted' : ''}.`,
    `Tools: learnlight_get_assignments (assignment details, rubrics + teacher feedback, and the student's own submitted work — grades and scores are already listed above, so only call it for details this card lacks), learnlight_get_modules (syllabus + course structure), learnlight_search_materials (find content in course files/pages), learnlight_read_material (read one)${masteryTool}. Answer from the card when it already has what you need; when the student asks about course specifics beyond it — what a unit or exam covers, what was taught, how something was defined in class — look it up with one or two targeted calls instead of answering from general knowledge.`,
    "When the student asks for a document or link, give them the actual URL from tool results as a markdown link (canvasUrl for the material itself, or an entry from its links array). These open through the student's own school login — including Office365/SharePoint ones — so share them directly instead of describing where to click in Canvas.",
    'Only when an answer draws on course materials, end it with a one-line "Sources:" footer linking each material you actually used (markdown links via canvasUrl). If the materials conflict or you are not confident the answer matches what was taught in class, add a short caution (e.g. "low confidence — confirm with your teacher"). When you answered from your own knowledge, write no footer and no attribution at all — never "Sources: general knowledge".',
  );

  return lines.join('\n');
}

/**
 * Context card for chats opened from a specific assignment: the instructions, the
 * student's actual submitted work (text excerpt + file materialIds), and teacher
 * feedback, so the model can discuss what was turned in without a tool round-trip.
 */
export function buildAssignmentCard(assignment: LearnLightAssignment): string {
  const lines: string[] = [
    '[LearnLight assignment context — the student opened this chat from this assignment]',
    formatAssignmentHeadline(assignment),
  ];

  if (assignment.description) {
    lines.push(
      `Instructions (excerpt): ${truncateCard(assignment.description, CARD_INSTRUCTIONS_LIMIT)}`,
    );
  }

  const submission = assignment.submission;
  if (submission == null) {
    lines.push(
      "No submission synced for this assignment — the student hasn't turned anything in yet (or it was submitted in a format Canvas doesn't expose, like a quiz or media recording).",
    );
  } else {
    const submittedAt = formatDate(submission.submittedAt);
    lines.push(
      `Student's submission${submittedAt ? ` (submitted ${submittedAt}${submission.attempt != null && submission.attempt > 1 ? `, attempt ${submission.attempt}` : ''})` : ''}:`,
    );
    if (submission.body) {
      lines.push(
        `- Text entry (excerpt): ${truncateCard(submission.body, CARD_SUBMISSION_BODY_LIMIT)}`,
      );
      if (submission.bodyMaterialId) {
        lines.push(
          `  Full text via learnlight_read_material, materialId "${submission.bodyMaterialId}".`,
        );
      }
    }
    for (const attachment of submission.attachments ?? []) {
      lines.push(
        `- Submitted file: ${attachment.filename} — readable via learnlight_read_material, materialId "${attachment.materialId}".`,
      );
    }
    if (submission.submittedUrl) {
      lines.push(`- Submitted URL: ${submission.submittedUrl}`);
    }
  }

  const comments = assignment.teacherComments ?? [];
  if (comments.length > 0) {
    lines.push('Teacher feedback comments:');
    for (const comment of comments) {
      lines.push(
        `- ${comment.author ? `${comment.author}: ` : ''}${truncateCard(comment.comment, CARD_COMMENT_LIMIT)}`,
      );
    }
  }

  if (assignment.rubric != null && assignment.rubric.length > 0) {
    lines.push(
      `This assignment has a grading rubric (${assignment.rubric.length} criteria${
        assignment.rubric.some((line) => line.earnedPoints != null) ? ', already graded' : ''
      }) — get the per-criterion breakdown with learnlight_get_assignments query="${assignment.name}".`,
    );
  }

  return lines.join('\n');
}

function formatAssignmentHeadline(assignment: LearnLightAssignment): string {
  const parts = [`Assignment: ${assignment.name}`];
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
  if (assignment.score != null) {
    parts.push(
      `score ${assignment.score}${assignment.pointsPossible != null ? `/${assignment.pointsPossible}` : ''}`,
    );
  }
  return parts.join(' — ');
}

function truncateCard(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

function formatGradedLine(assignment: LearnLightAssignment): string {
  const parts = [assignment.name];

  if (
    assignment.score != null &&
    assignment.pointsPossible != null &&
    assignment.pointsPossible > 0
  ) {
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

function formatAssignmentLine(assignment: LearnLightAssignment): string {
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
    timeZone: getLearnLightTimezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(timestamp));
}
