import type { ToolRegistryDefinition } from '~/tools/registry/definitions';
import {
  LEARNLIGHT_GET_ASSIGNMENTS,
  LEARNLIGHT_GET_MASTERY,
  LEARNLIGHT_GET_MODULES,
  LEARNLIGHT_READ_MATERIAL,
  LEARNLIGHT_SEARCH_MATERIALS,
  LEARNLIGHT_SEND_FEEDBACK,
} from './tools';

const courseIdDescription =
  "Canvas course ID. Use the ID from the conversation's course context when present; omit to cover all of the student's current courses.";

export const learnLightToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [LEARNLIGHT_GET_ASSIGNMENTS]: {
    name: LEARNLIGHT_GET_ASSIGNMENTS,
    description:
      "Get the student's Canvas assignments plus a gradeSummary with the official current course score and assignment-group weights (e.g. Tests 75%). Each assignment has due date, points, submission status, score/grade, and its grading group. Detailed results (withDescriptions=true, or automatic when ≤3 assignments match) also include the full instructions with linked files, the grading rubric with the student's per-criterion earned points/rating and any teacher comments, and teacher feedback on the submission. Use for questions about homework, deadlines, grades, grade weighting, what an assignment requires, or how a graded assignment was scored — narrow with query to get the full rubric breakdown for one assignment.",
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
  [LEARNLIGHT_GET_MASTERY]: {
    name: LEARNLIGHT_GET_MASTERY,
    description:
      "Get the student's Canvas Learning Mastery gradebook: each learning outcome/standard (e.g. \"Analyzing and interpreting data\") with the student's current score, the mastery threshold, a rating on the course's scale (Exemplary/Accomplished/Developing…), how many times it was assessed, and the most recent assessment. Use for questions about learning mastery, outcomes, standards, skills, or which areas the student is strongest/weakest in. Courses without published outcomes return an empty list — then infer strengths from assignment scores instead.",
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
  [LEARNLIGHT_GET_MODULES]: {
    name: LEARNLIGHT_GET_MODULES,
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
  [LEARNLIGHT_SEARCH_MATERIALS]: {
    name: LEARNLIGHT_SEARCH_MATERIALS,
    description:
      "Full-text search across synced Canvas course content: files (study guides, readings, handouts), Canvas pages (unit overviews, lessons), and syllabi. Returns matching excerpts with a materialId for learnlight_read_material. Use before answering questions that should be grounded in the course's own materials.",
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
  [LEARNLIGHT_READ_MATERIAL]: {
    name: LEARNLIGHT_READ_MATERIAL,
    description:
      'Read the extracted text of a synced Canvas material (file, page, or syllabus), one page (~4000 characters) at a time. Use after learnlight_search_materials when an excerpt is not enough, or when the student asks about a whole document. For a course file, the materialId is "<courseId>:file:<canvasFileId>". Check totalPages to read further pages. Results may include a links array of documents referenced by the material — file links are readable via their canvasFileId, and external links carry a url you can give the student directly.',
    schema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description:
            'Material ID from learnlight_search_materials results, or "<courseId>:file:<canvasFileId>" for a file referenced in modules or assignment links.',
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
  [LEARNLIGHT_SEND_FEEDBACK]: {
    name: LEARNLIGHT_SEND_FEEDBACK,
    description:
      "Send the student's feedback ABOUT LEARNLIGHT ITSELF (this AI tutor app) to the LearnLight team: bug reports, feature ideas, confusing behavior, praise, complaints about the app. Use when the student expresses feedback about the app — not about their coursework, teachers, or grades. Send it right away with their feedback as the message; the result will tell you what to say next.",
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            "The student's feedback in their own words (lightly cleaned up). Required when sending new feedback; omit on a shareChat-only follow-up call.",
        },
        category: {
          type: 'string',
          enum: ['bug', 'idea', 'praise', 'other'],
          description: 'What kind of feedback this is.',
        },
        shareChat: {
          type: 'boolean',
          description:
            'Set true ONLY after the student explicitly agrees to share this chat with the team. Call with shareChat=true and no message to attach the chat to feedback already sent.',
        },
      },
    },
    toolType: 'custom',
  },
};
