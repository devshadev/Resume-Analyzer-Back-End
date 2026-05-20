import express from 'express';
import multer from 'multer';
import {
  runAnalysis,
  getReports,
  getReport,
  deleteReport,
} from '../controllers/analysisController.js';
import protect from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * @swagger
 * tags:
 *   name: Analysis
 *   description: Resume analysis endpoints
 */

/**
 * @swagger
 * /api/analysis/run:
 *   post:
 *     summary: Run a full resume analysis
 *     tags: [Analysis]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [resume, jobData]
 *             properties:
 *               resume:
 *                 type: string
 *                 format: binary
 *               jobData:
 *                 type: string
 *                 description: JSON string of job details
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       400:
 *         description: Invalid file or job data
 *       401:
 *         description: Not authorised
 */
router.post('/run', protect, upload.single('resume'), runAnalysis);

/**
 * @swagger
 * /api/analysis/reports:
 *   get:
 *     summary: Get all reports for current user
 *     tags: [Analysis]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of reports
 *       401:
 *         description: Not authorised
 */
router.get('/reports', protect, getReports);

/**
 * @swagger
 * /api/analysis/reports/{id}:
 *   get:
 *     summary: Get a single report by ID
 *     tags: [Analysis]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report data
 *       403:
 *         description: Not authorised to access this report
 *       404:
 *         description: Report not found
 */
router.get('/reports/:id', protect, getReport);

/**
 * @swagger
 * /api/analysis/reports/{id}:
 *   delete:
 *     summary: Delete a report
 *     tags: [Analysis]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report deleted
 *       403:
 *         description: Not authorised to delete this report
 *       404:
 *         description: Report not found
 */
router.delete('/reports/:id', protect, deleteReport);

export default router;