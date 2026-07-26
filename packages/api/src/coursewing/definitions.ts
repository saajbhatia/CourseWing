import type { ToolRegistryDefinition } from '~/tools/registry/definitions';
import {
  COURSEWING_GET_ASSIGNMENTS,
  COURSEWING_GET_MASTERY,
  COURSEWING_GET_MODULES,
  COURSEWING_READ_MATERIAL,
  COURSEWING_SEARCH_MATERIALS,
  COURSEWING_SEND_FEEDBACK,
  courseWingToolDescriptions,
  courseIdDescription,
  requiredCourseIdDescription,
  assignmentFilterDescription,
} from './tools';

export const courseWingToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [COURSEWING_GET_ASSIGNMENTS]: {
    name: COURSEWING_GET_ASSIGNMENTS,
    description: courseWingToolDescriptions[COURSEWING_GET_ASSIGNMENTS],
    schema: {
      type: 'object',
      properties: {
        canvasCourseId: {
          type: 'integer',
          description: courseIdDescription,
        },
        filter: {
          type: 'string',
          enum: ['upcoming', 'past', 'graded', 'undated', 'all'],
          description: assignmentFilterDescription,
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
            'Include full assignment instructions, linked files, the grading rubric with per-criterion scores, and teacher feedback. Use when the student needs help doing the work or understanding their grade.',
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
  [COURSEWING_GET_MASTERY]: {
    name: COURSEWING_GET_MASTERY,
    description: courseWingToolDescriptions[COURSEWING_GET_MASTERY],
    schema: {
      type: 'object',
      properties: {
        canvasCourseId: {
          type: 'integer',
          description: courseIdDescription,
        },
      },
    },
    toolType: 'custom',
  },
  [COURSEWING_GET_MODULES]: {
    name: COURSEWING_GET_MODULES,
    description: courseWingToolDescriptions[COURSEWING_GET_MODULES],
    schema: {
      type: 'object',
      properties: {
        canvasCourseId: {
          type: 'integer',
          description: requiredCourseIdDescription,
        },
      },
      required: ['canvasCourseId'],
    },
    toolType: 'custom',
  },
  [COURSEWING_SEARCH_MATERIALS]: {
    name: COURSEWING_SEARCH_MATERIALS,
    description: courseWingToolDescriptions[COURSEWING_SEARCH_MATERIALS],
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
  [COURSEWING_READ_MATERIAL]: {
    name: COURSEWING_READ_MATERIAL,
    description: courseWingToolDescriptions[COURSEWING_READ_MATERIAL],
    schema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description:
            'Material ID from coursewing_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
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
  [COURSEWING_SEND_FEEDBACK]: {
    name: COURSEWING_SEND_FEEDBACK,
    description: courseWingToolDescriptions[COURSEWING_SEND_FEEDBACK],
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          maxLength: 10000,
          description: "The student's feedback in their own words (lightly cleaned up).",
        },
        category: {
          type: 'string',
          enum: ['bug', 'idea', 'praise', 'other'],
          description: 'What kind of feedback this is.',
        },
      },
    },
    toolType: 'custom',
  },
};
