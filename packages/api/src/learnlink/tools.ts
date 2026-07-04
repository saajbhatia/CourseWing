import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import { tool } from '@librechat/agents/langchain/tools';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { getAssignments, getModules, readMaterial, searchMaterials } from './service';

export const LEARNLINK_GET_ASSIGNMENTS = 'learnlink_get_assignments';
export const LEARNLINK_GET_MODULES = 'learnlink_get_modules';
export const LEARNLINK_SEARCH_MATERIALS = 'learnlink_search_materials';
export const LEARNLINK_READ_MATERIAL = 'learnlink_read_material';

export type LearnLinkToolKey =
  | typeof LEARNLINK_GET_ASSIGNMENTS
  | typeof LEARNLINK_GET_MODULES
  | typeof LEARNLINK_SEARCH_MATERIALS
  | typeof LEARNLINK_READ_MATERIAL;

export const learnLinkToolKeys: readonly LearnLinkToolKey[] = [
  LEARNLINK_GET_ASSIGNMENTS,
  LEARNLINK_GET_MODULES,
  LEARNLINK_SEARCH_MATERIALS,
  LEARNLINK_READ_MATERIAL,
];

export function isLearnLinkToolKey(toolKey: string): toolKey is LearnLinkToolKey {
  return (learnLinkToolKeys as readonly string[]).includes(toolKey);
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
  logger.warn(`[LearnLink] ${toolKey} failed: ${message}`);
  return `Canvas data is temporarily unavailable (${message}). Let the student know and answer from general knowledge if possible.`;
}

function createGetAssignmentsTool(): DynamicStructuredTool {
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
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLINK_GET_ASSIGNMENTS, error);
      }
    },
    {
      name: LEARNLINK_GET_ASSIGNMENTS,
      description:
        "Get the student's Canvas assignments plus a gradeSummary with the official current course score and assignment-group weights (e.g. Tests 75%). Each assignment has due date, points, submission status, score/grade, its grading group, and optionally full instructions with linked files. Use for questions about homework, deadlines, grades, grade weighting, or what an assignment requires.",
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
            'Include full assignment instructions. Use when the student needs help doing the work.',
          ),
        limit: z.number().int().min(1).max(50).optional().describe('Max results, default 20.'),
      }),
    },
  );
}

function createGetModulesTool(): DynamicStructuredTool {
  return tool(
    async ({ canvasCourseId }) => {
      try {
        const result = await getModules(canvasCourseId);
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLINK_GET_MODULES, error);
      }
    },
    {
      name: LEARNLINK_GET_MODULES,
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

function createSearchMaterialsTool(): DynamicStructuredTool {
  return tool(
    async ({ query, canvasCourseId, limit }) => {
      try {
        const result = await searchMaterials({ query, canvasCourseId, limit });
        if (result.hits.length === 0) {
          return `No course materials matched "${query}". Try different keywords, or use learnlink_get_modules to browse the course structure.`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLINK_SEARCH_MATERIALS, error);
      }
    },
    {
      name: LEARNLINK_SEARCH_MATERIALS,
      description:
        "Full-text search across synced Canvas course content: files (study guides, readings, handouts), Canvas pages (unit overviews, lessons), and syllabi. Returns matching excerpts with a materialId for learnlink_read_material. Use before answering questions that should be grounded in the course's own materials.",
      schema: z.object({
        query: z.string().describe('Keywords to search for (topic, concept, chapter, etc.).'),
        canvasCourseId: courseIdParam,
        limit: z.number().int().min(1).max(20).optional().describe('Max excerpts, default 6.'),
      }),
    },
  );
}

function createReadMaterialTool(): DynamicStructuredTool {
  return tool(
    async ({ materialId, page }) => {
      try {
        const result = await readMaterial({ materialId, page });
        if (result.status !== 'ok') {
          return `"${result.title}" has no readable text (${result.error ?? result.status}).`;
        }
        return toToolResult(result);
      } catch (error) {
        return toToolError(LEARNLINK_READ_MATERIAL, error);
      }
    },
    {
      name: LEARNLINK_READ_MATERIAL,
      description:
        'Read the extracted text of a synced Canvas material (file, page, or syllabus), one page (~4000 characters) at a time. Use after learnlink_search_materials when an excerpt is not enough, or when the student asks about a whole document. For a course file, the materialId is "<courseId>:file:<canvasFileId>". Check totalPages to read further pages. Results may include a links array of documents referenced by the material — file links are readable via their canvasFileId, and external links carry a url you can give the student directly.',
      schema: z.object({
        materialId: z
          .string()
          .describe(
            'Material ID from learnlink_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
          ),
        page: z.number().int().min(1).optional().describe('Page number, starting at 1.'),
      }),
    },
  );
}

const toolFactories: Record<LearnLinkToolKey, () => DynamicStructuredTool> = {
  [LEARNLINK_GET_ASSIGNMENTS]: createGetAssignmentsTool,
  [LEARNLINK_GET_MODULES]: createGetModulesTool,
  [LEARNLINK_SEARCH_MATERIALS]: createSearchMaterialsTool,
  [LEARNLINK_READ_MATERIAL]: createReadMaterialTool,
};

export function createLearnLinkTool(toolKey: LearnLinkToolKey): DynamicStructuredTool {
  return toolFactories[toolKey]();
}
