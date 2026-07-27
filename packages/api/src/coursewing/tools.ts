import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import { tool } from '@librechat/agents/langchain/tools';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import {
  getAssignments,
  getMastery,
  getModules,
  getTenantStatusSafe,
  readMaterial,
  searchMaterials,
  sendFeedback,
} from './service';

export const COURSEWING_GET_ASSIGNMENTS = 'coursewing_get_assignments';
export const COURSEWING_GET_MASTERY = 'coursewing_get_mastery';
export const COURSEWING_GET_MODULES = 'coursewing_get_modules';
export const COURSEWING_SEARCH_MATERIALS = 'coursewing_search_materials';
export const COURSEWING_READ_MATERIAL = 'coursewing_read_material';
export const COURSEWING_SEND_FEEDBACK = 'coursewing_send_feedback';

export type CourseWingToolKey =
  | typeof COURSEWING_GET_ASSIGNMENTS
  | typeof COURSEWING_GET_MASTERY
  | typeof COURSEWING_GET_MODULES
  | typeof COURSEWING_SEARCH_MATERIALS
  | typeof COURSEWING_READ_MATERIAL
  | typeof COURSEWING_SEND_FEEDBACK;

export const courseWingToolKeys: readonly CourseWingToolKey[] = [
  COURSEWING_GET_ASSIGNMENTS,
  COURSEWING_GET_MASTERY,
  COURSEWING_GET_MODULES,
  COURSEWING_SEARCH_MATERIALS,
  COURSEWING_READ_MATERIAL,
  COURSEWING_SEND_FEEDBACK,
];

export function isCourseWingToolKey(toolKey: string): toolKey is CourseWingToolKey {
  return (courseWingToolKeys as readonly string[]).includes(toolKey);
}

/** Single source of truth for tool/param descriptions — also consumed by the JSON registry definitions. */
export const courseWingToolDescriptions: Record<CourseWingToolKey, string> = {
  [COURSEWING_GET_ASSIGNMENTS]:
    "Get the student's Canvas assignments plus a gradeSummary with the official current course score and assignment-group weights (e.g. Tests 75%). Each assignment has due date, points, submission status, score/grade, and its grading group. Detailed results (withDescriptions=true, or automatic when ≤3 assignments match) also include the full instructions with linked files, the grading rubric with the student's per-criterion earned points/rating and any teacher comments, teacher feedback on the submission, and the student's own submitted work (text-entry excerpt with a materialId for the full text, uploaded files readable via coursewing_read_material, or a submitted URL). Use for questions about homework, deadlines, grades, grade weighting, what an assignment requires, how a graded assignment was scored, or what the student turned in — narrow with query to get the full breakdown for one assignment.",
  [COURSEWING_GET_MASTERY]:
    "Get the student's Canvas Learning Mastery gradebook: each learning outcome/standard (e.g. \"Analyzing and interpreting data\") with the student's current score, the mastery threshold, a rating on the course's scale (Exemplary/Accomplished/Developing…), how many times it was assessed, and the most recent assessment. Use for questions about learning mastery, outcomes, standards, skills, or which areas the student is strongest/weakest in. Courses without published outcomes return an empty list — then infer strengths from assignment scores instead.",
  [COURSEWING_GET_MODULES]:
    'Get the course syllabus (when posted) and the structure of a Canvas course: its modules/units in order, with the items (pages, files, assignments) inside each. Use for syllabus questions, "what\'s in Unit 3", or "what does this class cover".',
  [COURSEWING_SEARCH_MATERIALS]:
    'Full-text search across synced Canvas course content: files (study guides, readings, handouts), Canvas pages (unit overviews, lessons), syllabi, and the student\'s own submitted work (kind "submission"). Returns matching excerpts with a materialId for coursewing_read_material. Use before answering questions that should be grounded in the course\'s own materials.',
  [COURSEWING_READ_MATERIAL]:
    'Read the extracted text of a synced Canvas material (file, page, syllabus, or the student\'s own submission), one page (~4000 characters) at a time. Use after coursewing_search_materials when an excerpt is not enough, or when the student asks about a whole document — including their own submitted essay or file (submission materialIds appear in coursewing_get_assignments detail results). For a course file, the materialId is "<courseId>:file:<canvasFileId>". Check totalPages to read further pages. Results may include a links array of documents referenced by the material — file links are readable via their canvasFileId, and external links carry a url you can give the student directly.',
  [COURSEWING_SEND_FEEDBACK]:
    "Send the student's feedback ABOUT COURSEWING ITSELF (this AI tutor app) to the CourseWing team: bug reports, feature ideas, confusing behavior, praise, complaints about the app. Use when the student expresses feedback about the app — not about their coursework, teachers, or grades. Send it right away with their feedback as the message; the result will tell you what to say next.",
};

export const courseIdDescription =
  "Canvas course ID. Only pass an ID you have actually seen — from the conversation's course context or a previous tool result (get_assignments results include each course's ID). NEVER guess or invent an ID; when you don't have one, omit the parameter to cover all of the student's current courses.";

export const requiredCourseIdDescription =
  "Canvas course ID. Only pass an ID you have actually seen — from the conversation's course context or a previous tool result. If you don't have one, call coursewing_get_assignments first (its results include each course's ID). NEVER guess or invent an ID.";

export const assignmentFilterDescription =
  'Which assignments to return. Defaults to upcoming (soonest first); graded filters before applying the limit; past/all return most recent first. If the result says truncated=true, narrow with query or dueAfter/dueBefore rather than assuming you saw everything.';

const courseIdParam = z.number().int().optional().describe(courseIdDescription);

function toToolResult(payload: unknown): string {
  return JSON.stringify(payload);
}

function toToolError(toolKey: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`[CourseWing] ${toolKey} failed: ${message}`);
  if (message.includes('No synced course with canvas id')) {
    return `That canvas course ID does not exist (${message}). Do not tell the student the course is unsynced — the ID was wrong. Retry with a correct ID: use the ID from the conversation's course context or a previous tool result, or call coursewing_get_assignments (which lists each course's real ID) to find it.`;
  }
  return `Canvas data is temporarily unavailable (${message}). Let the student know and answer from general knowledge if possible.`;
}

export type CourseWingToolOptions = {
  tenantId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

const SYNC_PENDING_MESSAGE =
  "This student's Canvas account is still syncing — their courses and assignments aren't fully available yet. Tell the student their Canvas data is still syncing (this usually takes a few minutes after connecting) and to check back shortly. Do NOT guess or invent course information in the meantime.";

const SYNC_FAILED_MESSAGE =
  "This student's school account is connected but could not be synced — the school may not allow access, or a permission was declined while connecting. Tell the student their courses could not be loaded and to try reconnecting from Settings → Account (approving all permissions), or to ask their teacher for help. Do NOT tell them to simply wait, and do NOT guess or invent course information.";

/** Empty results on a freshly connected account usually mean the first sync hasn't finished, not that the student has no courses. */
async function syncPendingMessage(tenantId?: string | null): Promise<string | null> {
  const status = await getTenantStatusSafe(tenantId);
  if (status == null) {
    return null;
  }
  if (status.syncing) {
    return SYNC_PENDING_MESSAGE;
  }
  if (status.lastSyncAt == null) {
    return status.lastSyncError ? SYNC_FAILED_MESSAGE : SYNC_PENDING_MESSAGE;
  }
  return null;
}

function createGetAssignmentsTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId, filter, query, dueAfter, dueBefore, withDescriptions, limit }) => {
      try {
        const result = await getAssignments({
          canvasCourseId,
          filter,
          query,
          dueAfter,
          dueBefore,
          withDescriptions,
          limit,
          tenantId: toolOptions.tenantId,
        });
        if (result.assignments.length === 0) {
          const pending = await syncPendingMessage(toolOptions.tenantId);
          if (pending != null) {
            return pending;
          }
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(COURSEWING_GET_ASSIGNMENTS, error);
      }
    },
    {
      name: COURSEWING_GET_ASSIGNMENTS,
      description: courseWingToolDescriptions[COURSEWING_GET_ASSIGNMENTS],
      schema: z.object({
        canvasCourseId: courseIdParam,
        filter: z
          .enum(['upcoming', 'past', 'graded', 'undated', 'all'])
          .optional()
          .describe(assignmentFilterDescription),
        query: z.string().optional().describe('Filter assignments by name (substring match).'),
        dueAfter: z
          .string()
          .optional()
          .describe(
            'Only assignments due on/after this ISO date (e.g. "2026-01-01" for spring semester).',
          ),
        dueBefore: z.string().optional().describe('Only assignments due on/before this ISO date.'),
        withDescriptions: z
          .boolean()
          .optional()
          .describe(
            'Include full assignment instructions, linked files, the grading rubric with per-criterion scores, and teacher feedback. Use when the student needs help doing the work or understanding their grade.',
          ),
        limit: z.number().int().min(1).max(50).optional().describe('Max results, default 20.'),
      }),
    },
  );
}

function createGetMasteryTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId }) => {
      try {
        const result = await getMastery({ canvasCourseId, tenantId: toolOptions.tenantId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(COURSEWING_GET_MASTERY, error);
      }
    },
    {
      name: COURSEWING_GET_MASTERY,
      description: courseWingToolDescriptions[COURSEWING_GET_MASTERY],
      schema: z.object({
        canvasCourseId: courseIdParam,
      }),
    },
  );
}

function createGetModulesTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId }) => {
      try {
        const result = await getModules(canvasCourseId, { tenantId: toolOptions.tenantId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(COURSEWING_GET_MODULES, error);
      }
    },
    {
      name: COURSEWING_GET_MODULES,
      description: courseWingToolDescriptions[COURSEWING_GET_MODULES],
      schema: z.object({
        canvasCourseId: z.number().int().describe(requiredCourseIdDescription),
      }),
    },
  );
}

function createSearchMaterialsTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ query, canvasCourseId, limit }) => {
      try {
        const result = await searchMaterials({
          query,
          canvasCourseId,
          limit,
          tenantId: toolOptions.tenantId,
        });
        if (result.hits.length === 0) {
          const pending = await syncPendingMessage(toolOptions.tenantId);
          if (pending != null) {
            return pending;
          }
          return `No course materials matched "${query}". Try different keywords, or use coursewing_get_modules to browse the course structure.`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(COURSEWING_SEARCH_MATERIALS, error);
      }
    },
    {
      name: COURSEWING_SEARCH_MATERIALS,
      description: courseWingToolDescriptions[COURSEWING_SEARCH_MATERIALS],
      schema: z.object({
        query: z.string().describe('Keywords to search for (topic, concept, chapter, etc.).'),
        canvasCourseId: courseIdParam,
        limit: z.number().int().min(1).max(20).optional().describe('Max excerpts, default 6.'),
      }),
    },
  );
}

function createReadMaterialTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ materialId, page }) => {
      try {
        const result = await readMaterial({ materialId, page, tenantId: toolOptions.tenantId });
        if (result.status !== 'ok') {
          return `"${result.title}" has no readable text (${result.error ?? result.status}).`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(COURSEWING_READ_MATERIAL, error);
      }
    },
    {
      name: COURSEWING_READ_MATERIAL,
      description: courseWingToolDescriptions[COURSEWING_READ_MATERIAL],
      schema: z.object({
        materialId: z
          .string()
          .describe(
            'Material ID from coursewing_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
          ),
        page: z.number().int().min(1).optional().describe('Page number, starting at 1.'),
      }),
    },
  );
}

const FEEDBACK_SENT = 'Feedback sent to the CourseWing team — thank the student.';

function createSendFeedbackTool(toolOptions: CourseWingToolOptions): DynamicStructuredTool {
  return tool(
    async ({ message, category }) => {
      try {
        if (message == null) {
          return 'Nothing was sent — include the feedback message.';
        }
        await sendFeedback({
          message,
          category,
          userName: toolOptions.userName,
          userEmail: toolOptions.userEmail,
          tenantId: toolOptions.tenantId,
        });
        return FEEDBACK_SENT;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn(`[CourseWing] ${COURSEWING_SEND_FEEDBACK} failed: ${detail}`);
        return 'Sending feedback failed — apologize to the student and suggest trying again later.';
      }
    },
    {
      name: COURSEWING_SEND_FEEDBACK,
      description: courseWingToolDescriptions[COURSEWING_SEND_FEEDBACK],
      schema: z.object({
        message: z
          .string()
          .max(10_000)
          .optional()
          .describe("The student's feedback in their own words (lightly cleaned up)."),
        category: z
          .enum(['bug', 'idea', 'praise', 'other'])
          .optional()
          .describe('What kind of feedback this is.'),
      }),
    },
  );
}

const toolFactories: Record<
  CourseWingToolKey,
  (toolOptions: CourseWingToolOptions) => DynamicStructuredTool
> = {
  [COURSEWING_GET_ASSIGNMENTS]: createGetAssignmentsTool,
  [COURSEWING_GET_MASTERY]: createGetMasteryTool,
  [COURSEWING_GET_MODULES]: createGetModulesTool,
  [COURSEWING_SEARCH_MATERIALS]: createSearchMaterialsTool,
  [COURSEWING_READ_MATERIAL]: createReadMaterialTool,
  [COURSEWING_SEND_FEEDBACK]: createSendFeedbackTool,
};

export function createCourseWingTool(
  toolKey: CourseWingToolKey,
  toolOptions: CourseWingToolOptions = {},
): DynamicStructuredTool {
  return toolFactories[toolKey](toolOptions);
}
