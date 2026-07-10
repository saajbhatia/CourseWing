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

export const LEARNLIGHT_GET_ASSIGNMENTS = 'learnlight_get_assignments';
export const LEARNLIGHT_GET_MASTERY = 'learnlight_get_mastery';
export const LEARNLIGHT_GET_MODULES = 'learnlight_get_modules';
export const LEARNLIGHT_SEARCH_MATERIALS = 'learnlight_search_materials';
export const LEARNLIGHT_READ_MATERIAL = 'learnlight_read_material';
export const LEARNLIGHT_SEND_FEEDBACK = 'learnlight_send_feedback';

export type LearnLightToolKey =
  | typeof LEARNLIGHT_GET_ASSIGNMENTS
  | typeof LEARNLIGHT_GET_MASTERY
  | typeof LEARNLIGHT_GET_MODULES
  | typeof LEARNLIGHT_SEARCH_MATERIALS
  | typeof LEARNLIGHT_READ_MATERIAL
  | typeof LEARNLIGHT_SEND_FEEDBACK;

export const learnLightToolKeys: readonly LearnLightToolKey[] = [
  LEARNLIGHT_GET_ASSIGNMENTS,
  LEARNLIGHT_GET_MASTERY,
  LEARNLIGHT_GET_MODULES,
  LEARNLIGHT_SEARCH_MATERIALS,
  LEARNLIGHT_READ_MATERIAL,
  LEARNLIGHT_SEND_FEEDBACK,
];

export function isLearnLightToolKey(toolKey: string): toolKey is LearnLightToolKey {
  return (learnLightToolKeys as readonly string[]).includes(toolKey);
}

const courseIdParam = z
  .number()
  .int()
  .optional()
  .describe(
    "Canvas course ID. Use the ID from the conversation's course context when present; omit to cover all of the student's current courses.",
  );

function toToolResult(payload: unknown): string {
  return JSON.stringify(payload);
}

function toToolError(toolKey: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`[LearnLight] ${toolKey} failed: ${message}`);
  return `Canvas data is temporarily unavailable (${message}). Let the student know and answer from general knowledge if possible.`;
}

export type LearnLightToolOptions = {
  tenantId?: string | null;
  conversationId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

const SYNC_PENDING_MESSAGE =
  "This student's Canvas account is still syncing — their courses and assignments aren't fully available yet. Tell the student their Canvas data is still syncing (this usually takes a few minutes after connecting) and to check back shortly. Do NOT guess or invent course information in the meantime.";

/** Empty results on a freshly connected account usually mean the first sync hasn't finished, not that the student has no courses. */
async function syncPendingMessage(tenantId?: string | null): Promise<string | null> {
  const status = await getTenantStatusSafe(tenantId);
  if (status != null && (status.syncing || status.lastSyncAt == null)) {
    return SYNC_PENDING_MESSAGE;
  }
  return null;
}

function createGetAssignmentsTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
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
        return toToolError(LEARNLIGHT_GET_ASSIGNMENTS, error);
      }
    },
    {
      name: LEARNLIGHT_GET_ASSIGNMENTS,
      description:
        "Get the student's Canvas assignments plus a gradeSummary with the official current course score and assignment-group weights (e.g. Tests 75%). Each assignment has due date, points, submission status, score/grade, and its grading group. Detailed results (withDescriptions=true, or automatic when ≤3 assignments match) also include the full instructions with linked files, the grading rubric with the student's per-criterion earned points/rating and any teacher comments, and teacher feedback on the submission. Use for questions about homework, deadlines, grades, grade weighting, what an assignment requires, or how a graded assignment was scored — narrow with query to get the full rubric breakdown for one assignment.",
      schema: z.object({
        canvasCourseId: courseIdParam,
        filter: z
          .enum(['upcoming', 'past', 'undated', 'all'])
          .optional()
          .describe(
            'Which assignments to return. Defaults to upcoming (soonest first); past/all return most recent first. If the result says truncated=true, narrow with query or dueAfter/dueBefore rather than assuming you saw everything.',
          ),
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

function createGetMasteryTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId }) => {
      try {
        const result = await getMastery({ canvasCourseId, tenantId: toolOptions.tenantId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLIGHT_GET_MASTERY, error);
      }
    },
    {
      name: LEARNLIGHT_GET_MASTERY,
      description:
        "Get the student's Canvas Learning Mastery gradebook: each learning outcome/standard (e.g. \"Analyzing and interpreting data\") with the student's current score, the mastery threshold, a rating on the course's scale (Exemplary/Accomplished/Developing…), how many times it was assessed, and the most recent assessment. Use for questions about learning mastery, outcomes, standards, skills, or which areas the student is strongest/weakest in. Courses without published outcomes return an empty list — then infer strengths from assignment scores instead.",
      schema: z.object({
        canvasCourseId: courseIdParam,
      }),
    },
  );
}

function createGetModulesTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId }) => {
      try {
        const result = await getModules(canvasCourseId, { tenantId: toolOptions.tenantId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLIGHT_GET_MODULES, error);
      }
    },
    {
      name: LEARNLIGHT_GET_MODULES,
      description:
        'Get the course syllabus (when posted) and the structure of a Canvas course: its modules/units in order, with the items (pages, files, assignments) inside each. Use for syllabus questions, "what\'s in Unit 3", or "what does this class cover".',
      schema: z.object({
        canvasCourseId: z
          .number()
          .int()
          .describe("Canvas course ID (from the conversation's course context)."),
      }),
    },
  );
}

function createSearchMaterialsTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
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
          return `No course materials matched "${query}". Try different keywords, or use learnlight_get_modules to browse the course structure.`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLIGHT_SEARCH_MATERIALS, error);
      }
    },
    {
      name: LEARNLIGHT_SEARCH_MATERIALS,
      description:
        "Full-text search across synced Canvas course content: files (study guides, readings, handouts), Canvas pages (unit overviews, lessons), and syllabi. Returns matching excerpts with a materialId for learnlight_read_material. Use before answering questions that should be grounded in the course's own materials.",
      schema: z.object({
        query: z.string().describe('Keywords to search for (topic, concept, chapter, etc.).'),
        canvasCourseId: courseIdParam,
        limit: z.number().int().min(1).max(20).optional().describe('Max excerpts, default 6.'),
      }),
    },
  );
}

function createReadMaterialTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
  return tool(
    async ({ materialId, page }) => {
      try {
        const result = await readMaterial({ materialId, page, tenantId: toolOptions.tenantId });
        if (result.status !== 'ok') {
          return `"${result.title}" has no readable text (${result.error ?? result.status}).`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLIGHT_READ_MATERIAL, error);
      }
    },
    {
      name: LEARNLIGHT_READ_MATERIAL,
      description:
        'Read the extracted text of a synced Canvas material (file, page, or syllabus), one page (~4000 characters) at a time. Use after learnlight_search_materials when an excerpt is not enough, or when the student asks about a whole document. For a course file, the materialId is "<courseId>:file:<canvasFileId>". Check totalPages to read further pages. Results may include a links array of documents referenced by the material — file links are readable via their canvasFileId, and external links carry a url you can give the student directly.',
      schema: z.object({
        materialId: z
          .string()
          .describe(
            'Material ID from learnlight_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
          ),
        page: z.number().int().min(1).optional().describe('Page number, starting at 1.'),
      }),
    },
  );
}

const FEEDBACK_SENT_ASK_SHARE =
  'Feedback sent to the LearnLight team — thank the student. Then ask ONE short follow-up question: would they like to share this chat along with the feedback so the team can see the full context? If they say yes, call learnlight_send_feedback again with only shareChat=true. If they decline, drop it.';

const FEEDBACK_SENT_WITH_CHAT =
  'Feedback sent to the LearnLight team with this chat attached — thank the student.';

const CHAT_SHARED = 'This chat is now attached to the feedback — thank the student.';

const CHAT_SHARE_FAILED =
  'There was no earlier feedback from this chat to attach it to — send the feedback with a message first.';

function createSendFeedbackTool(toolOptions: LearnLightToolOptions): DynamicStructuredTool {
  return tool(
    async ({ message, category, shareChat }) => {
      try {
        if (message == null && shareChat !== true) {
          return 'Nothing was sent — include the feedback message.';
        }
        const result = await sendFeedback({
          message,
          category,
          shareChat,
          conversationId: toolOptions.conversationId,
          userName: toolOptions.userName,
          userEmail: toolOptions.userEmail,
          tenantId: toolOptions.tenantId,
        });
        if (message != null) {
          return shareChat === true ? FEEDBACK_SENT_WITH_CHAT : FEEDBACK_SENT_ASK_SHARE;
        }
        return (result.updated ?? 0) > 0 ? CHAT_SHARED : CHAT_SHARE_FAILED;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn(`[LearnLight] ${LEARNLIGHT_SEND_FEEDBACK} failed: ${detail}`);
        return 'Sending feedback failed — apologize to the student and suggest trying again later.';
      }
    },
    {
      name: LEARNLIGHT_SEND_FEEDBACK,
      description:
        "Send the student's feedback ABOUT LEARNLIGHT ITSELF (this AI tutor app) to the LearnLight team: bug reports, feature ideas, confusing behavior, praise, complaints about the app. Use when the student expresses feedback about the app — not about their coursework, teachers, or grades. Send it right away with their feedback as the message; the result will tell you what to say next.",
      schema: z.object({
        message: z
          .string()
          .optional()
          .describe(
            "The student's feedback in their own words (lightly cleaned up). Required when sending new feedback; omit on a shareChat-only follow-up call.",
          ),
        category: z
          .enum(['bug', 'idea', 'praise', 'other'])
          .optional()
          .describe('What kind of feedback this is.'),
        shareChat: z
          .boolean()
          .optional()
          .describe(
            'Set true ONLY after the student explicitly agrees to share this chat with the team. Call with shareChat=true and no message to attach the chat to feedback already sent.',
          ),
      }),
    },
  );
}

const toolFactories: Record<
  LearnLightToolKey,
  (toolOptions: LearnLightToolOptions) => DynamicStructuredTool
> = {
  [LEARNLIGHT_GET_ASSIGNMENTS]: createGetAssignmentsTool,
  [LEARNLIGHT_GET_MASTERY]: createGetMasteryTool,
  [LEARNLIGHT_GET_MODULES]: createGetModulesTool,
  [LEARNLIGHT_SEARCH_MATERIALS]: createSearchMaterialsTool,
  [LEARNLIGHT_READ_MATERIAL]: createReadMaterialTool,
  [LEARNLIGHT_SEND_FEEDBACK]: createSendFeedbackTool,
};

export function createLearnLightTool(
  toolKey: LearnLightToolKey,
  toolOptions: LearnLightToolOptions = {},
): DynamicStructuredTool {
  return toolFactories[toolKey](toolOptions);
}
