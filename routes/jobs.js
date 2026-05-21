import express from 'express';
import { getRelevantJobs } from '../controllers/jobsController.js';
import protect from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/jobs/relevant/{reportId}:
 *   get:
 *     summary: Get relevant jobs based on a report's analysis
 *     tags: [Jobs]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *         description: The report ID to base job recommendations on
 *     responses:
 *       200:
 *         description: List of relevant jobs from hh.ru
 *       403:
 *         description: Not authorised to access this report
 *       404:
 *         description: Report not found
 */
router.get('/relevant/:reportId', protect, getRelevantJobs);

export default router;