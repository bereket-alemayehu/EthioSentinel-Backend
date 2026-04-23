/**
 * @swagger
 * tags:
 *   name: Advisories
 *   description: Health advisory management and review workflow
 */

/**
 * @swagger
 * /advisories:
 *   get:
 *     summary: Get all approved advisories (public)
 *     description: Returns only APPROVED advisories. Draft and rejected advisories are excluded.
 *     tags: [Advisories]
 *     responses:
 *       200:
 *         description: Advisories retrieved successfully
 */

/**
 * @swagger
 * /advisories:
 *   post:
 *     summary: Create a new advisory (ADMIN)
 *     tags: [Advisories]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diseaseType, regionId, title, content]
 *             properties:
 *               diseaseType:
 *                 type: string
 *                 example: Malaria
 *               regionId:
 *                 type: integer
 *                 example: 1
 *               districtId:
 *                 type: integer
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               language:
 *                 type: string
 *                 example: AMHARIC
 *               riskLevel:
 *                 type: string
 *                 example: MODERATE
 *               generatedByAI:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Advisory created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /advisories/drafts:
 *   get:
 *     summary: Get paginated DRAFT advisories pending review (ADMIN)
 *     tags: [Advisories]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Draft advisories retrieved with pagination metadata
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /advisories/symptom-check:
 *   post:
 *     summary: Symptom assessment tool (public)
 *     description: Returns a probable disease and risk level based on submitted symptoms. No authentication required.
 *     tags: [Advisories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [symptoms]
 *             properties:
 *               symptoms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [fever, diarrhea]
 *               language:
 *                 type: string
 *                 enum: [ENGLISH, AMHARIC]
 *                 default: ENGLISH
 *               location:
 *                 type: string
 *                 example: Addis Ababa
 *     responses:
 *       200:
 *         description: Symptom assessment completed
 *       400:
 *         description: No symptoms provided
 */

/**
 * @swagger
 * /advisories/generate:
 *   post:
 *     summary: Generate health advisory text for a disease scenario (ADMIN, HEW)
 *     tags: [Advisories]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diseaseName, severity, location]
 *             properties:
 *               diseaseName:
 *                 type: string
 *                 example: Cholera
 *               severity:
 *                 type: string
 *                 enum: [LOW, MODERATE, HIGH, CRITICAL]
 *               location:
 *                 type: string
 *                 example: Kirkos District
 *               language:
 *                 type: string
 *                 enum: [ENGLISH, AMHARIC]
 *                 default: ENGLISH
 *     responses:
 *       200:
 *         description: Advisory text generated successfully
 *       400:
 *         description: Missing required fields or invalid values
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /advisories/{id}/approve:
 *   patch:
 *     summary: Approve a DRAFT advisory (ADMIN)
 *     tags: [Advisories]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Advisory approved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /advisories/{id}/reject:
 *   patch:
 *     summary: Reject a DRAFT advisory (ADMIN)
 *     tags: [Advisories]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Advisory rejected
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
