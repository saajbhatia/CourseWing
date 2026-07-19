import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, tenantStorage } from '@librechat/data-schemas';
import { createCourseService } from './service';

jest.setTimeout(60_000);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('native course student workflows', () => {
  const models = createModels(mongoose);
  const service = createCourseService(models);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('supports a complete collaborative project, evidence, time, feedback, and course-home flow', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentOneObjectId = new mongoose.Types.ObjectId();
    const studentTwoObjectId = new mongoose.Types.ObjectId();
    const studentOneId = studentOneObjectId.toString();
    const studentTwoId = studentTwoObjectId.toString();
    const studentOneEmail = 'avery@school.edu';
    const studentTwoEmail = 'blake@school.edu';

    await tenantStorage.run({ tenantId: 'workflow-school' }, async () => {
      const courseAccess = await service.createCourse(teacherId, 'teacher@school.edu', {
        name: 'INNOVARES Functional Studio',
        description: 'A project-based course evidence workspace.',
      });
      const courseId = courseAccess.course._id?.toString() ?? '';

      const invited = await service.inviteMembers(teacherId, courseId, {
        emails: [studentOneEmail, studentTwoEmail],
      });
      expect(invited).toHaveLength(2);
      expect(invited.every((member) => member.state === 'pending')).toBe(true);

      await models.User.create([
        {
          _id: studentOneObjectId,
          name: 'Avery Student',
          username: 'avery.student',
          email: studentOneEmail,
          emailVerified: true,
          password: 'not-a-real-password-hash',
          provider: 'local',
          courseRole: 'student',
        },
        {
          _id: studentTwoObjectId,
          name: 'Blake Student',
          username: 'blake.student',
          email: studentTwoEmail,
          emailVerified: true,
          password: 'not-a-real-password-hash',
          provider: 'local',
          courseRole: 'student',
        },
      ]);

      await expect(service.listCourses(studentOneId, studentOneEmail)).resolves.toHaveLength(0);
      await expect(service.listCourses(studentTwoId, studentTwoEmail)).resolves.toHaveLength(0);
      await models.CourseMember.updateOne(
        { courseId, normalizedEmail: studentOneEmail, state: 'pending' },
        { $set: { userId: studentOneId, state: 'active', joinedAt: new Date() } },
      );
      await models.CourseMember.updateOne(
        { courseId, normalizedEmail: studentTwoEmail, state: 'pending' },
        { $set: { userId: studentTwoId, state: 'active', joinedAt: new Date() } },
      );
      const studentOneCourses = await service.listCourses(studentOneId, studentOneEmail);
      const studentTwoCourses = await service.listCourses(studentTwoId, studentTwoEmail);
      expect(studentOneCourses).toHaveLength(1);
      expect(studentTwoCourses).toHaveLength(1);
      expect(studentOneCourses[0].membership).toMatchObject({
        userId: studentOneId,
        state: 'active',
        role: 'student',
      });
      expect(studentTwoCourses[0].membership).toMatchObject({
        userId: studentTwoId,
        state: 'active',
        role: 'student',
      });

      const profile = await service.updateProfile(studentOneId, courseId, {
        preferredName: 'Avery',
        interests: ['computer vision', 'responsible AI', 'computer vision'],
        bio: 'I build accessible research tools.',
        website: 'https://avery.example.edu',
        github: 'https://github.com/avery-student',
      });
      expect(profile).toEqual({
        name: 'Avery Student',
        email: studentOneEmail,
        preferredName: 'Avery',
        interests: ['computer vision', 'responsible AI'],
        bio: 'I build accessible research tools.',
        website: 'https://avery.example.edu',
        github: 'https://github.com/avery-student',
      });

      const readingProject = await service.createProject(studentOneId, courseId, {
        title: 'Research Reading Assistant',
        problem: 'Students lose the reasoning that connects papers to project decisions.',
        targetUser: 'Student research teams',
        valueProposition: 'Turn reading notes into usable project evidence.',
        collaboratorEmails: [studentTwoEmail],
        links: [{ label: 'Prototype', url: 'https://example.edu/reading-assistant' }],
      });
      const demoProject = await service.createProject(studentOneId, courseId, {
        title: 'Evidence Trail Demo',
        problem: 'Project progress is scattered across files and messages.',
        collaboratorEmails: [studentTwoEmail],
      });
      const readingProjectId = readingProject._id?.toString() ?? '';
      const demoProjectId = demoProject._id?.toString() ?? '';

      const studentOneTeams = await service.listTeams(studentOneId, courseId);
      const studentTwoTeams = await service.listTeams(studentTwoId, courseId);
      expect(studentOneTeams).toHaveLength(2);
      expect(studentTwoTeams).toHaveLength(2);
      for (const team of [...studentOneTeams, ...studentTwoTeams]) {
        expect(team.memberIds).toEqual(expect.arrayContaining([studentOneId, studentTwoId]));
      }
      expect(
        await models.CourseTeam.countDocuments({
          courseId,
          memberIds: { $all: [studentOneId, studentTwoId] },
        }),
      ).toBe(2);

      await models.File.create([
        {
          user: studentOneId,
          file_id: 'presentation-file',
          bytes: 512,
          filename: 'reading-assistant-pitch.pptx',
          filepath: '/tmp/reading-assistant-pitch.pptx',
          object: 'file',
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          usage: 0,
          source: 'local',
        },
        {
          user: studentOneId,
          file_id: 'paper-file',
          bytes: 1_024,
          filename: 'alexnet.pdf',
          filepath: '/tmp/alexnet.pdf',
          object: 'file',
          type: 'application/pdf',
          usage: 0,
          source: 'local',
        },
      ]);

      const presentation = await service.createWork(studentOneId, courseId, {
        projectId: readingProjectId,
        kind: 'presentation',
        title: 'Reading assistant project pitch',
        description: 'A concise walkthrough of the problem and first prototype.',
        reflection: 'The live workflow should appear before the technical architecture.',
        fileIds: ['presentation-file'],
        links: [{ label: 'Google Slides', url: 'https://slides.example.edu/pitch' }],
        metadata: {
          date: '2026-07-18',
          presentationScope: 'team',
          videoLinks: [
            { label: 'Pitch recording', url: 'https://video.example.edu/pitch' },
            { label: 'Prototype demo', url: 'https://video.example.edu/demo' },
          ],
          attachments: [
            {
              fileId: 'presentation-file',
              name: 'reading-assistant-pitch.pptx',
            },
          ],
        },
      });
      const paper = await service.createWork(studentOneId, courseId, {
        projectId: demoProjectId,
        kind: 'paper',
        title: 'ImageNet Classification with Deep Convolutional Neural Networks',
        description: 'A structured reading record for the AlexNet paper.',
        fileIds: ['paper-file'],
        links: [{ label: 'Paper source', url: 'https://example.edu/alexnet' }],
        metadata: {
          authors: 'Krizhevsky, Sutskever, and Hinton',
          year: '2012',
          tags: ['CNNs', 'computer vision'],
          summary: 'AlexNet showed the impact of deep convolutional networks at ImageNet scale.',
          method: 'A deep CNN trained with GPUs, augmentation, dropout, and ReLU activations.',
          keyFindings: 'The model substantially reduced ImageNet classification error.',
          limitations: 'The training process required substantial compute and labeled data.',
          projectImpact: 'Use a visual comparison when explaining why model choice matters.',
          timeSpentMinutes: 135,
          presentationLink: 'https://slides.example.edu/alexnet',
          attachments: [{ fileId: 'paper-file', name: 'alexnet.pdf' }],
        },
      });
      expect(presentation.metadata).toMatchObject({
        presentationScope: 'team',
        videoLinks: [
          { label: 'Pitch recording', url: 'https://video.example.edu/pitch' },
          { label: 'Prototype demo', url: 'https://video.example.edu/demo' },
        ],
      });
      expect(presentation.links).toEqual([
        { label: 'Google Slides', url: 'https://slides.example.edu/pitch' },
      ]);
      expect(paper.metadata).toMatchObject({
        authors: 'Krizhevsky, Sutskever, and Hinton',
        year: '2012',
        tags: ['CNNs', 'computer vision'],
        timeSpentMinutes: 135,
      });

      const presentationId = presentation._id?.toString() ?? '';
      const collaboratorWork = await service.listWork(studentTwoId, courseId, {
        projectId: readingProjectId,
      });
      expect(collaboratorWork.map((item) => item._id?.toString())).toContain(presentationId);
      await expect(
        service.getWorkFile(studentTwoId, courseId, presentationId, 'presentation-file'),
      ).resolves.toMatchObject({ filename: 'reading-assistant-pitch.pptx' });
      await expect(
        service.updateWork(studentTwoId, courseId, presentationId, {
          title: 'Unauthorized collaborator edit',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.deleteWork(studentTwoId, courseId, presentationId),
      ).rejects.toMatchObject({ status: 404 });

      const time = await service.createTime(studentOneId, courseId, {
        projectId: readingProjectId,
        workId: presentationId,
        date: '2026-07-18T14:00:00.000Z',
        minutes: 75,
        category: 'slide_building',
        description: 'Reworked the pitch around the live prototype.',
        outcome: 'A clearer first-pass deck.',
        evidenceUrl: 'https://slides.example.edu/pitch',
        reflection: 'The target user needs to be more specific.',
      });
      const timeId = time._id?.toString() ?? '';
      const updatedTime = await service.updateTime(studentOneId, courseId, timeId, {
        minutes: 105,
        category: 'other',
        customCategory: 'Pitch rehearsal',
        description: 'Reworked and rehearsed the project pitch.',
        outcome: 'Pitch deck and demo are aligned.',
        evidenceUrl: 'https://slides.example.edu/pitch-v2',
        reflection: 'Lead with the student workflow and defer implementation details.',
      });
      expect(updatedTime).toMatchObject({
        minutes: 105,
        category: 'other',
        customCategory: 'Pitch rehearsal',
        description: 'Reworked and rehearsed the project pitch.',
        outcome: 'Pitch deck and demo are aligned.',
        evidenceUrl: 'https://slides.example.edu/pitch-v2',
        reflection: 'Lead with the student workflow and defer implementation details.',
      });
      await service.deleteTime(studentOneId, courseId, timeId);
      expect(
        await service.listTime(studentOneId, courseId, undefined, readingProjectId),
      ).toHaveLength(0);

      const aiUseInput = {
        projectId: readingProjectId,
        date: '2026-07-18',
        tool: 'Codex',
        task: 'Diagnose why the prototype API request failed.',
        output: 'A suggested validation fix and a focused test case.',
        evidenceUrl: 'https://github.com/example/reading-assistant/pull/12',
        reviewed: false,
        safetyNotes: 'Removed API keys and student data before sharing the error.',
        learning: 'The request body needed validation before the database call.',
        sourceMessageId: 'message-ai-use-1',
        sourceKey: 'ai-use-source-1',
      };
      const aiUse = await service.createAiUse(studentOneId, courseId, aiUseInput);
      const repeatedAiUse = await service.createAiUse(studentOneId, courseId, aiUseInput);
      const aiUseId = aiUse._id?.toString() ?? '';
      expect(repeatedAiUse._id?.toString()).toBe(aiUseId);
      expect(await service.listAiUse(studentOneId, courseId, undefined, readingProjectId)).toEqual([
        expect.objectContaining({
          tool: 'Codex',
          reviewed: false,
          projectId: readingProjectId,
        }),
      ]);
      await expect(
        service.updateAiUse(studentOneId, courseId, aiUseId, {
          reviewed: true,
          learning: 'I kept the validation fix and rewrote the suggested test in my own words.',
        }),
      ).resolves.toMatchObject({
        reviewed: true,
        learning: 'I kept the validation fix and rewrote the suggested test in my own words.',
      });
      await expect(
        service.updateAiUse(studentTwoId, courseId, aiUseId, { reviewed: true }),
      ).rejects.toMatchObject({ status: 404 });
      await service.deleteAiUse(studentOneId, courseId, aiUseId);
      expect(await service.listAiUse(studentOneId, courseId)).toHaveLength(0);

      const revision = await service.createWork(studentOneId, courseId, {
        projectId: readingProjectId,
        kind: 'presentation',
        title: 'Reading assistant project pitch — revised',
        description: 'Revision that opens with the prototype.',
        versionOf: presentationId,
        links: [{ label: 'Revised slides', url: 'https://slides.example.edu/pitch-v2' }],
        metadata: { date: '2026-07-19', presentationType: 'Project pitch' },
      });
      const revisionId = revision._id?.toString() ?? '';
      const feedback = await service.createFeedback(teacherId, courseId, {
        studentId: studentOneId,
        projectId: readingProjectId,
        workId: presentationId,
        visibility: 'student',
        content: 'Show the prototype earlier and narrow the target user.',
        actionItems: [
          { text: 'Move the live demo before the technical architecture.' },
          { text: 'Name one specific student audience.' },
        ],
      });
      const feedbackId = feedback._id?.toString() ?? '';
      const actionItemId = feedback.actionItems[0]?.id ?? '';
      const respondedFeedback = await service.updateFeedback(studentOneId, courseId, feedbackId, {
        actionItemId,
        actionStatus: 'addressed',
        studentResponse: 'I moved the demo to slide two and narrowed the audience.',
        connectedRevisionId: revisionId,
      });
      expect(respondedFeedback).toMatchObject({
        studentResponse: 'I moved the demo to slide two and narrowed the audience.',
        connectedRevisionId: revisionId,
      });
      expect(respondedFeedback.actionItems[0]).toMatchObject({
        id: actionItemId,
        status: 'addressed',
      });

      await service.createPost(teacherId, courseId, {
        kind: 'announcement',
        title: 'Prototype review tomorrow',
        body: 'Bring one question you want another team to test.',
      });
      await service.createPost(teacherId, courseId, {
        kind: 'deadline',
        title: 'Paper presentation 3',
        body: 'Be ready to explain the paper’s impact on your project.',
        dueAt: '2026-07-21T20:00:00.000Z',
      });
      await service.createPost(teacherId, courseId, {
        kind: 'schedule',
        title: 'Peer prototype testing',
        body: 'Trade projects and record two concrete observations.',
        startsAt: '2026-07-20T14:00:00.000Z',
      });

      const studentOverview = await service.getOverview(studentOneId, courseId);
      expect(studentOverview.projects).toHaveLength(2);
      expect(studentOverview.posts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'announcement',
            title: 'Prototype review tomorrow',
          }),
          expect.objectContaining({
            kind: 'deadline',
            title: 'Paper presentation 3',
            dueAt: new Date('2026-07-21T20:00:00.000Z'),
          }),
          expect.objectContaining({
            kind: 'schedule',
            title: 'Peer prototype testing',
            startsAt: new Date('2026-07-20T14:00:00.000Z'),
          }),
        ]),
      );

      await expect(
        service.deleteProject(studentTwoId, courseId, demoProjectId),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Only the project creator can delete this project',
      });
      await service.deleteProject(studentOneId, courseId, demoProjectId);
      expect(await models.CourseProject.countDocuments({ courseId })).toBe(1);
      expect(await models.CourseTeam.countDocuments({ courseId })).toBe(1);
      expect(await service.listTeams(studentOneId, courseId)).toHaveLength(1);
      expect(await service.listTeams(studentTwoId, courseId)).toHaveLength(1);

      const activeMembers = await service.listMembers(teacherId, courseId);
      expect(
        activeMembers.filter((member) => member.role === 'student' && member.state === 'active'),
      ).toHaveLength(2);
    });
  });
});
