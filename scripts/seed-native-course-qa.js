const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27018/LibreChat';
const COURSE_NAME = 'INNOVARES Platform Studio — QA';
const TEACHER_EMAIL = 'prof.su.qa@innovares.test';
const QA_PASSWORD = process.env.NATIVE_COURSE_QA_PASSWORD || 'InnovaresQA!2026';

process.env.MONGO_URI = process.env.MONGO_URI || DEFAULT_MONGO_URI;

if (
  !process.env.MONGO_URI.includes('127.0.0.1') &&
  !process.env.MONGO_URI.includes('localhost') &&
  process.env.ALLOW_REMOTE_QA_SEED !== '1'
) {
  throw new Error(
    'The native-course QA seed only runs against localhost unless ALLOW_REMOTE_QA_SEED=1 is set.',
  );
}

const { createModels } = require('@librechat/data-schemas');
const { createCourseService } = require('@librechat/api');

const people = [
  ['Avery Chen', 'Urban systems and data visualization'],
  ['Jordan Brooks', 'Human-centered AI and education'],
  ['Maya Patel', 'Public health and mapping'],
  ['Leo Martinez', 'Environmental sensing'],
  ['Nora Williams', 'Accessible scientific communication'],
  ['Eli Thompson', 'Natural-language interfaces'],
  ['Zoe Kim', 'Inclusive product design'],
  ['Sam Rivera', 'Sustainability and operations'],
  ['Iris Johnson', 'Forecasting and applied statistics'],
  ['Noah Davis', 'Community partnerships'],
  ['Lina Ahmed', 'Mentorship and social networks'],
  ['Owen Garcia', 'Water systems and storytelling'],
  ['Priya Shah', 'Acoustics and campus design'],
  ['Theo Wilson', 'Mobile prototyping'],
  ['Camila Torres', 'Participatory research'],
  ['Miles Brown', 'Learning science and AI evaluation'],
];

const projectDefinitions = [
  {
    title: 'Neighborhood Heat Mapper',
    members: [0, 1, 2, 3],
    problem:
      'Residents and community groups need understandable, block-level evidence about urban heat.',
    targetUser: 'Community organizers and city sustainability staff',
    valueProposition:
      'Turn public temperature and tree-canopy data into a clear map with explainable recommendations.',
    route: ['React map interface', 'Public geospatial data', 'Explainable ranking model'],
  },
  {
    title: 'Accessible Lab Notes',
    members: [4, 5, 6],
    problem:
      'Students with different access needs struggle to turn dense lab notes into usable study materials.',
    targetUser: 'High-school and early-college science students',
    valueProposition:
      'Convert structured lab notes into accessible summaries, glossaries, and review questions.',
    route: ['Structured note editor', 'Accessibility checks', 'Language-model summarization'],
  },
  {
    title: 'Dining Waste Forecast',
    members: [7, 8, 9],
    problem:
      'Dining teams lack a simple view of when and why prepared food is likely to be wasted.',
    targetUser: 'Campus dining managers',
    valueProposition: 'Forecast likely waste and connect each prediction to an operational action.',
    route: ['Historical meal data', 'Baseline forecasting model', 'Operations dashboard'],
  },
  {
    title: 'Mentor Match',
    members: [10],
    problem:
      'Students often choose mentors from a short familiar list rather than by goals and working style.',
    targetUser: 'Pre-college students seeking project mentors',
    valueProposition:
      'Make mentor discovery transparent with preference-based matching and clear explanations.',
    route: ['Preference survey', 'Matching score', 'Explainable profile cards'],
  },
  {
    title: 'Water Quality Story',
    members: [11],
    problem:
      'Raw water-quality readings are difficult for community members to interpret in context.',
    targetUser: 'Families and watershed volunteers',
    valueProposition:
      'Pair sensor readings with plain-language context and a narrative view over time.',
    route: ['Sensor-data parser', 'Threshold annotations', 'Interactive story page'],
  },
  {
    title: 'Campus Quiet Spaces',
    members: [12, 13, 14],
    problem:
      'Students cannot easily find a study location that matches their noise and collaboration needs.',
    targetUser: 'Students looking for a place to focus or meet',
    valueProposition:
      'Combine short sound samples and student observations into a searchable campus guide.',
    route: ['Mobile observation form', 'Noise classification', 'Searchable location cards'],
  },
  {
    title: 'AI Study Coach Evaluation',
    members: [1, 5, 15],
    problem:
      'Students and teachers need evidence about when an AI study coach improves understanding.',
    targetUser: 'Teachers evaluating classroom AI tools',
    valueProposition:
      'Compare coached and uncoached study sessions with transparent learning measures.',
    route: ['Session protocol', 'Learning check', 'Teacher-facing evidence summary'],
  },
];

const paperTitles = [
  'Participatory Data Visualization for Community Decision-Making',
  'Human-Centered Evaluation of Educational AI',
  'Communicating Uncertainty in Public-Facing Maps',
  'Low-Cost Environmental Sensing in Urban Contexts',
  'Accessible Summaries for Technical Learning',
  'Designing Natural-Language Interfaces for Novice Users',
  'Inclusive Design Methods for Student Tools',
  'Forecasting Food Waste in Institutional Kitchens',
  'Interpretable Time-Series Baselines',
  'Community Partnerships in Applied Research',
  'Transparent Matching Systems for Mentorship',
  'Narrative Visualization of Water-Quality Data',
  'Soundscapes and Student Well-Being',
  'Mobile Sensing for Campus Research',
  'Participatory Mapping with Youth',
  'Measuring Learning Gains from AI Tutoring',
];

const projectTimeCategories = ['coding', 'design', 'team_meeting'];

function emailFor(index) {
  return `student${String(index + 1).padStart(2, '0')}.qa@innovares.test`;
}

function slugFor(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

async function upsertUser(models, { email, name, courseRole, interests }) {
  const password = bcrypt.hashSync(QA_PASSWORD, 10);
  const now = new Date();
  return await models.User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        username: slugFor(email.split('@')[0]),
        emailVerified: true,
        password,
        provider: 'local',
        role: 'USER',
        courseRole,
        termsAccepted: true,
        termsAcceptedAt: now,
        profile: {
          preferredName: name,
          interests: [interests],
          bio: `${name} is exploring ${interests.toLowerCase()} through the INNOVARES studio.`,
          website: `https://example.com/portfolio/${slugFor(name)}`,
          github: `https://github.com/${slugFor(name).replace(/\./g, '-')}`,
        },
      },
      $unset: { expiresAt: 1 },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  const models = createModels(mongoose);
  const service = createCourseService(models);

  const teacher = await upsertUser(models, {
    email: TEACHER_EMAIL,
    name: 'Professor Su',
    courseRole: 'teacher',
    interests: 'research mentorship and evidence-centered project learning',
  });
  const students = [];
  for (const [index, [name, interests]] of people.entries()) {
    students.push(
      await upsertUser(models, {
        email: emailFor(index),
        name,
        courseRole: 'student',
        interests,
      }),
    );
  }

  const oldCourses = await models.Course.find({
    name: COURSE_NAME,
    createdBy: teacher._id.toString(),
    status: 'active',
  }).lean();
  for (const course of oldCourses) {
    await service.deleteCourse(teacher._id.toString(), course._id.toString());
  }

  const created = await service.createCourse(teacher._id.toString(), TEACHER_EMAIL, {
    name: COURSE_NAME,
    description:
      'A realistic local QA course for testing project evidence, schedules, feedback, AI use, and reports.',
  });
  const courseId = created.course._id.toString();
  await service.inviteMembers(teacher._id.toString(), courseId, {
    emails: students.map((_, index) => emailFor(index)),
  });

  for (const [index, student] of students.entries()) {
    const [name, interests] = people[index];
    await models.CourseMember.updateOne(
      { courseId, userId: student._id.toString() },
      {
        $set: {
          preferredName: name,
          interests: [interests],
          bio: `${name} is developing a project around ${interests.toLowerCase()}.`,
          website: `https://example.com/portfolio/${slugFor(name)}`,
          github: `https://github.com/${slugFor(name).replace(/\./g, '-')}`,
        },
      },
    );
  }

  const projects = [];
  for (const definition of projectDefinitions) {
    const collaboratorEmails = definition.members.map(emailFor);
    const project = await service.createProject(teacher._id.toString(), courseId, {
      title: definition.title,
      problem: definition.problem,
      targetUser: definition.targetUser,
      valueProposition: definition.valueProposition,
      technicalRoute: {
        capability: definition.route[0],
        dataInput: definition.route[1],
        output: definition.route[2],
        evaluation: 'Run a small user test with one explicit success measure.',
        safeguards: 'Use de-identified data and require a human check before sharing conclusions.',
      },
      collaboratorEmails,
      links: [
        {
          label: 'Working prototype',
          url: `https://example.com/projects/${slugFor(definition.title)}`,
        },
      ],
    });
    projects.push(project);
  }

  const projectsByStudent = people.map((_, index) =>
    projects.filter((__, projectIndex) => projectDefinitions[projectIndex].members.includes(index)),
  );
  const workByStudent = new Map();

  for (const [index, student] of students.entries()) {
    const studentId = student._id.toString();
    const primaryProject = projectsByStudent[index][0];
    const primaryProjectId = primaryProject._id.toString();
    const isTeam = projectDefinitions[projects.indexOf(primaryProject)].members.length > 1;
    const paper = await service.createWork(studentId, courseId, {
      projectId: primaryProjectId,
      kind: 'paper',
      title: paperTitles[index],
      description: `Research connected to ${primaryProject.title}.`,
      links: [
        {
          label: 'Paper',
          url: `https://arxiv.org/search/?query=${encodeURIComponent(
            paperTitles[index],
          )}&searchtype=all`,
        },
      ],
      reflection:
        'The paper helped me identify one assumption to test with users before expanding the prototype.',
      metadata: {
        authors: 'Course research reading',
        year: '2026',
        tags: ['research', 'project evidence'],
        summary: 'A focused reading connected to the project question and intended users.',
        method: 'Literature review and evidence synthesis',
        keyFindings: 'Clear evaluation criteria matter as much as model or prototype complexity.',
        limitations: 'The study context differs from our pre-college pilot.',
        projectImpact: 'We added a smaller first test and a clearer success measure.',
        timeSpentMinutes: 55 + index * 2,
        presentationLink: `https://example.com/slides/${slugFor(people[index][0])}-paper`,
      },
      portfolioState: index % 4 === 0 ? 'selected' : 'none',
    });
    const presentation = await service.createWork(studentId, courseId, {
      projectId: primaryProjectId,
      kind: 'presentation',
      title: `${primaryProject.title}: evidence update`,
      description:
        'A concise project update covering the question, evidence, and next prototype test.',
      links: [
        {
          label: 'Slides',
          url: `https://example.com/slides/${slugFor(primaryProject.title)}-${index + 1}`,
        },
      ],
      reflection:
        'The presentation made the gap between our evidence and our strongest claim easier to see.',
      metadata: {
        date: `2026-07-${String(10 + (index % 7)).padStart(2, '0')}`,
        presentationScope: isTeam ? 'team' : 'individual',
        videoLinks: [
          {
            label: 'Recorded walkthrough',
            url: `https://example.com/video/${slugFor(primaryProject.title)}-${index + 1}`,
          },
        ],
      },
      portfolioState: index % 3 === 0 ? 'selected' : 'none',
    });
    workByStudent.set(studentId, { paper, presentation });

    await service.createTime(studentId, courseId, {
      projectId: primaryProjectId,
      workId: paper._id.toString(),
      date: `2026-07-${String(12 + (index % 5)).padStart(2, '0')}`,
      minutes: 45 + (index % 4) * 10,
      category: 'reading',
      description: `Read and annotated “${paper.title}”.`,
      outcome: 'Captured two useful claims and one limitation for the project.',
      evidenceUrl: paper.links[0]?.url,
    });
    await service.createTime(studentId, courseId, {
      projectId: primaryProjectId,
      workId: presentation._id.toString(),
      date: `2026-07-${String(14 + (index % 4)).padStart(2, '0')}`,
      minutes: 70 + (index % 5) * 15,
      category: projectTimeCategories[index % projectTimeCategories.length],
      description: `Developed and reviewed the ${primaryProject.title} evidence update.`,
      outcome: 'Prepared a testable next version and assigned the next team steps.',
      evidenceUrl: presentation.links[0]?.url,
    });

    await service.createAiUse(studentId, courseId, {
      projectId: primaryProjectId,
      date: `2026-07-${String(15 + (index % 3)).padStart(2, '0')}`,
      tool: ['ChatGPT', 'Claude', 'Perplexity', 'GitHub Copilot'][index % 4],
      task: 'Generate alternative evaluation questions, then compare them with our research notes.',
      output:
        'The tool proposed a short list of evaluation questions and possible measures for each one.',
      evidenceUrl: `https://example.com/ai-notes/${slugFor(people[index][0])}`,
      reviewed: index % 3 !== 0,
      safetyNotes:
        'Removed personal information, checked factual claims against the paper, and kept the final decision human-authored.',
      learning:
        'Broad prompts produced generic ideas; including the intended user and success measure made the suggestions more useful.',
    });
  }

  for (const index of [1, 5]) {
    const student = students[index];
    const secondProject = projectsByStudent[index][1];
    await service.createWork(student._id.toString(), courseId, {
      projectId: secondProject._id.toString(),
      kind: 'project',
      title: `${secondProject.title}: cross-project contribution`,
      description:
        'A documented contribution from a student participating in more than one project.',
      links: [
        {
          label: 'Contribution notes',
          url: `https://example.com/contributions/${slugFor(people[index][0])}`,
        },
      ],
      reflection:
        'Working across two teams helped me reuse an evaluation idea while keeping each project goal distinct.',
    });
  }

  const feedbackRecords = [];
  for (let index = 0; index < 6; index += 1) {
    const student = students[index];
    const studentId = student._id.toString();
    const project = projectsByStudent[index][0];
    const paper = workByStudent.get(studentId).paper;
    feedbackRecords.push(
      await service.createFeedback(teacher._id.toString(), courseId, {
        studentId,
        projectId: project._id.toString(),
        workId: paper._id.toString(),
        content:
          'Your evidence is well chosen. Make the connection between the paper’s limitation and your next user test explicit.',
        actionItems: [
          { text: 'Add one sentence linking the paper limitation to the next test.' },
          { text: 'Name the measure you will use to judge the next prototype.' },
        ],
      }),
    );
  }
  await service.createFeedback(teacher._id.toString(), courseId, {
    studentId: students[1]._id.toString(),
    projectId: projectsByStudent[1][0]._id.toString(),
    visibility: 'teacher',
    content:
      'Private teaching-team note: check that the evaluation scope stays manageable during the next conference.',
  });

  const firstFeedback = feedbackRecords[0];
  await service.updateFeedback(students[0]._id.toString(), courseId, firstFeedback._id.toString(), {
    studentResponse:
      'I revised the project note and added the measurement we will use in the next test.',
    actionItemId: firstFeedback.actionItems[0].id,
    actionStatus: 'addressed',
  });

  await service.createPosts(teacher._id.toString(), courseId, [
    {
      kind: 'announcement',
      title: 'Welcome to the evidence workspace',
      body: 'Use this course space to keep project evidence, research, time, AI use, and feedback connected.',
    },
    {
      kind: 'resource',
      title: 'Project evidence checklist',
      body: 'Use this checklist before the next studio review.',
      links: [{ label: 'Open checklist', url: 'https://example.com/evidence-checklist' }],
    },
    {
      kind: 'deadline',
      title: 'Complete the next evidence update',
      body: 'Add one paper connection, your current slides, and the next test you plan to run.',
      dueAt: '2026-07-22T17:00:00-04:00',
    },
    {
      kind: 'schedule',
      title: 'Paper discussion',
      body: 'Bring one claim and one limitation from your reading.',
      startsAt: '2026-07-20T09:00:00-04:00',
      endsAt: '2026-07-20T10:00:00-04:00',
    },
    {
      kind: 'schedule',
      title: 'Team project studio',
      body: 'Prototype work and teaching-team check-ins.',
      startsAt: '2026-07-20T10:15:00-04:00',
      endsAt: '2026-07-20T12:00:00-04:00',
    },
    {
      kind: 'schedule',
      title: 'Lunch and mentor office hours',
      startsAt: '2026-07-20T12:00:00-04:00',
      endsAt: '2026-07-20T13:00:00-04:00',
    },
    {
      kind: 'schedule',
      title: 'Slide review and recorded demos',
      body: 'Share a concise update and record the current walkthrough.',
      startsAt: '2026-07-20T13:00:00-04:00',
      endsAt: '2026-07-20T15:00:00-04:00',
    },
  ]);

  const reports = [];
  for (let index = 0; index < 4; index += 1) {
    const studentId = students[index]._id.toString();
    const report = await service.generateReport(
      teacher._id.toString(),
      courseId,
      studentId,
      'progress',
    );
    const sections = report.sections.map((section) =>
      section.key === 'teacher'
        ? {
            ...section,
            content:
              'Strength: connects research to a concrete design choice. Next step: define the success measure before expanding the prototype.',
          }
        : section,
    );
    reports.push(
      await service.updateReport(teacher._id.toString(), courseId, report._id.toString(), sections),
    );
  }
  await service.releaseReport(teacher._id.toString(), courseId, reports[0]._id.toString());

  const [
    memberCount,
    teamCount,
    projectCount,
    workCount,
    timeCount,
    aiUseCount,
    feedbackCount,
    postCount,
    reportCount,
  ] = await Promise.all([
    models.CourseMember.countDocuments({ courseId, role: 'student', state: 'active' }),
    models.CourseTeam.countDocuments({ courseId }),
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
        teacherEmail: TEACHER_EMAIL,
        exampleStudentEmail: emailFor(0),
        counts: {
          students: memberCount,
          teams: teamCount,
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
