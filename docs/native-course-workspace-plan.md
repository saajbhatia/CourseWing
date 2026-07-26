# Native Course Workspace Plan

## Status

- Branch: `feature/native-course-workspace`
- Base: clean `main`
- Phase: functional first version implemented and verified
- Canvas access: explicitly out of scope for this branch
- Deployment target: `class.coursewing.org`
- Change state: versioned independently from the Canvas-backed `main` application

This document translates the confidential INNOVARES requirements into an implementation plan without reproducing private course logistics. It should remain inside the development repository.

## Implementation Snapshot

The first version now includes:

- Tenant-isolated native course, membership, team, project, milestone, work, time, feedback, post, and report models
- Teacher and student APIs with course-role authorization
- Pending membership activation from a matching signed-in email
- Separate teacher and student workspaces under `/workspace/courses/*`
- Native courses in the main LibreChat sidebar with a teacher-only `+` create action
- A single role-specific course sidebar when a course is open, rather than nested sidebars
- Account-level `courseRole` (`teacher` or `student`) with server-enforced course creation
- Teacher roster, groups, project records, milestones, review, feedback, private notes, reports, resources, and announcements
- Student Develop, group project, milestones, private portfolio, feedback, course feed, PDF upload, and spreadsheet-like time log
- Secure access to PDFs referenced by course work
- Native course AI tools for context, evidence saves, stated-time logging, and AI review, including idempotency and undo
- Evidence-linked editable report drafts with deliberate teacher release
- Focused authorization, idempotency, privacy, and file-access tests

The following integration work is intentionally deferred:

- Sending real invitation emails or hosted invite links; the first version creates pending memberships and activates them from matching emails
- Automatically attaching the native course tools to a dedicated course agent or embedded Develop chat; the tools are implemented and can be attached to a LibreChat agent
- LLM-written report prose; the first version produces an editable deterministic draft from evidence
- PPTX parsing, arbitrary URL ingestion, public portfolio publishing, and Canvas synchronization

## Objective

Build a native 2utorly course workspace where a teacher can create a course, create project groups, invite students by email, set milestones, review student work, and prepare evidence-linked reports.

Students receive a separate, calmer experience centered on a private **Develop** workspace. They upload work, use AI while developing it, maintain a portfolio, contribute to a shared group project, receive AI and teacher feedback, and build an automatic evidence trail.

The product is not a Canvas clone. It is a course operating layer that can run independently now and accept external LMS adapters later.

## Locked Product Decisions

1. The only course-facing roles are `teacher` and `student`.
2. TAs use the `teacher` role.
3. Teacher accounts can create courses; student accounts cannot.
4. A teacher creates a course group and adds students by email.
5. Each student has a private Develop page.
6. Each group has a shared project record.
7. Group records and individual student logs remain separate but linked.
8. Work is organized around milestones and next actions, not deadlines.
9. PDF upload is the reliable artifact format for the first version.
10. PPTX ingestion and arbitrary link ingestion are not assumed to work.
11. Portfolio material starts private.
12. AI automatically saves useful course evidence without asking for confirmation.
13. Every automatic save is visible, attributable, and undoable.
14. AI review and teacher feedback are both supported and visually distinguished.
15. Teachers can write student-visible feedback and private teacher notes.
16. AI-generated reports remain teacher-only until explicitly released.
17. This branch has no Canvas API, token, sync, course-ID, or service dependency.

## Product Principles

### Different interfaces for different jobs

The teacher and student applications share typography, colors, primitives, and navigation behavior, but not the same home screen.

- Teachers organize people, groups, evidence, reviews, and reports.
- Students make things, talk with AI, upload work, reflect, and follow milestones.

### Progressive disclosure

The UI must not repeat the dense card dashboard concept from the rejected mockup. Each screen gets one primary job, with detail behind rows, drawers, and dedicated pages.

### Work first, administration second

Students should not repeatedly fill out administrative forms. Their normal work with files and AI should create the structured record.

### Evidence before analytics

The system records sources, versions, time, reflections, and feedback. It does not pretend that counts or AI-generated scores are reliable measures of learning.

### Private by default

Student work is visible only to that student and teachers in the course. Group project records are visible to group members and teachers. Portfolio selection does not make anything public.

## User Journeys

### Teacher setup

1. Teacher creates a native course.
2. Teacher adds a course name, short description, and optional resources.
3. Teacher creates one or more project groups.
4. Teacher enters student emails or pastes a list.
5. The system creates pending memberships. Email delivery and hosted invite links are a later integration.
6. A student who registers or signs in with a matching normalized email activates the membership.
7. Teacher assigns students to groups and can move them later.

### Student daily work

1. Student opens the course and sees the current milestone, group project, recent feedback, and their next action.
2. Student opens Develop and uploads a PDF or uses a LibreChat agent configured with the native course tools.
3. The student or configured agent creates a structured work record.
4. AI can summarize the work, identify what changed, attach it to a milestone, create an AI review, and update the evidence timeline.
5. When a student says, for example, “I spent two hours testing the prototype,” the AI appends a structured time entry.
6. The UI shows an unobtrusive receipt such as `Saved to Develop · Undo`.
7. The student can correct or remove any AI-created entry.
8. The student can mark selected work as portfolio-ready while it remains private.

### Group project work

1. Group members share one project record.
2. The project tracks its problem, target user, technical route, current stage, risks, milestones, and links.
3. Individual evidence can be linked to the group project without becoming group-owned.
4. The project page shows member contributions by referencing individual work records.
5. Teachers can edit the group project and review all linked contributions.

### Teacher review

1. Teacher opens a student or a review queue item.
2. Teacher sees the original artifact, AI review, student reflection, version history, time entries, and linked milestone.
3. Teacher adds student-visible feedback, action items, or a private note.
4. Student revises the artifact; the new version remains connected to the original.
5. Teacher can see whether feedback was addressed.

### Report preparation

1. Teacher opens a student report.
2. The system generates a draft from structured evidence and links every claim to its source records.
3. AI may improve phrasing but cannot silently create unsupported facts.
4. Teacher edits the report, excludes inappropriate evidence, and adds narrative judgment.
5. Drafts and private notes are invisible to the student.
6. Teacher explicitly releases an approved report.

## Information Architecture

### Shared route boundary

Use a route namespace that does not collide with the existing Canvas course route:

```text
/workspace/courses/:courseId/*
```

Do not modify or import from `client/src/components/CourseWing` for this feature.

### Teacher navigation

```text
Course
├── Home
├── Students
├── Groups
├── Review
├── Reports
└── Resources
```

#### Teacher Home

A restrained operational page:

- Course title and course switcher
- Create announcement
- Add students
- A short “Needs attention” list
- Current milestones
- Recent activity

It does not put every metric, group, review, and report on the same screen.

#### Students

- Searchable student list
- Group and current milestone
- Last activity
- Missing or incomplete core records
- Student detail opens as a dedicated page

#### Groups

- Group list
- Create group
- Add or move students
- Shared project record
- Group milestones and linked individual contributions

#### Review

- Unreviewed or revised artifacts
- Filter by student, group, type, or milestone
- AI review shown as supporting context
- Teacher feedback and private note controls

#### Reports

- Draft, ready for review, and released states
- Student report editor
- Evidence drawer
- Explicit release action

#### Resources

- Teacher-managed title, description, category, and PDF or approved URL
- Student read-only access
- Optional milestone association

### Student navigation

```text
Course
├── Home
├── Develop
├── Group Project
├── Milestones
├── Portfolio
├── Feedback
└── Resources
```

#### Student Home

- Current milestone
- Personal next action
- Latest announcement
- Recent feedback
- Continue working button

#### Develop

This is the center of the student experience.

- Native course tools that can be attached to a course-aware LibreChat agent
- PDF upload
- Recent work timeline
- Automatic-save receipts
- Simple filters for papers, presentations, project work, AI use, and time
- Artifact detail and version history in a drawer or dedicated route

The timeline is generated from normal student activity rather than a collection of separate forms.

#### Group Project

- Shared project identity and technical route
- Current milestone and risks
- Group links and PDF artifacts
- Member contribution references
- Group-level feedback

#### Portfolio

- A filtered view of personal artifacts marked portfolio-ready
- Draft and teacher-approved states
- No public publishing in this branch

#### Feedback

- AI reviews clearly labeled `AI review`
- Teacher comments clearly labeled with the teacher’s identity
- Action items and revision status
- Private teacher notes never appear

## Domain Model

Do not reuse LibreChat’s existing global `Group` model for student project teams. That model represents security principals and external directory groups. Course teams require their own lifecycle and authorization rules.

All new documents carry `tenantId`, use strict tenant isolation, and include timestamps.

### Course

```ts
type Course = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdBy: string;
  status: 'active' | 'archived';
  origin: 'native';
};
```

The `origin` field creates a future adapter seam without adding Canvas access to this branch.

### Membership

```ts
type CourseMembership = {
  id: string;
  tenantId: string;
  courseId: string;
  userId?: string;
  email: string;
  role: 'teacher' | 'student';
  state: 'pending' | 'active' | 'removed';
  invitedBy: string;
  joinedAt?: Date;
};
```

Important indexes:

- Unique active or pending membership by `tenantId + courseId + normalizedEmail`
- Course roster pagination by `tenantId + courseId + state`
- User course lookup by `tenantId + userId + state`

The role is course-scoped. A person may teach one course and be a student in another.

### Team

```ts
type CourseTeam = {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdBy: string;
};
```

Membership changes validate that every member is an active student in the same course.

### Project

```ts
type CourseProject = {
  id: string;
  tenantId: string;
  courseId: string;
  teamId: string;
  title: string;
  problem?: string;
  targetUser?: string;
  valueProposition?: string;
  technicalRoute?: {
    capability?: string;
    dataInput?: string;
    output?: string;
    evaluation?: string;
    safeguards?: string;
  };
  currentStage: 'idea' | 'exploring' | 'prototype' | 'testing' | 'revised' | 'complete';
  risks?: string[];
  links?: CourseLink[];
};
```

The first version assumes one active project per team while allowing the schema to support later historical projects.

### Milestone

```ts
type CourseMilestone = {
  id: string;
  tenantId: string;
  courseId: string;
  projectId?: string;
  studentId?: string;
  title: string;
  description?: string;
  status: 'exploring' | 'working' | 'ready' | 'revised' | 'complete';
  createdBy: string;
};
```

Milestones have no required due date. Group milestones and individual next actions use the same underlying model with different ownership.

### Work

```ts
type CourseWork = {
  id: string;
  tenantId: string;
  courseId: string;
  studentId: string;
  teamId?: string;
  projectId?: string;
  milestoneId?: string;
  kind: 'paper' | 'presentation' | 'project' | 'portfolio' | 'reflection' | 'other';
  title: string;
  description?: string;
  fileIds: string[];
  links: CourseLink[];
  source: 'student' | 'ai' | 'teacher';
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
  versionOf?: string;
  portfolioState: 'none' | 'selected' | 'approved';
  aiSummary?: string;
  reflection?: string;
};
```

PDFs use the existing LibreChat file pipeline. Course work stores file references rather than duplicating file bytes or extracted text.

Provenance fields make AI-created records explainable and make automatic saves idempotent.

### Time entry

```ts
type CourseTimeEntry = {
  id: string;
  tenantId: string;
  courseId: string;
  studentId: string;
  projectId?: string;
  milestoneId?: string;
  workId?: string;
  date: Date;
  minutes: number;
  category:
    | 'reading'
    | 'research'
    | 'coding'
    | 'design'
    | 'testing'
    | 'presentation'
    | 'meeting'
    | 'other';
  description: string;
  sourceMessageId?: string;
  sourceToolCallId?: string;
};
```

The UI presents these entries as a spreadsheet-like table. The database remains the source of truth; CSV/XLSX export can be added without making a mutable spreadsheet file the canonical record.

### Feedback

```ts
type CourseFeedback = {
  id: string;
  tenantId: string;
  courseId: string;
  studentId: string;
  workId?: string;
  projectId?: string;
  authorId?: string;
  authorType: 'ai' | 'teacher';
  visibility: 'student' | 'teacher';
  content: string;
  actionItems: Array<{
    id: string;
    text: string;
    status: 'open' | 'addressed';
  }>;
};
```

AI feedback is always student-visible and labeled. AI cannot create private teacher notes.

### Post

```ts
type CoursePost = {
  id: string;
  tenantId: string;
  courseId: string;
  authorId: string;
  kind: 'announcement' | 'resource';
  title: string;
  body?: string;
  fileIds: string[];
  links: CourseLink[];
  publishedAt: Date;
};
```

This keeps announcements and resources lightweight and avoids a full LMS content system.

### Report

```ts
type CourseReport = {
  id: string;
  tenantId: string;
  courseId: string;
  studentId: string;
  kind: 'progress' | 'final';
  status: 'draft' | 'reviewed' | 'released';
  sections: ReportSection[];
  evidenceIds: string[];
  generatedAt?: Date;
  generatedBy?: string;
  releasedAt?: Date;
  releasedBy?: string;
  version: number;
};
```

Reports store editable sections and evidence references. Private feedback is excluded unless a teacher explicitly converts it into report narrative.

## API Design

Use authenticated, course-scoped REST endpoints under:

```text
/api/courses
```

Representative endpoints:

```text
POST   /api/courses
GET    /api/courses
GET    /api/courses/:courseId
PATCH  /api/courses/:courseId

GET    /api/courses/:courseId/members
POST   /api/courses/:courseId/members
PATCH  /api/courses/:courseId/members/:memberId
DELETE /api/courses/:courseId/members/:memberId

GET    /api/courses/:courseId/teams
POST   /api/courses/:courseId/teams
PATCH  /api/courses/:courseId/teams/:teamId

GET    /api/courses/:courseId/projects/:projectId
PATCH  /api/courses/:courseId/projects/:projectId

GET    /api/courses/:courseId/milestones
POST   /api/courses/:courseId/milestones
PATCH  /api/courses/:courseId/milestones/:milestoneId

GET    /api/courses/:courseId/work
POST   /api/courses/:courseId/work
PATCH  /api/courses/:courseId/work/:workId
DELETE /api/courses/:courseId/work/:workId
POST   /api/courses/:courseId/work/:workId/undo

GET    /api/courses/:courseId/time
POST   /api/courses/:courseId/time
PATCH  /api/courses/:courseId/time/:entryId

GET    /api/courses/:courseId/feedback
POST   /api/courses/:courseId/feedback
PATCH  /api/courses/:courseId/feedback/:feedbackId

GET    /api/courses/:courseId/review
GET    /api/courses/:courseId/reports
POST   /api/courses/:courseId/reports/:studentId/generate
PATCH  /api/courses/:courseId/reports/:reportId
POST   /api/courses/:courseId/reports/:reportId/release

GET    /api/courses/:courseId/posts
POST   /api/courses/:courseId/posts
```

### Authorization

Every handler follows the same order:

1. Resolve authenticated tenant and user.
2. Validate the course ID.
3. Resolve active course membership inside the same tenant.
4. Apply teacher or student policy.
5. Scope every database query by tenant, course, and permitted student/team.
6. Return a uniform not-found response for resources outside the caller’s scope.

Student restrictions:

- Can read their own personal work and feedback.
- Can read the shared project for their active team.
- Can read published course posts and resources.
- Can update their own work, reflections, time entries, and permitted shared-project fields.
- Cannot read another student’s private work.
- Cannot read draft reports or private teacher notes.

Teacher permissions:

- Can manage the course roster, teams, milestones, posts, projects, work metadata, feedback, and reports.
- Can read all evidence inside their course.
- Cannot cross tenant or course boundaries.

## Code Placement

Follow the repository’s TypeScript-first boundaries.

### Database

```text
packages/data-schemas/src/types/course/
packages/data-schemas/src/schema/course/
packages/data-schemas/src/models/course/
packages/data-schemas/src/methods/course/
```

Each directory uses small single-purpose files such as `course.ts`, `member.ts`, `team.ts`, and `work.ts`.

### Shared API types

```text
packages/data-provider/src/types/course.ts
packages/data-provider/src/react-query/course.ts
```

Endpoint constants remain in `packages/data-provider/src/api-endpoints.ts`, query keys in `packages/data-provider/src/keys.ts`, and service functions in `packages/data-provider/src/data-service.ts`.

### Backend

```text
packages/api/src/courses/
├── access.ts
├── handlers.ts
├── service.ts
├── tools.ts
├── reports.ts
└── index.ts
```

Only a thin route registration wrapper belongs in legacy `/api`.

### Frontend

```text
client/src/components/Courses/
├── Shared/
├── Student/
└── Teacher/

client/src/data-provider/Courses/
client/src/routes/CourseWorkspace.tsx
```

All user-facing copy uses `useLocalize()` and English translation keys.

### Canvas isolation

The new feature must not:

- Import from `packages/api/src/coursewing`
- Import from `client/src/components/CourseWing`
- Call `/api/coursewing`
- Read `canvasCourseId`, `canvasAccountKey`, or Canvas tokens
- Depend on the external Canvas service

This creates a clean merge boundary with the separate Canvas teacher UI being developed on `main`.

## AI Automation

### Course-scoped tools

Add narrowly scoped tools available only in a Develop conversation:

```text
course_record_work
course_log_time
course_link_milestone
course_update_project
course_add_ai_review
course_get_student_context
course_undo_last_change
```

The server derives `tenantId`, `courseId`, and `studentId` from authenticated request context. The model never supplies or chooses another student ID.

### Automatic-save behavior

When a student message or upload contains durable evidence, the course AI should:

1. Classify the activity.
2. Reuse the uploaded file reference.
3. Create or update the appropriate work record.
4. Link it to the group project or milestone when context is clear.
5. Extract a concise summary and relevant concepts.
6. Append a time entry when the student states a duration.
7. Generate an AI review when the student requests critique.
8. Update the student timeline and report-readiness projection.
9. Return a compact receipt with an undo action.

It should not save:

- Casual greetings
- General questions unrelated to the course
- Guessed time
- Unsupported claims about completed work
- Sensitive private information unnecessary for course evidence

### Idempotency

Automatic writes use a unique source key based on the tool call, source message, and mutation kind. Replayed streams or assistant retries must not duplicate evidence or time.

### Undo

Undo is a server mutation with a short retention window. It records who initiated the reversal and preserves an audit record without leaving the incorrect entry visible in the product.

## PDF and Artifact Handling

1. Reuse the existing authenticated file upload pipeline.
2. Accept PDF for the first release.
3. Reference the existing `file_id` from course work.
4. Reuse existing extraction where available.
5. Preserve the original PDF as the source of truth.
6. Store AI summaries separately from extracted text.
7. Enforce file ownership and course membership on every access.
8. Support version chains rather than overwriting prior work.

PPTX ingestion and arbitrary URL fetching are deferred. A student may export slides or written work to PDF for the first version.

## Reporting

### Draft generation

The report builder assembles:

- Student and group-project overview
- Current milestones and next actions
- Papers and research evidence
- Presentations and portfolio artifacts
- Project contributions and revisions
- Time allocation
- AI-use disclosure
- AI and teacher feedback
- Strengths, risks, and recommended next steps

### Evidence rules

- Every generated factual statement carries evidence IDs.
- Teacher narrative is stored separately from generated summaries.
- AI reviews are not presented as teacher judgments.
- Time entries are reported as student-provided records.
- Private teacher notes are excluded by default.

### Release rules

- Students cannot see `draft` or `reviewed` reports.
- Only a teacher can release a report.
- Release creates an immutable snapshot version.
- Later teacher edits create a new draft rather than silently changing the released copy.

## Requirement Coverage

| Requirement                            | Plan coverage                                        | First-version treatment       |
| -------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| Private course workspace               | Course plus course-scoped membership                 | Full                          |
| Teacher, TA, student access            | Two roles; TA maps to teacher                        | Full with simplified roles    |
| Student onboarding                     | Pending membership activated by matching email       | Partial; no email delivery    |
| Student profile                        | Membership-linked student detail                     | Full                          |
| Team and project assignment            | Course Team plus shared Project                      | Full                          |
| Baseline goals and current milestone   | Milestone and next action                            | Full                          |
| Slide submissions                      | PDF work artifact                                    | Partial; no PPTX              |
| Paper-reading record                   | Paper work type, PDF, summary, reflection            | Full                          |
| Project work log                       | Develop timeline and project-linked work             | Full                          |
| Time tracking                          | AI tool plus spreadsheet-like time table             | Full                          |
| AI tool-use record                     | AI-created work provenance and disclosure            | Full                          |
| Teacher class overview                 | Restrained teacher Home and Students pages           | Full                          |
| Student detail view                    | Dedicated teacher-accessible student page            | Full                          |
| Review queue                           | Review page with AI context and teacher action       | Full                          |
| Teacher feedback                       | Student-visible teacher feedback                     | Full                          |
| Private teacher notes                  | Teacher-only feedback visibility                     | Full                          |
| AI review                              | Labeled AI feedback                                  | Full                          |
| Report builder                         | Evidence-linked editable drafts                      | Full                          |
| Teacher-controlled report release      | Draft/reviewed/released workflow                     | Full                          |
| Recommendation evidence                | Preserved as selectable evidence                     | Partial; no letter generation |
| External Drive/GitHub/site/video links | Typed link fields                                    | Partial; no remote ingestion  |
| Manual fallback                        | Teacher can edit records and add evidence            | Full                          |
| Shared resources                       | Lightweight posts/resources                          | Full                          |
| Announcements                          | Lightweight posts                                    | Full                          |
| Daily checkpoints                      | Milestones and next actions without deadlines        | Full                          |
| Portfolio                              | Private selection and approval states                | Full                          |
| Public portfolio export                | Not included                                         | Deferred                      |
| Slide/PDF extraction                   | Existing PDF extraction only                         | Partial                       |
| Drive synchronization                  | Not included                                         | Deferred                      |
| GitHub synchronization                 | Not included                                         | Deferred                      |
| Missing-submission reminders           | Replaced by milestone attention state                | Deferred notifications        |
| Metrics                                | Evidence and completeness only                       | No automated learning scores  |
| Cohort analytics                       | Not included                                         | Deferred                      |
| Parent snapshots                       | Not included                                         | Deferred                      |
| Access/edit history                    | Timestamps, provenance, release versions, undo audit | Core coverage                 |
| Consent for public artifacts           | No public artifacts                                  | Safest first version          |

## Explicit Non-Goals

- Canvas connection, import, sync, or token management
- Gradebook
- Quizzes
- Attendance
- Deadline enforcement
- Parent or guardian accounts
- Separate TA role
- Mentor accounts
- Public student profiles
- Public portfolio publishing
- PPTX parsing
- Automatic Drive browsing
- Automatic GitHub analytics
- Cohort scoring
- AI-generated integrity accusations
- Recommendation-letter generation
- Generic image, music, video, or coding tool suite

## Implementation Sequence

### Phase 1: Contracts and persistence

1. Add shared course types and validation.
2. Add tenant-isolated database schemas, models, and methods.
3. Add indexes and model tests.
4. Add course membership authorization helpers.

Exit criteria:

- A teacher can own a course.
- Pending and active memberships are isolated by tenant and course.
- Cross-course and cross-tenant reads fail.

### Phase 2: Course setup

1. Add course CRUD.
2. Add email invitation and activation flow.
3. Add team creation and membership management.
4. Add shared project creation.
5. Add milestones without deadlines.

Exit criteria:

- Teacher can create a course, invite students, form groups, and create a project milestone.

### Phase 3: Develop records

1. Add course work and versioning.
2. Connect existing PDF uploads to work records.
3. Add personal timeline queries.
4. Add portfolio selection.
5. Add time entries and spreadsheet-like table.

Exit criteria:

- Student can upload a PDF, see it in Develop, revise it, link it to a project, and record time.

### Phase 4: AI auto-save

1. Add course-scoped tool definitions and handlers.
2. Provide authenticated course context to Develop conversations.
3. Add work classification and structured save behavior.
4. Add time logging from natural language.
5. Add receipts, idempotency, and undo.
6. Add AI review generation and labeling.

Exit criteria:

- A message such as “I spent two hours testing the prototype and revised this PDF” updates the correct time and work records once, shows a receipt, and can be undone.

### Phase 5: Role-specific UI

1. Build shared course shell and navigation primitives.
2. Build student Home and Develop first.
3. Build Group Project, Milestones, Portfolio, Feedback, and Resources.
4. Build teacher Students, Groups, Review, Reports, and Resources.
5. Keep Teacher Home intentionally sparse.

Exit criteria:

- Teacher and student experiences are visibly different but use the existing 2utorly design system.
- No screen reproduces the overloaded generated dashboard.

### Phase 6: Feedback and reports

1. Add AI and teacher feedback.
2. Add private teacher notes.
3. Add action items and addressed state.
4. Add evidence-linked report generation.
5. Add teacher editing, versioning, and release.

Exit criteria:

- Teacher can review student work, leave both kinds of feedback, generate a report, edit it, and release it.

### Phase 7: Hardening

1. Complete authorization and IDOR tests.
2. Verify file access rules.
3. Verify AI tool idempotency and undo.
4. Verify report privacy and release snapshots.
5. Add loading, empty, and error states.
6. Run focused workspace tests, lint, type checks, and production build.

## Testing Strategy

### Data schemas

- `mongodb-memory-server` tests for real tenant-isolated queries
- Unique membership and invitation behavior
- Team membership validation
- Work version chains
- Time-entry validation
- Report release versions

### Backend

- Teacher and student policy matrix
- Cross-tenant and cross-course denial
- Student-to-student private evidence denial
- Group-project access limited to group members
- Private note exclusion
- Invite activation by normalized email
- Cursor pagination

### AI tools

- Authenticated identity cannot be overridden by tool arguments
- Replayed tool calls remain idempotent
- Time is never invented
- Casual conversation does not create work
- Automatic saves return provenance receipts
- Undo reverses only the caller’s permitted mutation

### Frontend

- Teacher and student route guards
- Loading, empty, success, and error states
- Develop timeline and filters
- Upload-to-work flow
- Feedback visibility
- Report release visibility
- Localization and accessibility

### End-to-end acceptance scenario

1. Teacher creates a course.
2. Teacher adds two student emails and creates a group.
3. Both students activate accounts.
4. Teacher creates a group project and milestone.
5. Student A uploads a PDF and requests AI feedback.
6. Student A states time spent; the time table updates.
7. Student B uploads an individual paper.
8. Teacher sees both individual records and the shared group project.
9. Teacher leaves visible feedback and a private note.
10. Student sees only the visible feedback.
11. Teacher generates and edits Student A’s report.
12. Student cannot see it until release.
13. Released report contains evidence links but excludes the private note.

## Merge Strategy

The other agent’s Canvas teacher UI work can remain on `main`. This branch minimizes collisions by:

- Using `/workspace/courses/*` instead of the existing `/courses/:canvasCourseId` route
- Creating `client/src/components/Courses` instead of editing `CourseWing`
- Creating `packages/api/src/courses` instead of editing `coursewing`
- Creating new native course schemas instead of changing Canvas service data
- Keeping the only legacy API change to route registration
- Using course source adapters as a future integration seam

After both branches are stable, integration should happen in a dedicated merge branch. At that point the shared teacher presentation components can consume a common course-view contract while Canvas and native courses keep separate data adapters.

## Planned Deliverables

1. Native course schemas and APIs
2. Email-based roster and course teams
3. Shared group project and milestones
4. Student Develop workspace
5. PDF-backed evidence and portfolio selection
6. AI automatic evidence and time logging
7. AI review and teacher feedback
8. Teacher review and student detail
9. Evidence-linked report drafts and release
10. Focused automated tests and an end-to-end demo path

## Integration Notes

1. Keep `/workspace/courses/*` separate from the Canvas route until both branches are stable.
2. Provision a teacher account with `npm run create-user -- <email> <name> <username> --course-role=teacher`; student is the default course account role.
3. Keep the database-backed time table as the source of truth; add CSV or spreadsheet export later if needed.
4. Configure the native course tools on a dedicated course agent before describing Develop as a fully embedded AI workspace.
5. Keep report drafts teacher-only until deliberate release.
6. Keep public portfolio publishing out of scope until privacy and consent behavior is designed.
