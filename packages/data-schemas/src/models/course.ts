import type { Model } from 'mongoose';
import type {
  ICourseDocument,
  ICourseMemberDocument,
  ICourseTeamDocument,
  ICourseProjectDocument,
  ICourseMilestoneDocument,
  ICourseWorkDocument,
  ICourseTimeDocument,
  ICourseAiUseDocument,
  ICourseFeedbackDocument,
  ICoursePostDocument,
  ICourseReportDocument,
} from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import {
  courseSchema,
  courseMemberSchema,
  courseTeamSchema,
  courseProjectSchema,
  courseMilestoneSchema,
  courseWorkSchema,
  courseTimeSchema,
  courseAiUseSchema,
  courseFeedbackSchema,
  coursePostSchema,
  courseReportSchema,
} from '~/schema/course';

export type CourseModels = {
  Course: Model<ICourseDocument>;
  CourseMember: Model<ICourseMemberDocument>;
  CourseTeam: Model<ICourseTeamDocument>;
  CourseProject: Model<ICourseProjectDocument>;
  CourseMilestone: Model<ICourseMilestoneDocument>;
  CourseWork: Model<ICourseWorkDocument>;
  CourseTime: Model<ICourseTimeDocument>;
  CourseAiUse: Model<ICourseAiUseDocument>;
  CourseFeedback: Model<ICourseFeedbackDocument>;
  CoursePost: Model<ICoursePostDocument>;
  CourseReport: Model<ICourseReportDocument>;
};

export function createCourseModels(mongoose: typeof import('mongoose')): CourseModels {
  const definitions = [
    courseSchema,
    courseMemberSchema,
    courseTeamSchema,
    courseProjectSchema,
    courseMilestoneSchema,
    courseWorkSchema,
    courseTimeSchema,
    courseAiUseSchema,
    courseFeedbackSchema,
    coursePostSchema,
    courseReportSchema,
  ];
  for (const schema of definitions) {
    applyTenantIsolation(schema);
  }

  return {
    Course:
      mongoose.models.Course || mongoose.model<ICourseDocument>('Course', courseSchema, 'courses'),
    CourseMember:
      mongoose.models.CourseMember ||
      mongoose.model<ICourseMemberDocument>('CourseMember', courseMemberSchema, 'course_members'),
    CourseTeam:
      mongoose.models.CourseTeam ||
      mongoose.model<ICourseTeamDocument>('CourseTeam', courseTeamSchema, 'course_teams'),
    CourseProject:
      mongoose.models.CourseProject ||
      mongoose.model<ICourseProjectDocument>(
        'CourseProject',
        courseProjectSchema,
        'course_projects',
      ),
    CourseMilestone:
      mongoose.models.CourseMilestone ||
      mongoose.model<ICourseMilestoneDocument>(
        'CourseMilestone',
        courseMilestoneSchema,
        'course_milestones',
      ),
    CourseWork:
      mongoose.models.CourseWork ||
      mongoose.model<ICourseWorkDocument>('CourseWork', courseWorkSchema, 'course_work'),
    CourseTime:
      mongoose.models.CourseTime ||
      mongoose.model<ICourseTimeDocument>('CourseTime', courseTimeSchema, 'course_time'),
    CourseAiUse:
      mongoose.models.CourseAiUse ||
      mongoose.model<ICourseAiUseDocument>('CourseAiUse', courseAiUseSchema, 'course_ai_use'),
    CourseFeedback:
      mongoose.models.CourseFeedback ||
      mongoose.model<ICourseFeedbackDocument>(
        'CourseFeedback',
        courseFeedbackSchema,
        'course_feedback',
      ),
    CoursePost:
      mongoose.models.CoursePost ||
      mongoose.model<ICoursePostDocument>('CoursePost', coursePostSchema, 'course_posts'),
    CourseReport:
      mongoose.models.CourseReport ||
      mongoose.model<ICourseReportDocument>('CourseReport', courseReportSchema, 'course_reports'),
  };
}
