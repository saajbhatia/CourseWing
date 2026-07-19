import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, tenantStorage } from '@librechat/data-schemas';
import { createCourseService } from './service';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('native course service', () => {
  const models = createModels(mongoose);
  const service = createCourseService(models);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('keeps student evidence isolated by tenant and makes automatic saves idempotent', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();

    const course = await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'INNOVARES',
      });
      await models.CourseMember.create({
        courseId: access.course._id?.toString(),
        userId: studentId,
        email: 'student@school.edu',
        normalizedEmail: 'student@school.edu',
        role: 'student',
        state: 'active',
        invitedBy: teacherId,
        joinedAt: new Date(),
      });
      return access.course;
    });

    const courseId = course._id?.toString() ?? '';
    const first = await tenantStorage.run({ tenantId: 'school-a' }, () =>
      service.createWork(studentId, courseId, {
        title: 'Prototype iteration',
        description: 'Tested a new onboarding flow.',
        source: 'ai',
        sourceKey: 'message-1:prototype',
      }),
    );
    const retry = await tenantStorage.run({ tenantId: 'school-a' }, () =>
      service.createWork(studentId, courseId, {
        title: 'Prototype iteration',
        description: 'Tested a new onboarding flow.',
        source: 'ai',
        sourceKey: 'message-1:prototype',
      }),
    );

    expect(retry._id?.toString()).toBe(first._id?.toString());
    await expect(
      tenantStorage.run({ tenantId: 'school-b' }, () => service.resolveAccess(studentId, courseId)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reads extracted file text only for the authenticated owner in an accessible course', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const ownerId = new mongoose.Types.ObjectId().toString();
    const classmateId = new mongoose.Types.ObjectId().toString();
    let courseId = '';

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Research Studio',
      });
      courseId = access.course._id?.toString() ?? '';
      await models.CourseMember.create([
        {
          courseId,
          userId: ownerId,
          email: 'owner@school.edu',
          normalizedEmail: 'owner@school.edu',
          role: 'student',
          state: 'active',
          invitedBy: teacherId,
          joinedAt: new Date(),
        },
        {
          courseId,
          userId: classmateId,
          email: 'classmate@school.edu',
          normalizedEmail: 'classmate@school.edu',
          role: 'student',
          state: 'active',
          invitedBy: teacherId,
          joinedAt: new Date(),
        },
      ]);
      await models.File.create({
        user: ownerId,
        file_id: 'owned-paper',
        bytes: 120,
        filename: 'paper.pdf',
        filepath: '/tmp/paper.pdf',
        object: 'file',
        type: 'application/pdf',
        usage: 0,
        source: 'local',
        text: 'Extracted paper text',
      });

      const file = await service.getAccessibleFile(ownerId, courseId, 'owned-paper');
      expect(file.text).toBe('Extracted paper text');
      await expect(
        service.getAccessibleFile(classmateId, courseId, 'owned-paper'),
      ).rejects.toMatchObject({
        status: 404,
      });
      const sharedProject = await service.createProject(ownerId, courseId, {
        title: 'Shared paper project',
        collaboratorEmails: ['classmate@school.edu'],
      });
      await service.createWork(ownerId, courseId, {
        projectId: sharedProject._id?.toString(),
        title: 'Shared paper',
        kind: 'paper',
        fileIds: ['owned-paper'],
      });
      await expect(
        service.getAccessibleFile(classmateId, courseId, 'owned-paper'),
      ).resolves.toMatchObject({
        file_id: 'owned-paper',
        text: 'Extracted paper text',
      });
    });

    await expect(
      tenantStorage.run({ tenantId: 'school-b' }, () =>
        service.getAccessibleFile(ownerId, courseId, 'owned-paper'),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('separates teacher-private notes and releases reports deliberately', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Evidence Studio',
      });
      const courseId = access.course._id?.toString() ?? '';
      await models.CourseMember.create({
        courseId,
        userId: studentId,
        email: 'student@school.edu',
        normalizedEmail: 'student@school.edu',
        role: 'student',
        state: 'active',
        invitedBy: teacherId,
        joinedAt: new Date(),
      });
      await service.createWork(studentId, courseId, {
        title: 'Paper notes',
        kind: 'paper',
        description: 'Compared two research approaches.',
      });
      await service.createTime(studentId, courseId, {
        minutes: 75,
        category: 'reading',
        description: 'Read and annotated the paper.',
      });
      await service.createFeedback(teacherId, courseId, {
        studentId,
        visibility: 'teacher',
        content: 'Private concern that must not reach the student report.',
      });
      await service.createFeedback(teacherId, courseId, {
        studentId,
        visibility: 'student',
        content: 'Make the comparison criteria more explicit.',
      });

      const report = await service.generateReport(teacherId, courseId, studentId, 'progress');
      expect(report.sections.map((section) => section.content).join('\n')).not.toContain(
        'Private concern',
      );
      expect(await service.listReports(studentId, courseId)).toHaveLength(0);

      await service.releaseReport(teacherId, courseId, report._id?.toString() ?? '');
      expect(await service.listReports(studentId, courseId)).toHaveLength(1);
    });
  });

  it('lets teachers open referenced work files without exposing them to other students', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();
    const otherStudentId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Artifact Studio',
      });
      const courseId = access.course._id?.toString() ?? '';
      await models.CourseMember.create(
        [studentId, otherStudentId].map((userId, index) => ({
          courseId,
          userId,
          email: `student${index + 1}@school.edu`,
          normalizedEmail: `student${index + 1}@school.edu`,
          role: 'student',
          state: 'active',
          invitedBy: teacherId,
          joinedAt: new Date(),
        })),
      );
      await models.File.create({
        user: studentId,
        file_id: 'course-pdf-1',
        bytes: 128,
        filename: 'prototype.pdf',
        filepath: '/tmp/prototype.pdf',
        object: 'file',
        type: 'application/pdf',
        usage: 0,
        source: 'local',
      });
      const work = await service.createWork(studentId, courseId, {
        title: 'Prototype PDF',
        fileIds: ['course-pdf-1'],
      });
      const workId = work._id?.toString() ?? '';

      await expect(
        service.getWorkFile(teacherId, courseId, workId, 'course-pdf-1'),
      ).resolves.toMatchObject({ filename: 'prototype.pdf' });
      await expect(
        service.getWorkFile(otherStudentId, courseId, workId, 'course-pdf-1'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it('restricts deletion to teachers and removes course records together', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Temporary Studio',
      });
      const courseId = access.course._id?.toString() ?? '';
      await models.CourseMember.create({
        courseId,
        userId: studentId,
        email: 'student@school.edu',
        normalizedEmail: 'student@school.edu',
        role: 'student',
        state: 'active',
        invitedBy: teacherId,
        joinedAt: new Date(),
      });

      const firstPost = await service.createPost(teacherId, courseId, {
        kind: 'announcement',
        title: 'Temporary announcement',
      });
      const firstPostId = firstPost._id?.toString() ?? '';
      await expect(service.deletePost(studentId, courseId, firstPostId)).rejects.toMatchObject({
        status: 403,
      });
      await service.deletePost(teacherId, courseId, firstPostId);
      expect(await service.listPosts(teacherId, courseId)).toHaveLength(0);

      await service.createPost(teacherId, courseId, {
        kind: 'resource',
        title: 'Temporary resource',
      });
      await expect(service.deleteCourse(studentId, courseId)).rejects.toMatchObject({
        status: 403,
      });
      await service.deleteCourse(teacherId, courseId);

      expect(await models.Course.countDocuments({ _id: courseId })).toBe(0);
      expect(await models.CourseMember.countDocuments({ courseId })).toBe(0);
      expect(await models.CoursePost.countDocuments({ courseId })).toBe(0);
      expect(await service.listCourses(teacherId, 'teacher@school.edu')).toHaveLength(0);
    });
  });

  it('persists student profiles and supports multiple collaborative projects safely', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();
    const collaboratorId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Project Studio',
      });
      const courseId = access.course._id?.toString() ?? '';
      await models.User.create([
        {
          _id: studentId,
          name: 'Ada Student',
          email: 'ada@school.edu',
          provider: 'local',
          emailVerified: true,
        },
        {
          _id: collaboratorId,
          name: 'Grace Collaborator',
          email: 'grace@school.edu',
          provider: 'local',
          emailVerified: true,
        },
        {
          _id: outsiderId,
          name: 'Outside Student',
          email: 'outside@school.edu',
          provider: 'local',
          emailVerified: true,
        },
      ]);
      await models.CourseMember.create(
        [
          [studentId, 'ada@school.edu'],
          [collaboratorId, 'grace@school.edu'],
          [outsiderId, 'outside@school.edu'],
        ].map(([userId, email]) => ({
          courseId,
          userId,
          email,
          normalizedEmail: email,
          role: 'student',
          state: 'active',
          invitedBy: teacherId,
          joinedAt: new Date(),
        })),
      );

      await expect(
        service.updateProfile(studentId, courseId, {
          preferredName: 'Ada',
          interests: ['AI systems', 'AI systems', 'Design'],
          bio: 'I build research tools.',
          website: 'https://ada.example',
          github: 'https://github.com/ada',
        }),
      ).resolves.toMatchObject({
        name: 'Ada Student',
        email: 'ada@school.edu',
        preferredName: 'Ada',
        interests: ['AI systems', 'Design'],
      });
      await expect(models.User.findById(studentId).lean()).resolves.toMatchObject({
        profile: {
          preferredName: 'Ada',
          interests: ['AI systems', 'Design'],
          bio: 'I build research tools.',
          website: 'https://ada.example',
          github: 'https://github.com/ada',
        },
      });

      const shared = await service.createProject(studentId, courseId, {
        title: 'Shared research assistant',
        collaboratorEmails: ['grace@school.edu'],
      });
      await service.createProject(studentId, courseId, {
        title: 'Independent experiment',
      });
      expect(await service.listTeams(studentId, courseId)).toHaveLength(2);

      await expect(
        service.updateProjectById(collaboratorId, courseId, shared._id?.toString() ?? '', {
          problem: 'Researchers need connected evidence.',
        }),
      ).resolves.toMatchObject({ problem: 'Researchers need connected evidence.' });
      await expect(
        service.updateProjectById(collaboratorId, courseId, shared._id?.toString() ?? '', {
          collaboratorEmails: ['grace@school.edu'],
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Only the project creator can change collaborators',
      });
      await expect(
        service.deleteProject(collaboratorId, courseId, shared._id?.toString() ?? ''),
      ).rejects.toMatchObject({ status: 403 });

      const sharedWork = await service.createWork(studentId, courseId, {
        projectId: shared._id?.toString(),
        title: 'Shared prototype',
      });
      await service.createWork(studentId, courseId, { title: 'Private notes' });
      expect(
        await service.listWork(collaboratorId, courseId, {
          projectId: shared._id?.toString(),
        }),
      ).toHaveLength(1);
      expect(await service.listWork(collaboratorId, courseId, {})).toHaveLength(0);
      await expect(
        service.listWork(outsiderId, courseId, { projectId: shared._id?.toString() }),
      ).rejects.toMatchObject({ status: 404 });

      await service.deleteProject(studentId, courseId, shared._id?.toString() ?? '');
      expect(
        await models.CourseWork.findById(sharedWork._id).lean<{ deletedAt?: Date }>(),
      ).toHaveProperty('deletedAt');
      await expect(
        service.listWork(studentId, courseId, {
          projectId: shared._id?.toString(),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it('updates structured work, time, feedback, and dated course posts', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'school-a' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'Evidence Studio',
      });
      const courseId = access.course._id?.toString() ?? '';
      await models.User.create({
        _id: studentId,
        name: 'Evidence Student',
        email: 'student@school.edu',
        provider: 'local',
        emailVerified: true,
      });
      await models.CourseMember.create({
        courseId,
        userId: studentId,
        email: 'student@school.edu',
        normalizedEmail: 'student@school.edu',
        role: 'student',
        state: 'active',
        invitedBy: teacherId,
        joinedAt: new Date(),
      });
      const project = await service.createProject(studentId, courseId, {
        title: 'Evidence project',
      });
      const projectId = project._id?.toString() ?? '';

      const work = await service.createWork(studentId, courseId, {
        projectId,
        kind: 'paper',
        title: 'Attention Is All You Need',
        metadata: {
          authors: ['Vaswani et al.'],
          year: 2017,
          constructor: 'discarded',
        },
      });
      expect(work.metadata).toEqual({
        authors: ['Vaswani et al.'],
        year: 2017,
      });
      const milestone = await service.createMilestone(studentId, courseId, {
        projectId,
        title: 'Presentation ready',
      });
      await expect(
        service.updateWork(studentId, courseId, work._id?.toString() ?? '', {
          kind: 'presentation',
          title: 'Transformer presentation',
          links: [{ label: 'Slides', url: 'https://slides.example/deck' }],
          metadata: { presentedAt: '2026-07-18' },
          milestoneId: milestone._id?.toString(),
          aiSummary: 'A concise transformer presentation.',
        }),
      ).resolves.toMatchObject({
        kind: 'presentation',
        metadata: { presentedAt: '2026-07-18' },
        milestoneId: milestone._id?.toString(),
        aiSummary: 'A concise transformer presentation.',
      });

      const time = await service.createTime(studentId, courseId, {
        projectId,
        workId: work._id?.toString(),
        minutes: 45,
        category: 'presentation',
        description: 'Revised the deck.',
        outcome: 'Clearer comparison slide',
        evidenceUrl: 'https://slides.example/deck',
        reflection: 'The comparison needed a stronger baseline.',
      });
      expect(time.date.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
      await expect(
        service.updateTime(studentId, courseId, time._id?.toString() ?? '', {
          minutes: 60,
          outcome: 'Final comparison slide',
          milestoneId: milestone._id?.toString(),
        }),
      ).resolves.toMatchObject({
        minutes: 60,
        outcome: 'Final comparison slide',
        milestoneId: milestone._id?.toString(),
      });
      expect(await service.listTime(studentId, courseId, undefined, projectId)).toHaveLength(1);

      const feedback = await service.createFeedback(teacherId, courseId, {
        studentId,
        projectId,
        workId: work._id?.toString(),
        content: 'Make the baseline explicit.',
        actionItems: [{ text: 'Add baseline results' }],
      });
      await expect(
        service.updateFeedback(studentId, courseId, feedback._id?.toString() ?? '', {
          studentResponse: 'Added the baseline table.',
          connectedRevisionId: work._id?.toString(),
          actionItemId: feedback.actionItems[0].id,
          actionStatus: 'addressed',
        }),
      ).resolves.toMatchObject({
        studentResponse: 'Added the baseline table.',
        connectedRevisionId: work._id?.toString(),
        actionItems: [expect.objectContaining({ status: 'addressed' })],
      });

      const deadline = await service.createPost(teacherId, courseId, {
        kind: 'deadline',
        title: 'Paper presentation',
        dueAt: '2026-07-21T17:00:00.000Z',
      });
      await expect(
        service.updatePost(teacherId, courseId, deadline._id?.toString() ?? '', {
          kind: 'schedule',
          startsAt: '2026-07-21T13:00:00.000Z',
          endsAt: '2026-07-21T14:00:00.000Z',
          dueAt: null,
        }),
      ).resolves.toMatchObject({
        kind: 'schedule',
        startsAt: new Date('2026-07-21T13:00:00.000Z'),
        endsAt: new Date('2026-07-21T14:00:00.000Z'),
      });
      await expect(
        service.updatePost(teacherId, courseId, deadline._id?.toString() ?? '', {
          title: 'Updated paper presentation',
        }),
      ).resolves.toMatchObject({
        title: 'Updated paper presentation',
        startsAt: new Date('2026-07-21T13:00:00.000Z'),
        endsAt: new Date('2026-07-21T14:00:00.000Z'),
      });
      await expect(
        service.updatePost(teacherId, courseId, deadline._id?.toString() ?? '', {
          startsAt: '2026-07-21T15:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Schedule end time must be after its start time',
      });

      await service.deleteTime(studentId, courseId, time._id?.toString() ?? '');
      expect(await service.listTime(studentId, courseId)).toHaveLength(0);
    });
  });
});
