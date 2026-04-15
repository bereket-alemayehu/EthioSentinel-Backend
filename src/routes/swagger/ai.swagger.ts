/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI and analytics integration endpoints
 */

/**
 * @swagger
 * /ai/anomaly/reports/{reportId}/trigger:
 *   post:
 *     summary: Trigger asynchronous Z-Score anomaly analysis for a report
 *     tags: [AI]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Disease report id
 *     responses:
 *       202:
 *         description: Trigger accepted for asynchronous processing
 *       400:
 *         description: Invalid report id
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /ai/webhook/anomaly:
 *   post:
 *     summary: Receive anomaly callback payload from AI service
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Webhook payload ingested
 *       401:
 *         description: Unauthorized webhook request
 */
