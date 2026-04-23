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
 *     summary: Trigger asynchronous Z-Score anomaly analysis for a report (ADMIN, RESEARCHER)
 *     tags: [AI]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the disease report
 *     responses:
 *       202:
 *         description: Trigger accepted for asynchronous processing
 *       400:
 *         description: Invalid report id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
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

/**
 * @swagger
 * /ai/nlp/advisory-draft:
 *   post:
 *     summary: Receive NLP-generated advisory draft from Python AI worker (internal)
 *     description: |
 *       Internal machine-to-machine endpoint called by the Python AI worker.
 *       Protected by a static API key in the `x-internal-token` header — not JWT.
 *       Each call persists one language variant as an Advisory row with status DRAFT.
 *     tags: [AI]
 *     parameters:
 *       - in: header
 *         name: x-internal-token
 *         required: false
 *         schema:
 *           type: string
 *         description: Internal service token (required when AI_INTERNAL_TOKEN env var is set)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diseaseType, regionName, language, title, content]
 *             properties:
 *               diseaseType:
 *                 type: string
 *                 example: Cholera
 *               regionName:
 *                 type: string
 *                 example: Addis Ababa
 *               language:
 *                 type: string
 *                 example: AMHARIC
 *               riskLevel:
 *                 type: string
 *                 example: HIGH
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               sourceReportId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Advisory draft persisted
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized internal request
 */
