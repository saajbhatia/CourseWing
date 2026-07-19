import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  createCourse,
  deleteCourse,
  deleteCourseMember,
  inviteCourseMembers,
  createCourseShareLink,
  updateCourseProfile,
  createCourseTeam,
  updateCourseTeamMembers,
  updateCourseProject,
  createCourseProject,
  updateCourseProjectById,
  deleteCourseProject,
  createCourseMilestone,
  updateCourseMilestone,
  createCourseWork,
  updateCourseWork,
  deleteCourseWork,
  createCourseTime,
  updateCourseTime,
  deleteCourseTime,
  createCourseAiUse,
  updateCourseAiUse,
  deleteCourseAiUse,
  createCourseFeedback,
  updateCourseFeedback,
  createCoursePost,
  createCoursePostsBatch,
  updateCoursePost,
  deleteCoursePost,
  generateCourseReport,
  updateCourseReport,
  releaseCourseReport,
  undoCourseAutomaticSave,
} from 'librechat-data-provider';
import type {
  CourseAccess,
  CourseMemberInvitationResult,
  CourseShareLink,
  CourseProfile,
  UpdateCourseProfileInput,
  CourseTeam,
  CourseProject,
  CreateCourseProjectInput,
  UpdateCourseProjectInput,
  CourseMilestone,
  CourseMilestoneStatus,
  CourseWork,
  CourseWorkKind,
  CoursePortfolioState,
  CourseTime,
  UpdateCourseTimeInput,
  CourseAiUse,
  CreateCourseAiUseInput,
  UpdateCourseAiUseInput,
  CourseFeedback,
  UpdateCourseFeedbackInput,
  CoursePost,
  CreateCoursePostInput,
  CourseReport,
  CourseReportSection,
  CourseLink,
  CourseWorkMetadata,
} from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

const useCourseInvalidation = () => {
  const queryClient = useQueryClient();
  return (courseId: string, keys: QueryKeys[]) => {
    queryClient.invalidateQueries([QueryKeys.courseOverview, courseId]);
    keys.forEach((key) => queryClient.invalidateQueries([key, courseId]));
  };
};

export const useCreateCourseMutation = (): UseMutationResult<
  CourseAccess,
  unknown,
  { name: string; description?: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(createCourse, {
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.courses]),
  });
};

export const useDeleteCourseMutation = (): UseMutationResult<
  { deleted: boolean },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((courseId) => deleteCourse(courseId), {
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.courses]),
  });
};

export const useInviteCourseMembersMutation = (
  courseId: string,
): UseMutationResult<CourseMemberInvitationResult[], unknown, string[], unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((emails: string[]) => inviteCourseMembers(courseId, emails), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseMembers]),
  });
};

export const useDeleteCourseMemberMutation = (
  courseId: string,
): UseMutationResult<{ deleted: boolean }, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((memberId: string) => deleteCourseMember(courseId, memberId), {
    onSuccess: () =>
      invalidate(courseId, [QueryKeys.courseMembers]),
  });
};

export const useCreateCourseShareLinkMutation = (
  courseId: string,
): UseMutationResult<CourseShareLink, unknown, void, unknown> =>
  useMutation(() => createCourseShareLink(courseId));

export const useUpdateCourseProfileMutation = (
  courseId: string,
): UseMutationResult<CourseProfile, unknown, UpdateCourseProfileInput, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => updateCourseProfile(courseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseProfile]),
  });
};

export const useCreateCourseTeamMutation = (
  courseId: string,
): UseMutationResult<
  CourseTeam,
  unknown,
  { name: string; description?: string; memberIds?: string[] },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseTeam(courseId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useUpdateCourseTeamMembersMutation = (
  courseId: string,
): UseMutationResult<CourseTeam, unknown, { teamId: string; memberIds: string[] }, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation(
    ({ teamId, memberIds }) => updateCourseTeamMembers(courseId, teamId, memberIds),
    { onSuccess: () => invalidate(courseId, [QueryKeys.courseMembers]) },
  );
};

export const useUpdateCourseProjectMutation = (
  courseId: string,
): UseMutationResult<
  CourseProject,
  unknown,
  {
    teamId: string;
    input: Partial<Omit<CourseProject, '_id' | 'courseId' | 'teamId'>>;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ teamId, input }) => updateCourseProject(courseId, teamId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useCreateCourseProjectMutation = (
  courseId: string,
): UseMutationResult<CourseProject, unknown, CreateCourseProjectInput, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseProject(courseId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useUpdateCourseProjectByIdMutation = (
  courseId: string,
): UseMutationResult<
  CourseProject,
  unknown,
  { projectId: string; input: UpdateCourseProjectInput },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(
    ({ projectId, input }) => updateCourseProjectById(courseId, projectId, input),
    { onSuccess: () => invalidate(courseId, []) },
  );
};

export const useDeleteCourseProjectMutation = (
  courseId: string,
): UseMutationResult<void, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((projectId) => deleteCourseProject(courseId, projectId), {
    onSuccess: () =>
      invalidate(courseId, [
        QueryKeys.courseWork,
        QueryKeys.courseTime,
        QueryKeys.courseAiUse,
        QueryKeys.courseFeedback,
      ]),
  });
};

export const useCreateCourseMilestoneMutation = (
  courseId: string,
): UseMutationResult<
  CourseMilestone,
  unknown,
  {
    title: string;
    description?: string;
    projectId?: string;
    studentId?: string;
    status?: CourseMilestoneStatus;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseMilestone(courseId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useUpdateCourseMilestoneMutation = (
  courseId: string,
): UseMutationResult<
  CourseMilestone,
  unknown,
  { milestoneId: string; status: CourseMilestoneStatus },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(
    ({ milestoneId, status }) => updateCourseMilestone(courseId, milestoneId, status),
    { onSuccess: () => invalidate(courseId, []) },
  );
};

export type CreateCourseWorkInput = {
  studentId?: string;
  teamId?: string;
  projectId?: string;
  milestoneId?: string;
  kind?: CourseWorkKind;
  title: string;
  description?: string;
  fileIds?: string[];
  links?: CourseLink[];
  versionOf?: string;
  portfolioState?: CoursePortfolioState;
  reflection?: string;
  metadata?: CourseWorkMetadata;
};

export const useCreateCourseWorkMutation = (
  courseId: string,
): UseMutationResult<CourseWork, unknown, CreateCourseWorkInput, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseWork(courseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseWork]),
  });
};

export const useUpdateCourseWorkMutation = (
  courseId: string,
): UseMutationResult<
  CourseWork,
  unknown,
  {
    workId: string;
    input: Partial<
      Pick<
        CourseWork,
        | 'kind'
        | 'title'
        | 'description'
        | 'fileIds'
        | 'links'
        | 'reflection'
        | 'metadata'
        | 'portfolioState'
        | 'milestoneId'
        | 'projectId'
      >
    >;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ workId, input }) => updateCourseWork(courseId, workId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseWork]),
  });
};

export const useDeleteCourseWorkMutation = (
  courseId: string,
): UseMutationResult<void, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((workId) => deleteCourseWork(courseId, workId), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseWork]),
  });
};

export const useCreateCourseTimeMutation = (
  courseId: string,
): UseMutationResult<
  CourseTime,
  unknown,
  {
    studentId?: string;
    projectId?: string;
    milestoneId?: string;
    workId?: string;
    date?: string;
    minutes: number;
    category?: CourseTime['category'];
    customCategory?: string;
    description: string;
    outcome?: string;
    evidenceUrl?: string;
    reflection?: string;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseTime(courseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseTime]),
  });
};

export const useUpdateCourseTimeMutation = (
  courseId: string,
): UseMutationResult<
  CourseTime,
  unknown,
  { timeId: string; input: UpdateCourseTimeInput },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ timeId, input }) => updateCourseTime(courseId, timeId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseTime]),
  });
};

export const useDeleteCourseTimeMutation = (
  courseId: string,
): UseMutationResult<void, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((timeId) => deleteCourseTime(courseId, timeId), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseTime]),
  });
};

export const useCreateCourseAiUseMutation = (
  courseId: string,
): UseMutationResult<CourseAiUse, unknown, CreateCourseAiUseInput, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseAiUse(courseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseAiUse]),
  });
};

export const useUpdateCourseAiUseMutation = (
  courseId: string,
): UseMutationResult<
  CourseAiUse,
  unknown,
  { aiUseId: string; input: UpdateCourseAiUseInput },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ aiUseId, input }) => updateCourseAiUse(courseId, aiUseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseAiUse]),
  });
};

export const useDeleteCourseAiUseMutation = (
  courseId: string,
): UseMutationResult<void, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((aiUseId) => deleteCourseAiUse(courseId, aiUseId), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseAiUse]),
  });
};

export const useCreateCourseFeedbackMutation = (
  courseId: string,
): UseMutationResult<
  CourseFeedback,
  unknown,
  {
    studentId: string;
    workId?: string;
    projectId?: string;
    visibility?: CourseFeedback['visibility'];
    content: string;
    actionItems?: Array<{ text: string }>;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCourseFeedback(courseId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseFeedback]),
  });
};

export const useUpdateCourseFeedbackMutation = (
  courseId: string,
): UseMutationResult<
  CourseFeedback,
  unknown,
  { feedbackId: string; input: UpdateCourseFeedbackInput },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ feedbackId, input }) => updateCourseFeedback(courseId, feedbackId, input), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseFeedback]),
  });
};

export const useCreateCoursePostMutation = (
  courseId: string,
): UseMutationResult<CoursePost, unknown, CreateCoursePostInput, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((input) => createCoursePost(courseId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useCreateCoursePostsMutation = (
  courseId: string,
): UseMutationResult<CoursePost[], unknown, CreateCoursePostInput[], unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((posts) => createCoursePostsBatch(courseId, posts), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useUpdateCoursePostMutation = (
  courseId: string,
): UseMutationResult<
  CoursePost,
  unknown,
  {
    postId: string;
    input: Partial<{
      kind: CoursePost['kind'];
      title: string;
      body: string;
      fileIds: string[];
      links: CourseLink[];
      startsAt: string | null;
      endsAt: string | null;
      dueAt: string | null;
    }>;
  },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ postId, input }) => updateCoursePost(courseId, postId, input), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useDeleteCoursePostMutation = (
  courseId: string,
): UseMutationResult<{ deleted: boolean }, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((postId) => deleteCoursePost(courseId, postId), {
    onSuccess: () => invalidate(courseId, []),
  });
};

export const useGenerateCourseReportMutation = (
  courseId: string,
): UseMutationResult<
  CourseReport,
  unknown,
  { studentId: string; kind: CourseReport['kind'] },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ studentId, kind }) => generateCourseReport(courseId, studentId, kind), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseReports]),
  });
};

export const useUpdateCourseReportMutation = (
  courseId: string,
): UseMutationResult<
  CourseReport,
  unknown,
  { reportId: string; sections: CourseReportSection[] },
  unknown
> => {
  const invalidate = useCourseInvalidation();
  return useMutation(({ reportId, sections }) => updateCourseReport(courseId, reportId, sections), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseReports]),
  });
};

export const useReleaseCourseReportMutation = (
  courseId: string,
): UseMutationResult<CourseReport, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((reportId) => releaseCourseReport(courseId, reportId), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseReports]),
  });
};

export const useUndoCourseAutomaticSaveMutation = (
  courseId: string,
): UseMutationResult<{ undone: boolean }, unknown, string, unknown> => {
  const invalidate = useCourseInvalidation();
  return useMutation((sourceKey) => undoCourseAutomaticSave(courseId, sourceKey), {
    onSuccess: () => invalidate(courseId, [QueryKeys.courseWork, QueryKeys.courseTime]),
  });
};
