import { useQuery } from '@tanstack/react-query';
import {
  QueryKeys,
  getCourses,
  getCourseOverview,
  getCourseProfile,
  getCourseMembers,
  getCourseTeams,
  getCourseWork,
  getCourseTime,
  getCourseAiUse,
  getCourseFeedback,
  getCourseReports,
} from 'librechat-data-provider';
import type {
  CourseWorkKind,
  CourseAccess,
  CourseOverview,
  CourseProfile,
  CourseMembership,
  CourseTeam,
  CourseWork,
  CourseTime,
  CourseAiUse,
  CourseFeedback,
  CourseReport,
} from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';

export const useCoursesQuery = (
  config?: UseQueryOptions<CourseAccess[]>,
): QueryObserverResult<CourseAccess[], unknown> =>
  useQuery<CourseAccess[]>([QueryKeys.courses], getCourses, {
    staleTime: 30_000,
    ...config,
  });

export const useCourseOverviewQuery = (
  courseId?: string,
  config?: UseQueryOptions<CourseOverview>,
): QueryObserverResult<CourseOverview, unknown> =>
  useQuery<CourseOverview>(
    [QueryKeys.courseOverview, courseId],
    () => getCourseOverview(courseId ?? ''),
    {
      enabled: Boolean(courseId),
      staleTime: 15_000,
      ...config,
    },
  );

export const useCourseProfileQuery = (
  courseId?: string,
): QueryObserverResult<CourseProfile, unknown> =>
  useQuery<CourseProfile>(
    [QueryKeys.courseProfile, courseId],
    () => getCourseProfile(courseId ?? ''),
    { enabled: Boolean(courseId) },
  );

export const useCourseMembersQuery = (
  courseId?: string,
  enabled = true,
): QueryObserverResult<CourseMembership[], unknown> =>
  useQuery<CourseMembership[]>(
    [QueryKeys.courseMembers, courseId],
    () => getCourseMembers(courseId ?? ''),
    { enabled: Boolean(courseId) && enabled },
  );

export const useCourseTeamsQuery = (
  courseId?: string,
): QueryObserverResult<CourseTeam[], unknown> =>
  useQuery<CourseTeam[]>(
    [QueryKeys.courseOverview, courseId, 'teams'],
    () => getCourseTeams(courseId ?? ''),
    { enabled: Boolean(courseId) },
  );

export const useCourseWorkQuery = (
  courseId?: string,
  params: { studentId?: string; projectId?: string; kind?: CourseWorkKind; limit?: number } = {},
): QueryObserverResult<CourseWork[], unknown> =>
  useQuery<CourseWork[]>(
    [QueryKeys.courseWork, courseId, params],
    () => getCourseWork(courseId ?? '', params),
    { enabled: Boolean(courseId) },
  );

export const useCourseTimeQuery = (
  courseId?: string,
  studentId?: string,
  projectId?: string,
): QueryObserverResult<CourseTime[], unknown> =>
  useQuery<CourseTime[]>(
    [QueryKeys.courseTime, courseId, studentId, projectId],
    () => getCourseTime(courseId ?? '', studentId, projectId),
    { enabled: Boolean(courseId) },
  );

export const useCourseAiUseQuery = (
  courseId?: string,
  studentId?: string,
  projectId?: string,
): QueryObserverResult<CourseAiUse[], unknown> =>
  useQuery<CourseAiUse[]>(
    [QueryKeys.courseAiUse, courseId, studentId, projectId],
    () => getCourseAiUse(courseId ?? '', studentId, projectId),
    { enabled: Boolean(courseId) },
  );

export const useCourseFeedbackQuery = (
  courseId?: string,
  studentId?: string,
): QueryObserverResult<CourseFeedback[], unknown> =>
  useQuery<CourseFeedback[]>(
    [QueryKeys.courseFeedback, courseId, studentId],
    () => getCourseFeedback(courseId ?? '', studentId),
    { enabled: Boolean(courseId) },
  );

export const useCourseReportsQuery = (
  courseId?: string,
  studentId?: string,
): QueryObserverResult<CourseReport[], unknown> =>
  useQuery<CourseReport[]>(
    [QueryKeys.courseReports, courseId, studentId],
    () => getCourseReports(courseId ?? '', studentId),
    { enabled: Boolean(courseId) },
  );
