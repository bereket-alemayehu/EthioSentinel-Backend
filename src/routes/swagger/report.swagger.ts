/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Disease report ingestion and retrieval
 */

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get all disease reports (ADMIN, HEW, RESEARCHER)
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Submit a new disease report (ADMIN, HEW)
 *     description: |
 *       BR-01: Free-text `notes` field is automatically sanitized to strip PII
 *       (emails, phone numbers, titled names) before persistence.
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [district, diseaseType]
 *             properties:
 *               district:
 *                 type: string
 *                 example: Kirkos
 *               diseaseType:
 *                 type: string
 *                 example: Cholera
 *               caseCount:
 *                 type: integer
 *                 minimum: 0
 *                 example: 12
 *               deathCount:
 *                 type: integer
 *                 minimum: 0
 *                 example: 1
 *               isOfflineCached:
 *                 type: boolean
 *                 default: false
 *               notes:
 *                 type: string
 *                 description: Free-text notes — PII is automatically stripped before storage
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Duplicate report for this district/disease/reporter
 */

/**
 * @swagger
 * /reports/weekly:
 *   get:
 *     summary: Get weekly aggregated report summary (ADMIN, HEW, RESEARCHER)
 *     description: |
 *       Returns case/death counts grouped by ISO week.
 *       Supports `?export=pdf` and `?export=excel` for downloadable reports.
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: export
 *         schema:
 *           type: string
 *           enum: [json, pdf, excel]
 *           default: json
 *         description: Response format
 *     responses:
 *       200:
 *         description: Weekly summary retrieved (JSON, PDF, or Excel)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /reports/sync:
 *   post:
 *     summary: Batch offline sync — mortality-first ordering (ADMIN, HEW)
 *     description: |
 *       BR-05: Accepts a batch of offline PWA reports (max 200).
 *       Reports with `deathCount > 0` are persisted before morbidity-only reports.
 *       Returns a 207 Multi-Status with per-item accept/reject results.
 *       Each accepted report triggers the Z-Score anomaly check and BR-03 mortality threshold check.
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reports]
 *             properties:
 *               reports:
 *                 type: array
 *                 maxItems: 200
 *                 items:
 *                   type: object
 *                   required: [district, diseaseType]
 *                   properties:
 *                     district:
 *                       type: string
 *                     diseaseType:
 *                       type: string
 *                     caseCount:
 *                       type: integer
 *                       minimum: 0
 *                     deathCount:
 *                       type: integer
 *                       minimum: 0
 *                     notes:
 *                       type: string
 *     responses:
 *       207:
 *         description: Sync completed — returns accepted/rejected counts and per-item errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accepted:
 *                   type: integer
 *                 rejected:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                       reason:
 *                         type: string
 *       400:
 *         description: Invalid payload or batch too large
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
