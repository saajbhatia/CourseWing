import type { ToolRegistryDefinition } from '~/tools/registry/definitions';
import {
  LEARNLINK_GET_ASSIGNMENTS,
  LEARNLINK_GET_MODULES,
  LEARNLINK_READ_MATERIAL,
  LEARNLINK_SEARCH_MATERIALS,
} from './tools';

const courseIdDescription =
  "Canvas course ID. Use the ID from the conversation's course context when present; omit to cover all of the student's current courses.";

export const learnLinkToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [LEARNLINK_GET_ASSIGNMENTS]: {
    name: LEARNLINK_GET_ASSIGNMENTS,
    description:
      "Get the student's Canvas assignments plus a gradeSummary with the official current course score and assignment-group weights (e.g. Tests 75%). Each assignment has due date, points, submission status, score/grade, its grading group, and optionally full instructions with linked files. Use for questions about homework, deadlines, grades, grade weighting, or what an assignment requires.",
    schema: {
      type: 'object',
      properties: {
        canvasCourseId: {
          type: 'integer',
          description: courseIdDescription,
        },
        filter: {
          type: 'string',
          enum: ['upcoming', 'past', 'undated', 'all'],
          description:
            'Which assignments to return. Defaults to upcoming (soonest first); past/all return most recent first. If the result says truncated=true, narrow with query or dueAfter/dueBefore rather than assuming you saw everything.',
        },
        query: {
          type: 'string',
          description: 'Filter assignments by name (substring match).',
        },
        dueAfter: {
          type: 'string',
          description:
            'Only assignments due on/after this ISO date (e.g. "2026-01-01" for spring semester).',
        },
        dueBefore: {
          type: 'string',
          description: 'Only assignments due on/before this ISO date.',
        },
        withDescriptions: {
          type: 'boolean',
          description:
            'Include full assignment instructions. Use when the student needs help doing the work.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Max results, default 20.',
        },
      },
    },
    toolType: 'custom',
  },
  [LEARNLINK_GET_MODULES]: {
    name: LEARNLINK_GET_MODULES,
    description:
      'Get the course syllabus (when posted) and the structure of a Canvas course: its modules/units in order, with the items (pages, files, assignments) inside each. Use for syllabus questions, "what\'s in Unit 3", or "what does this class cover".',
    schema: {
      type: 'object',
      properties: {
        canvasCourseId: {
          type: 'integer',
          description: "Canvas course ID (from the conversation's course context).",
        },
      },
      required: ['canvasCourseId'],
    },
    toolType: 'custom',
  },
  [LEARNLINK_SEARCH_MATERIALS]: {
    name: LEARNLINK_SEARCH_MATERIALS,
    description:
      "Full-text search across synced Canvas course content: files (study guides, readings, handouts), Canvas pages (unit overviews, lessons), and syllabi. Returns matching excerpts with a materialId for learnlink_read_material. Use before answering questions that should be grounded in the course's own materials.",
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords to search for (topic, concept, chapter, etc.).',
        },
        canvasCourseId: {
          type: 'integer',
          description: courseIdDescription,
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Max excerpts, default 6.',
        },
      },
      required: ['query'],
    },
    toolType: 'custom',
  },
  [LEARNLINK_READ_MATERIAL]: {
    name: LEARNLINK_READ_MATERIAL,
    description:
      'Read the extracted text of a synced Canvas material (file, page, or syllabus), one page (~4000 characters) at a time. Use after learnlink_search_materials when an excerpt is not enough, or when the student asks about a whole document. For a course file, the materialId is "<courseId>:file:<canvasFileId>". Check totalPages to read further pages. Results may include a links array of documents referenced by the material — file links are readable via their canvasFileId, and external links carry a url you can give the student directly.',
    schema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description:
            'Material ID from learnlink_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: 'Page number, starting at 1.',
        },
      },
      required: ['materialId'],
    },
    toolType: 'custom',
  },
};
