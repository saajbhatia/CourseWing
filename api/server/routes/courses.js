const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const express = require('express');
const mongoose = require('mongoose');
const {
  createCourseService,
  createCourseHandlers,
  createCourseInviteToken,
  createCourseShareToken,
  parseDocument,
} = require('@librechat/api');
const { createModels, logger } = require('@librechat/data-schemas');
const { createToken, deleteTokens } = require('~/models');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getContentDisposition } = require('~/server/utils/files');

const router = express.Router();
const models = createModels(mongoose);
const service = createCourseService(models);
const handlers = createCourseHandlers(service, {
  createRegistrationClaim: (input) => createCourseInviteToken(input, { createToken, deleteTokens }),
  createShareRegistrationClaim: (input) =>
    createCourseShareToken(input, { createToken, deleteTokens }),
  registrationBaseUrl: process.env.DOMAIN_CLIENT,
});
const MAX_COURSE_EXTRACT_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_COURSE_EXTRACT_TEXT_BYTES = 2 * 1024 * 1024;
const COURSE_EXTRACT_SOURCES = new Set(['local', 'firebase', 'azure_blob', 's3', 'cloudfront']);
const COURSE_EXTRACT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
]);
const activeExtractions = new Set();

router.use(requireJwtAuth);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  next();
});

router.route('/').get(handlers.listCourses).post(handlers.createCourse);
router.delete('/:courseId', handlers.deleteCourse);
router.get('/:courseId/overview', handlers.getOverview);

router.route('/:courseId/members').get(handlers.listMembers).post(handlers.inviteMembers);
router.delete('/:courseId/members/:memberId', handlers.removeMember);
router.post('/:courseId/share-link', handlers.createShareLink);
router.route('/:courseId/profile').get(handlers.getProfile).patch(handlers.updateProfile);

router.route('/:courseId/teams').get(handlers.listTeams).post(handlers.createTeam);
router.patch('/:courseId/teams/:teamId/members', handlers.updateTeamMembers);
router
  .route('/:courseId/teams/:teamId/project')
  .get(handlers.getProject)
  .patch(handlers.updateProject);
router.post('/:courseId/projects', handlers.createProject);
router
  .route('/:courseId/projects/:projectId')
  .patch(handlers.updateProjectById)
  .delete(handlers.deleteProject);

router.route('/:courseId/milestones').get(handlers.listMilestones).post(handlers.createMilestone);
router.patch('/:courseId/milestones/:milestoneId', handlers.updateMilestone);

router.route('/:courseId/work').get(handlers.listWork).post(handlers.createWork);
router.route('/:courseId/work/:workId').patch(handlers.updateWork).delete(handlers.deleteWork);
router.post('/:courseId/files/:fileId/extract', configMiddleware, async (req, res) => {
  let tempDirectory;
  let extractionKey;
  try {
    const userId = req.user?.id ?? req.user?._id?.toString() ?? '';
    const file = await service.getAccessibleFile(userId, req.params.courseId, req.params.fileId);
    const existingText = file.text?.trim();
    if (existingText) {
      return res.status(200).json({
        fileId: file.file_id,
        filename: file.filename,
        extracted: true,
        characters: existingText.length,
      });
    }
    if (!COURSE_EXTRACT_SOURCES.has(file.source)) {
      return res.status(422).json({ error: 'This file source cannot be read by course AI' });
    }
    if (!COURSE_EXTRACT_MIME_TYPES.has(file.type)) {
      return res.status(422).json({
        error: 'Course AI can currently read PDF, DOCX, PPTX, and ODT files',
      });
    }
    if (file.bytes > MAX_COURSE_EXTRACT_INPUT_BYTES) {
      return res.status(413).json({ error: 'Paper files must be 15 MB or smaller for AI reading' });
    }

    extractionKey = `${userId}:${file.file_id}`;
    if (activeExtractions.has(extractionKey)) {
      return res.status(409).json({ error: 'This file is already being prepared for course AI' });
    }
    activeExtractions.add(extractionKey);

    const { getDownloadStream } = getStrategyFunctions(file.source);
    if (!getDownloadStream) {
      return res.status(422).json({ error: 'This file source cannot be read by course AI' });
    }

    tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-file-'));
    const tempPath = path.join(tempDirectory, 'document');
    const stream = await getDownloadStream(req, file.storageKey || file.filepath);
    await pipeline(stream, fs.createWriteStream(tempPath));
    const stat = await fs.promises.stat(tempPath);

    let extracted;
    try {
      extracted = await parseDocument({
        file: {
          fieldname: 'file',
          originalname: file.filename,
          encoding: '7bit',
          mimetype: file.type,
          size: stat.size,
          destination: tempDirectory,
          filename: 'document',
          path: tempPath,
        },
      });
    } catch (error) {
      logger.warn(`[courses] Could not extract text from ${file.filename}: ${error.message}`);
      return res.status(422).json({
        error:
          'The file was uploaded, but its text could not be extracted. You can still complete the paper record manually.',
      });
    }

    const extractedBuffer = Buffer.from(extracted.text, 'utf8');
    const textWasTruncated = extractedBuffer.byteLength > MAX_COURSE_EXTRACT_TEXT_BYTES;
    const storedText = textWasTruncated
      ? extractedBuffer.subarray(0, MAX_COURSE_EXTRACT_TEXT_BYTES).toString('utf8')
      : extracted.text;
    const updated = await models.File.findOneAndUpdate(
      { _id: file._id, file_id: file.file_id },
      {
        $set: { text: storedText, textFormat: 'text' },
      },
      { new: true },
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(200).json({
      fileId: updated.file_id,
      filename: updated.filename,
      extracted: true,
      characters: updated.text?.length ?? 0,
      truncated: textWasTruncated,
    });
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status === 500) {
      logger.error('[courses] File extraction failed', error);
    }
    return res.status(status).json({
      error: status === 500 ? 'Unable to prepare this file for course AI' : error.message,
    });
  } finally {
    if (extractionKey) {
      activeExtractions.delete(extractionKey);
    }
    if (tempDirectory) {
      await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});
router.get('/:courseId/work/:workId/files/:fileId', configMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?._id?.toString() ?? '';
    const file = await service.getWorkFile(
      userId,
      req.params.courseId,
      req.params.workId,
      req.params.fileId,
    );
    const { getDownloadStream } = getStrategyFunctions(file.source);
    if (!getDownloadStream) {
      return res.status(501).json({ error: 'This file source cannot be downloaded here' });
    }
    const stream = await getDownloadStream(req, file.storageKey || file.filepath);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      getContentDisposition(
        file.filename,
        file.type === 'application/pdf' ? 'inline' : 'attachment',
      ),
    );
    stream.on('error', (error) => {
      logger.error('[courses] Work file stream failed', error);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });
    return stream.pipe(res);
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({
      error: status === 500 ? 'Unable to open file' : error.message,
    });
  }
});
router.post('/:courseId/undo', handlers.undoAutomaticSave);

router.route('/:courseId/time').get(handlers.listTime).post(handlers.createTime);
router.route('/:courseId/time/:timeId').patch(handlers.updateTime).delete(handlers.deleteTime);
router.route('/:courseId/ai-use').get(handlers.listAiUse).post(handlers.createAiUse);
router.route('/:courseId/ai-use/:aiUseId').patch(handlers.updateAiUse).delete(handlers.deleteAiUse);
router.route('/:courseId/feedback').get(handlers.listFeedback).post(handlers.createFeedback);
router.patch('/:courseId/feedback/:feedbackId', handlers.updateFeedback);
router.post('/:courseId/posts/batch', handlers.createPosts);
router.route('/:courseId/posts').get(handlers.listPosts).post(handlers.createPost);
router.route('/:courseId/posts/:postId').patch(handlers.updatePost).delete(handlers.deletePost);

router.get('/:courseId/reports', handlers.listReports);
router.post('/:courseId/reports/:studentId/generate', handlers.generateReport);
router.patch('/:courseId/reports/:reportId', handlers.updateReport);
router.post('/:courseId/reports/:reportId/release', handlers.releaseReport);

module.exports = router;
