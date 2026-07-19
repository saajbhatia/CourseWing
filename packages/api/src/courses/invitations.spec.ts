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

describe('native course bulk invitations', () => {
  const models = createModels(mongoose);
  const service = createCourseService(models);

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('activates existing accounts and never demotes an existing teacher membership', async () => {
    const teacherObjectId = new mongoose.Types.ObjectId();
    const studentObjectId = new mongoose.Types.ObjectId();
    const teacherId = teacherObjectId.toString();
    const studentId = studentObjectId.toString();

    await tenantStorage.run({ tenantId: 'invite-school' }, async () => {
      await models.User.create({
        _id: studentObjectId,
        name: 'Existing Student',
        username: 'existing.student',
        email: 'student@example.edu',
        provider: 'local',
        password: 'not-a-real-password-hash',
        emailVerified: true,
      });
      const access = await service.createCourse(teacherId, 'teacher@example.edu', {
        name: 'Example Course',
      });
      const courseId = access.course._id?.toString() ?? '';

      const invited = await service.inviteMembers(teacherId, courseId, {
        emails: ['teacher@example.edu', 'student@example.edu'],
      });

      expect(invited).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            normalizedEmail: 'teacher@example.edu',
            role: 'teacher',
            state: 'active',
            userId: teacherId,
          }),
          expect.objectContaining({
            normalizedEmail: 'student@example.edu',
            role: 'student',
            state: 'active',
            userId: studentId,
          }),
        ]),
      );
    });
  });

  test('rejects more than 200 inputs instead of silently truncating the batch', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();

    await tenantStorage.run({ tenantId: 'invite-school' }, async () => {
      const access = await service.createCourse(teacherId, 'teacher@example.edu', {
        name: 'Example Course',
      });
      const courseId = access.course._id?.toString() ?? '';

      await expect(
        service.inviteMembers(teacherId, courseId, {
          emails: Array.from({ length: 201 }, (_, index) => `student${index}@example.edu`),
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'No more than 200 students can be invited at once',
      });
      await expect(models.CourseMember.countDocuments({ courseId, role: 'student' })).resolves.toBe(
        0,
      );
    });
  });

  test('lets a teacher remove a student without deleting their account or submitted records', async () => {
    const teacherId = new mongoose.Types.ObjectId().toString();
    const studentObjectId = new mongoose.Types.ObjectId();
    const studentId = studentObjectId.toString();

    await tenantStorage.run({ tenantId: 'invite-school' }, async () => {
      await models.User.create({
        _id: studentObjectId,
        name: 'Student to remove',
        username: 'student.remove',
        email: 'remove@example.edu',
        provider: 'local',
        password: 'not-a-real-password-hash',
        emailVerified: true,
      });
      const access = await service.createCourse(teacherId, 'teacher@example.edu', {
        name: 'Example Course',
      });
      const courseId = access.course._id?.toString() ?? '';
      const [student] = await service.inviteMembers(teacherId, courseId, {
        emails: ['remove@example.edu'],
      });
      const team = await service.createTeam(teacherId, courseId, {
        name: 'Example team',
        memberIds: [studentId],
      });

      await service.removeMember(teacherId, courseId, student._id?.toString() ?? '');

      await expect(service.listMembers(teacherId, courseId)).resolves.not.toEqual(
        expect.arrayContaining([expect.objectContaining({ normalizedEmail: 'remove@example.edu' })]),
      );
      await expect(
        models.CourseMember.findById(student._id).lean(),
      ).resolves.toMatchObject({ state: 'removed' });
      await expect(models.CourseTeam.findById(team._id).lean()).resolves.toMatchObject({
        memberIds: [],
      });
      await expect(models.User.exists({ _id: studentObjectId })).resolves.toBeTruthy();
    });
  });
});
