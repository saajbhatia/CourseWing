const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27018/LibreChat';
const COURSE_NAME = 'INNOVARES Project Studio — Example';
const TEACHER_EMAIL = 'tingsu.work@gmail.com';
const STUDENT_EMAIL = 'tingsu.test.student@2utorly.test';
const TEACHER_PASSWORD_ENV = 'PROFESSOR_SU_PASSWORD';
const STUDENT_PASSWORD_ENV = 'INNOVARES_TEST_STUDENT_PASSWORD';

process.env.MONGO_URI = process.env.MONGO_URI || DEFAULT_MONGO_URI;

function isLocalMongoUri(uri) {
  const authority = uri.split('://')[1]?.split('/')[0]?.split('?')[0];
  if (!authority) {
    return false;
  }
  const hostList = authority.slice(authority.lastIndexOf('@') + 1).split(',');
  return hostList.every((hostAndPort) => {
    const host = hostAndPort.startsWith('[')
      ? hostAndPort.slice(1, hostAndPort.indexOf(']'))
      : hostAndPort.split(':')[0];
    return ['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase());
  });
}

if (!isLocalMongoUri(process.env.MONGO_URI) && process.env.ALLOW_REMOTE_PROFESSOR_SU_SEED !== '1') {
  throw new Error(
    'The Professor Su example seed only runs against localhost unless ' +
      'ALLOW_REMOTE_PROFESSOR_SU_SEED=1 is set.',
  );
}

const { createModels } = require('@librechat/data-schemas');
const { createCourseService } = require('@librechat/api');

function usernameFor(email) {
  return email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function accountPassword(envName) {
  const supplied = process.env[envName];
  if (supplied && supplied.length < 12) {
    throw new Error(`${envName} must contain at least 12 characters.`);
  }
  return supplied || crypto.randomBytes(24).toString('base64url');
}

async function ensureAccount(models, { email, name, courseRole, passwordEnv, profile }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await models.User.findOne({ email: normalizedEmail });
  if (existing) {
    if (existing.courseRole !== courseRole) {
      await models.User.updateOne({ _id: existing._id }, { $set: { courseRole } });
      existing.courseRole = courseRole;
    }
    return { user: existing, created: false };
  }

  const password = accountPassword(passwordEnv);
  const user = await models.User.create({
    email: normalizedEmail,
    name,
    username: usernameFor(normalizedEmail),
    emailVerified: true,
    password: await bcrypt.hash(password, 10),
    provider: 'local',
    role: 'USER',
    courseRole,
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    profile,
  });
  return { user, created: true, password };
}

async function ensureTeacherMembership(models, teacher, courseId) {
  const normalizedEmail = TEACHER_EMAIL.toLowerCase();
  const existing = await models.CourseMember.findOne({ courseId, normalizedEmail });
  if (existing) {
    await models.CourseMember.updateOne(
      { _id: existing._id },
      {
        $set: {
          userId: teacher._id.toString(),
          email: normalizedEmail,
          role: 'teacher',
          state: 'active',
          invitedBy: teacher._id.toString(),
          joinedAt: existing.joinedAt || new Date(),
        },
      },
    );
    return;
  }

  await models.CourseMember.create({
    courseId,
    userId: teacher._id.toString(),
    email: normalizedEmail,
    normalizedEmail,
    role: 'teacher',
    state: 'active',
    invitedBy: teacher._id.toString(),
    joinedAt: new Date(),
  });
}

async function ensureCourse(models, service, teacher) {
  let course = await models.Course.findOne({
    name: COURSE_NAME,
    createdBy: teacher._id.toString(),
    status: 'active',
  }).sort({ _id: 1 });

  if (!course) {
    const created = await service.createCourse(teacher._id.toString(), TEACHER_EMAIL, {
      name: COURSE_NAME,
      description:
        'An example INNOVARES workspace for project evidence, paper reading, presentations, AI use, feedback, schedules, and reports.',
    });
    course = created.course;
  }

  await ensureTeacherMembership(models, teacher, course._id.toString());
  return course;
}

async function ensureProject(models, service, teacher, student, courseId) {
  const title = 'Neighborhood Heat Story';
  let project = await models.CourseProject.findOne({ courseId, title }).sort({ _id: 1 });
  if (!project) {
    project = await service.createProject(teacher._id.toString(), courseId, {
      title,
      problem:
        'Community members need a clear way to understand how heat exposure differs across nearby neighborhoods.',
      targetUser: 'Community organizers and families planning around extreme heat',
      valueProposition:
        'Turn public temperature and tree-canopy data into an understandable story with practical next steps.',
      technicalRoute: {
        capability: 'Interactive neighborhood heat comparison',
        dataInput: 'Public temperature, land-cover, and tree-canopy data',
        output: 'A map and short evidence-based neighborhood story',
        evaluation:
          'Ask five users to interpret the same comparison and explain their next action.',
        safeguards:
          'Use public, de-identified data and label uncertainty before sharing conclusions.',
      },
      collaboratorEmails: [STUDENT_EMAIL],
    });
    return project;
  }

  let team = await models.CourseTeam.findOne({ _id: project.teamId, courseId });
  if (!team) {
    team = await models.CourseTeam.create({
      courseId,
      name: title,
      description: 'Project collaborators',
      memberIds: [student._id.toString()],
      createdBy: teacher._id.toString(),
    });
    await models.CourseProject.updateOne(
      { _id: project._id, courseId },
      { $set: { teamId: team._id.toString() } },
    );
    project.teamId = team._id.toString();
  }

  await Promise.all([
    models.CourseProject.updateOne(
      { _id: project._id },
      { $addToSet: { collaboratorEmails: STUDENT_EMAIL } },
    ),
    models.CourseTeam.updateOne(
      { _id: team._id, courseId },
      { $addToSet: { memberIds: student._id.toString() } },
    ),
  ]);
  return project;
}

async function ensurePost(models, service, teacherId, courseId, post) {
  const existing = await models.CoursePost.exists({
    courseId,
    kind: post.kind,
    title: post.title,
  });
  if (!existing) {
    await service.createPost(teacherId, courseId, post);
  }
}

function dateOnly(dayOffset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function futureTime(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function seedExampleEvidence(models, service, teacher, student, courseId) {
  const teacherId = teacher._id.toString();
  const studentId = student._id.toString();
  const project = await ensureProject(models, service, teacher, student, courseId);
  const projectId = project._id.toString();

  const paper = await service.createWork(teacherId, courseId, {
    studentId,
    projectId,
    kind: 'paper',
    title: 'Mapping Urban Heat Inequality',
    description:
      'An example research reading that connects public heat data to community-facing design decisions.',
    links: [
      {
        label: 'Related research',
        url: 'https://arxiv.org/search/?query=urban+heat+inequality&searchtype=all',
      },
    ],
    reflection:
      'The reading showed why local context and uncertainty should be visible in the final map.',
    metadata: {
      authors: 'Example research team',
      year: '2023',
      tags: ['urban heat', 'community data', 'mapping'],
      summary:
        'The paper demonstrates how neighborhood-scale evidence can reveal unequal heat exposure.',
      keyFindings:
        'Tree cover, surface materials, and the time of measurement all affect the story the data tells.',
      limitations:
        'The study location and measurement conditions do not perfectly match the example project.',
      projectImpact:
        'The project will label uncertainty and compare neighborhoods using the same measurement window.',
      timeSpentMinutes: 55,
    },
    portfolioState: 'selected',
    sourceKey: 'professor-su-example-paper-v1',
  });

  const slides = await service.createWork(teacherId, courseId, {
    studentId,
    projectId,
    kind: 'presentation',
    title: 'Neighborhood Heat Story — Project Update',
    description:
      'A short example deck covering the problem, current evidence, prototype direction, and next test.',
    links: [
      {
        label: 'Example slides',
        url: 'https://docs.google.com/presentation/d/1example-innovares-heat-story/edit',
      },
    ],
    reflection:
      'Building the deck made it clear that the next version needs one primary comparison rather than several.',
    metadata: {
      date: dateOnly(),
      presentationScope: 'individual',
      videoLinks: [
        {
          label: 'Example walkthrough',
          url: 'https://example.com/innovares/neighborhood-heat-walkthrough',
        },
      ],
    },
    portfolioState: 'selected',
    sourceKey: 'professor-su-example-slides-v1',
  });

  await Promise.all([
    service.createTime(teacherId, courseId, {
      studentId,
      projectId,
      workId: paper._id.toString(),
      date: dateOnly(-2),
      minutes: 55,
      category: 'reading',
      description: 'Read and annotated the urban heat paper.',
      outcome: 'Recorded two useful findings and one limitation for the project.',
      evidenceUrl: paper.links[0]?.url,
      sourceKey: 'professor-su-example-reading-time-v1',
    }),
    service.createTime(teacherId, courseId, {
      studentId,
      projectId,
      workId: slides._id.toString(),
      date: dateOnly(-1),
      minutes: 80,
      category: 'slide_building',
      description: 'Built the project update and reviewed the evidence sequence.',
      outcome: 'Reduced the update to one clear claim, supporting evidence, and next test.',
      evidenceUrl: slides.links[0]?.url,
      sourceKey: 'professor-su-example-slides-time-v1',
    }),
    service.createAiUse(teacherId, courseId, {
      studentId,
      projectId,
      date: dateOnly(-1),
      tool: 'ChatGPT',
      task: 'Propose three user-test questions for the neighborhood heat story, using the project audience and success criteria.',
      output:
        'The AI proposed questions about interpretation, trust, and whether a user could identify a practical next action.',
      evidenceUrl: 'https://example.com/innovares/ai-use-notes',
      reviewed: true,
      safetyNotes:
        'No personal information was shared. Each proposed question was checked against the project goal and edited by the student.',
      learning:
        'Giving the AI the intended audience and evaluation goal produced more useful questions than asking for generic feedback.',
      sourceKey: 'professor-su-example-ai-use-v1',
    }),
  ]);

  const feedbackContent =
    'Your evidence is focused and the project direction is understandable. In the next version, show how the paper’s limitation changes the way you label the map.';
  const feedbackExists = await models.CourseFeedback.exists({
    courseId,
    studentId,
    projectId,
    workId: slides._id.toString(),
    authorId: teacherId,
    content: feedbackContent,
  });
  if (!feedbackExists) {
    await service.createFeedback(teacherId, courseId, {
      studentId,
      projectId,
      workId: slides._id.toString(),
      content: feedbackContent,
      actionItems: [
        { text: 'Add one uncertainty label to the main map comparison.' },
        { text: 'Name the measure that will determine whether the user test succeeds.' },
      ],
    });
  }

  await ensurePost(models, service, teacherId, courseId, {
    kind: 'announcement',
    title: 'Welcome to the INNOVARES example course',
    body: 'Use this workspace to keep project work, research, time, AI use, feedback, and reports connected.',
  });
  await ensurePost(models, service, teacherId, courseId, {
    kind: 'deadline',
    title: 'Share the next evidence update',
    body: 'Add one paper connection, your current slides, and the test you plan to run next.',
    dueAt: futureTime(7, 17),
  });
  await ensurePost(models, service, teacherId, courseId, {
    kind: 'schedule',
    title: 'Project studio and feedback',
    body: 'Bring your current evidence and one question for the teaching team.',
    startsAt: futureTime(2, 10),
    endsAt: futureTime(2, 12),
  });

  const existingReport = await models.CourseReport.exists({
    courseId,
    studentId,
    kind: 'progress',
  });
  if (!existingReport) {
    const report = await service.generateReport(teacherId, courseId, studentId, 'progress');
    const sections = report.sections.map((section) =>
      section.key === 'teacher'
        ? {
            ...section,
            content:
              'The student connects research to a concrete design choice. Next, they should define the success measure before expanding the prototype.',
          }
        : section,
    );
    await service.updateReport(teacherId, courseId, report._id.toString(), sections);
  }
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  const models = createModels(mongoose);
  const service = createCourseService(models);

  const teacherAccount = await ensureAccount(models, {
    email: TEACHER_EMAIL,
    name: 'Ting Su',
    courseRole: 'teacher',
    passwordEnv: TEACHER_PASSWORD_ENV,
    profile: {
      preferredName: 'Ting Su',
      interests: ['research mentorship', 'evidence-centered project learning'],
      bio: 'Instructor for the INNOVARES project studio.',
    },
  });
  const studentAccount = await ensureAccount(models, {
    email: STUDENT_EMAIL,
    name: 'Alex Morgan',
    courseRole: 'student',
    passwordEnv: STUDENT_PASSWORD_ENV,
    profile: {
      preferredName: 'Alex',
      interests: ['community data', 'visual storytelling', 'human-centered design'],
      bio: 'Example student exploring how public data can support community decisions.',
      website: 'https://example.com/alex-morgan',
      github: 'https://github.com/example-student',
    },
  });

  const teacher = teacherAccount.user;
  const student = studentAccount.user;
  const course = await ensureCourse(models, service, teacher);
  const courseId = course._id.toString();

  await service.inviteMembers(teacher._id.toString(), courseId, { emails: [STUDENT_EMAIL] });
  await models.CourseMember.updateOne(
    {
      courseId,
      userId: student._id.toString(),
      $or: [{ preferredName: '' }, { preferredName: { $exists: false } }],
    },
    {
      $set: {
        preferredName: 'Alex',
        interests: ['community data', 'visual storytelling', 'human-centered design'],
        bio: 'Example student exploring how public data can support community decisions.',
        website: 'https://example.com/alex-morgan',
        github: 'https://github.com/example-student',
      },
    },
  );

  await seedExampleEvidence(models, service, teacher, student, courseId);

  const [
    studentCount,
    projectCount,
    workCount,
    timeCount,
    aiUseCount,
    feedbackCount,
    postCount,
    reportCount,
  ] = await Promise.all([
    models.CourseMember.countDocuments({ courseId, role: 'student', state: 'active' }),
    models.CourseProject.countDocuments({ courseId }),
    models.CourseWork.countDocuments({ courseId, deletedAt: { $exists: false } }),
    models.CourseTime.countDocuments({ courseId, deletedAt: { $exists: false } }),
    models.CourseAiUse.countDocuments({ courseId, deletedAt: { $exists: false } }),
    models.CourseFeedback.countDocuments({ courseId }),
    models.CoursePost.countDocuments({ courseId }),
    models.CourseReport.countDocuments({ courseId }),
  ]);

  console.log(
    JSON.stringify(
      {
        courseId,
        courseName: COURSE_NAME,
        teacher: {
          email: TEACHER_EMAIL,
          created: teacherAccount.created,
          ...(teacherAccount.created ? { temporaryPassword: teacherAccount.password } : {}),
        },
        testStudent: {
          email: STUDENT_EMAIL,
          created: studentAccount.created,
          ...(studentAccount.created ? { temporaryPassword: studentAccount.password } : {}),
        },
        counts: {
          activeStudents: studentCount,
          projects: projectCount,
          work: workCount,
          time: timeCount,
          aiUse: aiUseCount,
          feedback: feedbackCount,
          posts: postCount,
          reports: reportCount,
        },
      },
      null,
      2,
    ),
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
