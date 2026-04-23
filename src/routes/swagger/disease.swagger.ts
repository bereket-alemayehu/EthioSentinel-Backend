/**
 * @swagger
 * tags:
 *   name: Diseases
 *   description: Disease catalogue management
 */

/**
 * @swagger
 * /diseases:
 *   get:
 *     summary: Get all diseases (public)
 *     tags: [Diseases]
 *     responses:
 *       200:
 *         description: Diseases retrieved successfully
 */

/**
 * @swagger
 * /diseases:
 *   post:
 *     summary: Create a new disease entry (ADMIN)
 *     tags: [Diseases]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Cholera
 *               slug:
 *                 type: string
 *                 example: cholera
 *               description:
 *                 type: string
 *               symptomProfile:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Disease created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
