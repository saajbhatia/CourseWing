import type {
  CourseWorkMetadata,
  ICourseLink,
  ICourseReportSection,
  IUser,
} from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type {
  CourseService,
  CreateCourseAiUseInput,
  CreateCourseFeedbackInput,
  CreateCourseMilestoneInput,
  CreateCourseProjectInput,
  CreateCoursePostInput,
  CreateCourseTeamInput,
  CreateCourseTimeInput,
  CreateCourseWorkInput,
  UpdateCourseProjectInput,
  UpdateCourseFeedbackInput,
  UpdateCourseProfileInput,
} from './service';
import { courseServiceError } from './service';

type CourseBody = {
  name?: string;
  description?: string;
  emails?: string[];
  memberIds?: string[];
  title?: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: UpdateCourseProjectInput['technicalRoute'];
  risks?: string[];
  links?: ICourseLink[];
  collaboratorEmails?: string[];
  preferredName?: string;
  interests?: string[];
  bio?: string;
  website?: string;
  github?: string;
  projectId?: string;
  studentId?: string;
  status?: CreateCourseMilestoneInput['status'];
  teamId?: string;
  milestoneId?: string;
  kind?: string;
  fileIds?: string[];
  source?: CreateCourseWorkInput['source'];
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  sourceKey?: string;
  versionOf?: string;
  portfolioState?: CreateCourseWorkInput['portfolioState'];
  aiSummary?: string;
  reflection?: string;
  metadata?: CourseWorkMetadata;
  workId?: string;
  date?: string;
  minutes?: number;
  category?: CreateCourseTimeInput['category'];
  customCategory?: string;
  outcome?: string;
  evidenceUrl?: string;
  tool?: string;
  task?: string;
  output?: string;
  reviewed?: boolean;
  safetyNotes?: string;
  learning?: string;
  visibility?: CreateCourseFeedbackInput['visibility'];
  content?: string;
  actionItems?: Array<{ text: string }>;
  studentResponse?: string;
  connectedRevisionId?: string;
  actionItemId?: string;
  actionStatus?: UpdateCourseFeedbackInput['actionStatus'];
  body?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  dueAt?: string | null;
  posts?: CreateCoursePostInput[];
  sections?: ICourseReportSection[];
};

type CourseRequest = Request<Record<string, string>, object, CourseBody> & {
  user?: IUser;
};

export type CourseRegistrationClaim = {
  token: string;
  expiresAt: string;
};

export type CourseHandlerOptions = {
  createRegistrationClaim?: (input: {
    email: string;
    courseId: string;
    invitedBy: string;
  }) => Promise<CourseRegistrationClaim>;
  createShareRegistrationClaim?: (input: {
    courseId: string;
    invitedBy: string;
  }) => Promise<CourseRegistrationClaim>;
  registrationBaseUrl?: string;
};

const WORK_KINDS = new Set([
  'paper',
  'presentation',
  'project',
  'portfolio',
  'reflection',
  'other',
]);
const POST_KINDS = new Set(['announcement', 'resource', 'deadline', 'schedule']);
const REPORT_KINDS = new Set(['progress', 'final']);

function getUserId(req: CourseRequest): string {
  return req.user?.id ?? req.user?._id?.toString() ?? '';
}

function getUserEmail(req: CourseRequest): string {
  return req.user?.email ?? '';
}

function canCreateCourses(req: CourseRequest): boolean {
  return req.user?.courseRole === 'teacher' || req.user?.role === 'ADMIN';
}

function queryString(value: CourseRequest['query'][string]): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return queryString(value[0]);
  }
  return undefined;
}

function queryNumber(value: CourseRequest['query'][string]): number | undefined {
  const parsed = Number(queryString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredString(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function normalizeInviteEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validInviteEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildRegistrationUrl(
  baseUrl: string | undefined,
  input: { token: string; email?: string; courseId: string; courseName: string },
): string {
  const configuredBase = baseUrl?.trim();
  const url = configuredBase
    ? new URL(configuredBase)
    : new URL('/register', 'http://course-invite.local');
  if (configuredBase) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/register`;
    url.search = '';
    url.hash = '';
  }
  url.searchParams.set('token', input.token);
  if (input.email) {
    url.searchParams.set('email', input.email);
  }
  url.searchParams.set('course', input.courseId);
  url.searchParams.set('courseName', input.courseName);
  return configuredBase ? url.toString() : `${url.pathname}${url.search}`;
}

function handleError(res: Response, error: Error): Response {
  const result = courseServiceError(error);
  return res.status(result.status).json({ error: result.message });
}

export function createCourseHandlers(
  service: CourseService,
  options: CourseHandlerOptions = {},
): Record<string, (req: CourseRequest, res: Response) => Promise<Response>> {
  async function listCourses(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.listCourses(getUserId(req), getUserEmail(req)));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createCourse(req: CourseRequest, res: Response): Promise<Response> {
    const name = requiredString(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'Course name is required' });
    }
    try {
      if (!canCreateCourses(req)) {
        return res.status(403).json({ error: 'A teacher account is required to create courses' });
      }
      const course = await service.createCourse(getUserId(req), getUserEmail(req), {
        name,
        description: req.body.description,
      });
      return res.status(201).json(course);
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deleteCourse(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deleteCourse(getUserId(req), req.params.courseId);
      return res.status(200).json({ deleted: true });
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function getOverview(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.getOverview(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listMembers(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.listMembers(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function removeMember(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.removeMember(getUserId(req), req.params.courseId, req.params.memberId);
      return res.status(200).json({ deleted: true });
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function inviteMembers(req: CourseRequest, res: Response): Promise<Response> {
    if (!Array.isArray(req.body.emails)) {
      return res.status(400).json({ error: 'emails must be an array' });
    }
    if (req.body.emails.length === 0) {
      return res.status(400).json({ error: 'At least one email is required' });
    }
    if (req.body.emails.length > 200) {
      return res.status(400).json({ error: 'No more than 200 students can be invited at once' });
    }

    const orderedEmails: string[] = [];
    const seen = new Set<string>();
    const errors = new Map<string, string>();
    for (const rawEmail of req.body.emails) {
      const normalizedEmail = normalizeInviteEmail(rawEmail);
      const resultKey = normalizedEmail || String(rawEmail);
      if (seen.has(resultKey)) {
        continue;
      }
      seen.add(resultKey);
      orderedEmails.push(resultKey);
      if (!validInviteEmail(normalizedEmail)) {
        errors.set(resultKey, 'Enter a valid email address');
      }
    }
    const validEmails = orderedEmails.filter((email) => !errors.has(email));

    try {
      const courseAccess = await service.requireTeacher(getUserId(req), req.params.courseId);
      const members =
        validEmails.length > 0
          ? await service.inviteMembers(getUserId(req), req.params.courseId, {
              emails: validEmails,
            })
          : [];
      const membersByEmail = new Map(members.map((member) => [member.normalizedEmail, member]));
      const results = await Promise.all(
        orderedEmails.map(async (email) => {
          const validationError = errors.get(email);
          if (validationError) {
            return { email, status: 'error' as const, error: validationError };
          }
          const member = membersByEmail.get(email);
          if (!member) {
            return {
              email,
              status: 'error' as const,
              error: 'The invitation could not be created',
            };
          }
          if (member.state === 'active') {
            return { email, status: 'active' as const, member };
          }
          if (member.state !== 'pending') {
            return {
              email,
              status: 'error' as const,
              member,
              error: 'The invitation could not be activated',
            };
          }
          if (!options.createRegistrationClaim) {
            return {
              email,
              status: 'error' as const,
              member,
              error: 'Registration links are not configured',
            };
          }
          try {
            const claim = await options.createRegistrationClaim({
              email,
              courseId: req.params.courseId,
              invitedBy: getUserId(req),
            });
            return {
              email,
              status: 'pending' as const,
              member,
              registration: {
                token: claim.token,
                url: buildRegistrationUrl(options.registrationBaseUrl, {
                  token: claim.token,
                  email,
                  courseId: req.params.courseId,
                  courseName: courseAccess.course.name,
                }),
                expiresAt: claim.expiresAt,
              },
            };
          } catch {
            return {
              email,
              status: 'error' as const,
              member,
              error: 'The registration link could not be created',
            };
          }
        }),
      );
      return res.status(201).json(results);
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createShareLink(req: CourseRequest, res: Response): Promise<Response> {
    try {
      const courseAccess = await service.requireTeacher(getUserId(req), req.params.courseId);
      if (!options.createShareRegistrationClaim) {
        return res.status(503).json({ error: 'Course share links are not configured' });
      }
      const claim = await options.createShareRegistrationClaim({
        courseId: req.params.courseId,
        invitedBy: getUserId(req),
      });
      return res.status(201).json({
        token: claim.token,
        url: buildRegistrationUrl(options.registrationBaseUrl, {
          token: claim.token,
          courseId: req.params.courseId,
          courseName: courseAccess.course.name,
        }),
        expiresAt: claim.expiresAt,
      });
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function getProfile(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.getProfile(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateProfile(req: CourseRequest, res: Response): Promise<Response> {
    if (req.body.interests !== undefined && !Array.isArray(req.body.interests)) {
      return res.status(400).json({ error: 'interests must be an array' });
    }
    const input: UpdateCourseProfileInput = {
      preferredName: req.body.preferredName,
      interests: req.body.interests,
      bio: req.body.bio,
      website: req.body.website,
      github: req.body.github,
    };
    try {
      return res
        .status(200)
        .json(await service.updateProfile(getUserId(req), req.params.courseId, input));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listTeams(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.listTeams(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createTeam(req: CourseRequest, res: Response): Promise<Response> {
    const name = requiredString(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    const input: CreateCourseTeamInput = {
      name,
      description: req.body.description,
      memberIds: req.body.memberIds,
    };
    try {
      return res
        .status(201)
        .json(await service.createTeam(getUserId(req), req.params.courseId, input));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateTeamMembers(req: CourseRequest, res: Response): Promise<Response> {
    if (!Array.isArray(req.body.memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array' });
    }
    try {
      return res
        .status(200)
        .json(
          await service.updateTeamMembers(
            getUserId(req),
            req.params.courseId,
            req.params.teamId,
            req.body.memberIds,
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function getProject(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.getOrCreateProject(getUserId(req), req.params.courseId, req.params.teamId),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateProject(req: CourseRequest, res: Response): Promise<Response> {
    const input: UpdateCourseProjectInput = {
      title: req.body.title,
      problem: req.body.problem,
      targetUser: req.body.targetUser,
      valueProposition: req.body.valueProposition,
      technicalRoute: req.body.technicalRoute,
      risks: req.body.risks,
      links: req.body.links,
      collaboratorEmails: req.body.collaboratorEmails,
    };
    try {
      return res
        .status(200)
        .json(
          await service.updateProject(
            getUserId(req),
            req.params.courseId,
            req.params.teamId,
            input,
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createProject(req: CourseRequest, res: Response): Promise<Response> {
    const title = requiredString(req.body.title);
    if (!title) {
      return res.status(400).json({ error: 'Project title is required' });
    }
    if (req.body.collaboratorEmails !== undefined && !Array.isArray(req.body.collaboratorEmails)) {
      return res.status(400).json({ error: 'collaboratorEmails must be an array' });
    }
    const input: CreateCourseProjectInput = {
      title,
      problem: req.body.problem,
      targetUser: req.body.targetUser,
      valueProposition: req.body.valueProposition,
      technicalRoute: req.body.technicalRoute,
      risks: req.body.risks,
      links: req.body.links,
      collaboratorEmails: req.body.collaboratorEmails,
    };
    try {
      return res
        .status(201)
        .json(await service.createProject(getUserId(req), req.params.courseId, input));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateProjectById(req: CourseRequest, res: Response): Promise<Response> {
    if (req.body.collaboratorEmails !== undefined && !Array.isArray(req.body.collaboratorEmails)) {
      return res.status(400).json({ error: 'collaboratorEmails must be an array' });
    }
    const input: UpdateCourseProjectInput = {
      title: req.body.title,
      problem: req.body.problem,
      targetUser: req.body.targetUser,
      valueProposition: req.body.valueProposition,
      technicalRoute: req.body.technicalRoute,
      risks: req.body.risks,
      links: req.body.links,
      collaboratorEmails: req.body.collaboratorEmails,
    };
    try {
      return res
        .status(200)
        .json(
          await service.updateProjectById(
            getUserId(req),
            req.params.courseId,
            req.params.projectId,
            input,
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deleteProject(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deleteProject(getUserId(req), req.params.courseId, req.params.projectId);
      return res.status(204).send();
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listMilestones(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(await service.listMilestones(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createMilestone(req: CourseRequest, res: Response): Promise<Response> {
    const title = requiredString(req.body.title);
    if (!title) {
      return res.status(400).json({ error: 'Milestone title is required' });
    }
    try {
      return res.status(201).json(
        await service.createMilestone(getUserId(req), req.params.courseId, {
          title,
          description: req.body.description,
          projectId: req.body.projectId,
          studentId: req.body.studentId,
          status: req.body.status,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateMilestone(req: CourseRequest, res: Response): Promise<Response> {
    if (!req.body.status) {
      return res.status(400).json({ error: 'status is required' });
    }
    try {
      return res
        .status(200)
        .json(
          await service.updateMilestoneStatus(
            getUserId(req),
            req.params.courseId,
            req.params.milestoneId,
            req.body.status,
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listWork(req: CourseRequest, res: Response): Promise<Response> {
    const kind = queryString(req.query.kind);
    try {
      return res.status(200).json(
        await service.listWork(getUserId(req), req.params.courseId, {
          studentId: queryString(req.query.studentId),
          projectId: queryString(req.query.projectId),
          kind: kind && WORK_KINDS.has(kind) ? (kind as CreateCourseWorkInput['kind']) : undefined,
          limit: queryNumber(req.query.limit),
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createWork(req: CourseRequest, res: Response): Promise<Response> {
    const title = requiredString(req.body.title);
    if (!title) {
      return res.status(400).json({ error: 'Work title is required' });
    }
    const kind =
      req.body.kind && WORK_KINDS.has(req.body.kind)
        ? (req.body.kind as CreateCourseWorkInput['kind'])
        : undefined;
    try {
      return res.status(201).json(
        await service.createWork(getUserId(req), req.params.courseId, {
          studentId: req.body.studentId,
          teamId: req.body.teamId,
          projectId: req.body.projectId,
          milestoneId: req.body.milestoneId,
          kind,
          title,
          description: req.body.description,
          fileIds: req.body.fileIds,
          links: req.body.links,
          source: req.body.source,
          sourceConversationId: req.body.sourceConversationId,
          sourceMessageId: req.body.sourceMessageId,
          sourceToolCallId: req.body.sourceToolCallId,
          sourceKey: req.body.sourceKey,
          versionOf: req.body.versionOf,
          portfolioState: req.body.portfolioState,
          aiSummary: req.body.aiSummary,
          reflection: req.body.reflection,
          metadata: req.body.metadata,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateWork(req: CourseRequest, res: Response): Promise<Response> {
    if (req.body.kind !== undefined && !WORK_KINDS.has(req.body.kind)) {
      return res.status(400).json({ error: 'Invalid work kind' });
    }
    try {
      return res.status(200).json(
        await service.updateWork(getUserId(req), req.params.courseId, req.params.workId, {
          kind:
            req.body.kind && WORK_KINDS.has(req.body.kind)
              ? (req.body.kind as CreateCourseWorkInput['kind'])
              : undefined,
          title: req.body.title,
          description: req.body.description,
          fileIds: req.body.fileIds,
          links: req.body.links,
          reflection: req.body.reflection,
          metadata: req.body.metadata,
          aiSummary: req.body.aiSummary,
          versionOf: req.body.versionOf,
          portfolioState: req.body.portfolioState,
          milestoneId: req.body.milestoneId,
          projectId: req.body.projectId,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deleteWork(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deleteWork(getUserId(req), req.params.courseId, req.params.workId);
      return res.status(204).send();
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listTime(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.listTime(
            getUserId(req),
            req.params.courseId,
            queryString(req.query.studentId),
            queryString(req.query.projectId),
            queryNumber(req.query.limit),
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createTime(req: CourseRequest, res: Response): Promise<Response> {
    if (typeof req.body.minutes !== 'number') {
      return res.status(400).json({ error: 'minutes is required' });
    }
    const description = requiredString(req.body.description);
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    try {
      return res.status(201).json(
        await service.createTime(getUserId(req), req.params.courseId, {
          studentId: req.body.studentId,
          projectId: req.body.projectId,
          milestoneId: req.body.milestoneId,
          workId: req.body.workId,
          date: req.body.date,
          minutes: req.body.minutes,
          category: req.body.category,
          customCategory: req.body.customCategory,
          description,
          outcome: req.body.outcome,
          evidenceUrl: req.body.evidenceUrl,
          reflection: req.body.reflection,
          sourceMessageId: req.body.sourceMessageId,
          sourceToolCallId: req.body.sourceToolCallId,
          sourceKey: req.body.sourceKey,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateTime(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(
        await service.updateTime(getUserId(req), req.params.courseId, req.params.timeId, {
          projectId: req.body.projectId,
          milestoneId: req.body.milestoneId,
          workId: req.body.workId,
          date: req.body.date,
          minutes: req.body.minutes,
          category: req.body.category,
          customCategory: req.body.customCategory,
          description: req.body.description,
          outcome: req.body.outcome,
          evidenceUrl: req.body.evidenceUrl,
          reflection: req.body.reflection,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deleteTime(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deleteTime(getUserId(req), req.params.courseId, req.params.timeId);
      return res.status(204).send();
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listAiUse(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.listAiUse(
            getUserId(req),
            req.params.courseId,
            queryString(req.query.studentId),
            queryString(req.query.projectId),
            queryNumber(req.query.limit),
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createAiUse(req: CourseRequest, res: Response): Promise<Response> {
    const tool = requiredString(req.body.tool);
    const task = requiredString(req.body.task);
    const output = requiredString(req.body.output);
    const learning = requiredString(req.body.learning);
    if (!tool || !task || !output || !learning) {
      return res.status(400).json({ error: 'tool, task, output, and learning are required' });
    }
    const input: CreateCourseAiUseInput = {
      studentId: req.body.studentId,
      projectId: req.body.projectId,
      date: req.body.date,
      tool,
      task,
      output,
      evidenceUrl: req.body.evidenceUrl,
      reviewed: req.body.reviewed,
      safetyNotes: req.body.safetyNotes,
      learning,
    };
    try {
      return res
        .status(201)
        .json(await service.createAiUse(getUserId(req), req.params.courseId, input));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateAiUse(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(
        await service.updateAiUse(getUserId(req), req.params.courseId, req.params.aiUseId, {
          projectId: req.body.projectId,
          date: req.body.date,
          tool: req.body.tool,
          task: req.body.task,
          output: req.body.output,
          evidenceUrl: req.body.evidenceUrl,
          reviewed: req.body.reviewed,
          safetyNotes: req.body.safetyNotes,
          learning: req.body.learning,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deleteAiUse(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deleteAiUse(getUserId(req), req.params.courseId, req.params.aiUseId);
      return res.status(204).send();
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listFeedback(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.listFeedback(
            getUserId(req),
            req.params.courseId,
            queryString(req.query.studentId),
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createFeedback(req: CourseRequest, res: Response): Promise<Response> {
    const studentId = requiredString(req.body.studentId);
    const content = requiredString(req.body.content);
    if (!studentId || !content) {
      return res.status(400).json({ error: 'studentId and content are required' });
    }
    try {
      return res.status(201).json(
        await service.createFeedback(getUserId(req), req.params.courseId, {
          studentId,
          workId: req.body.workId,
          projectId: req.body.projectId,
          visibility: req.body.visibility,
          content,
          actionItems: req.body.actionItems,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateFeedback(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(
        await service.updateFeedback(getUserId(req), req.params.courseId, req.params.feedbackId, {
          studentResponse: req.body.studentResponse,
          connectedRevisionId: req.body.connectedRevisionId,
          actionItemId: req.body.actionItemId,
          actionStatus: req.body.actionStatus,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listPosts(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await service.listPosts(getUserId(req), req.params.courseId));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createPost(req: CourseRequest, res: Response): Promise<Response> {
    const title = requiredString(req.body.title);
    const kind = req.body.kind;
    if (!title || !kind || !POST_KINDS.has(kind)) {
      return res.status(400).json({ error: 'Valid kind and title are required' });
    }
    const input: CreateCoursePostInput = {
      kind: kind as CreateCoursePostInput['kind'],
      title,
      body: req.body.body,
      fileIds: req.body.fileIds,
      links: req.body.links,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
      dueAt: req.body.dueAt,
    };
    try {
      return res
        .status(201)
        .json(await service.createPost(getUserId(req), req.params.courseId, input));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function createPosts(req: CourseRequest, res: Response): Promise<Response> {
    if (!Array.isArray(req.body.posts)) {
      return res.status(400).json({ error: 'posts must be an array' });
    }
    try {
      return res
        .status(201)
        .json(await service.createPosts(getUserId(req), req.params.courseId, req.body.posts));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updatePost(req: CourseRequest, res: Response): Promise<Response> {
    const kind = req.body.kind;
    if (kind !== undefined && !POST_KINDS.has(kind)) {
      return res.status(400).json({ error: 'Invalid post kind' });
    }
    try {
      return res.status(200).json(
        await service.updatePost(getUserId(req), req.params.courseId, req.params.postId, {
          kind: kind as CreateCoursePostInput['kind'] | undefined,
          title: req.body.title,
          body: req.body.body,
          fileIds: req.body.fileIds,
          links: req.body.links,
          startsAt: req.body.startsAt,
          endsAt: req.body.endsAt,
          dueAt: req.body.dueAt,
        }),
      );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function deletePost(req: CourseRequest, res: Response): Promise<Response> {
    try {
      await service.deletePost(getUserId(req), req.params.courseId, req.params.postId);
      return res.status(200).json({ deleted: true });
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function listReports(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.listReports(
            getUserId(req),
            req.params.courseId,
            queryString(req.query.studentId),
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function generateReport(req: CourseRequest, res: Response): Promise<Response> {
    const kind = req.body.kind;
    if (!kind || !REPORT_KINDS.has(kind)) {
      return res.status(400).json({ error: 'Report kind must be progress or final' });
    }
    try {
      return res
        .status(201)
        .json(
          await service.generateReport(
            getUserId(req),
            req.params.courseId,
            req.params.studentId,
            kind as 'progress' | 'final',
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function updateReport(req: CourseRequest, res: Response): Promise<Response> {
    if (!Array.isArray(req.body.sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }
    try {
      return res
        .status(200)
        .json(
          await service.updateReport(
            getUserId(req),
            req.params.courseId,
            req.params.reportId,
            req.body.sections,
          ),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function releaseReport(req: CourseRequest, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(
          await service.releaseReport(getUserId(req), req.params.courseId, req.params.reportId),
        );
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  async function undoAutomaticSave(req: CourseRequest, res: Response): Promise<Response> {
    const sourceKey = requiredString(req.body.sourceKey);
    if (!sourceKey) {
      return res.status(400).json({ error: 'sourceKey is required' });
    }
    try {
      return res
        .status(200)
        .json(await service.undoAutomaticSave(getUserId(req), req.params.courseId, sourceKey));
    } catch (error) {
      return handleError(res, error as Error);
    }
  }

  return {
    listCourses,
    createCourse,
    deleteCourse,
    getOverview,
    listMembers,
    inviteMembers,
    removeMember,
    createShareLink,
    getProfile,
    updateProfile,
    listTeams,
    createTeam,
    updateTeamMembers,
    getProject,
    updateProject,
    createProject,
    updateProjectById,
    deleteProject,
    listMilestones,
    createMilestone,
    updateMilestone,
    listWork,
    createWork,
    updateWork,
    deleteWork,
    listTime,
    createTime,
    updateTime,
    deleteTime,
    listAiUse,
    createAiUse,
    updateAiUse,
    deleteAiUse,
    listFeedback,
    createFeedback,
    updateFeedback,
    listPosts,
    createPost,
    createPosts,
    updatePost,
    deletePost,
    listReports,
    generateReport,
    updateReport,
    releaseReport,
    undoAutomaticSave,
  };
}

export type CourseHandlers = ReturnType<typeof createCourseHandlers>;
