/**
 * @swagger
 * tags:
 *   name: Alerts
 *   description: Health alert management and broadcast workflow
 */

/**
 * @swagger
 * /alerts:
 *   get:
 *     summary: Get all alerts (ADMIN, RESEARCHER)
 *     tags: [Alerts]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /alerts:
 *   post:
 *     summary: Create a new alert (ADMIN)
 *     description: |
 *       BR-02: If an `advisoryId` is provided, the linked advisory must be APPROVED
 *       before the alert can be created. Alerts linked to DRAFT or REJECTED advisories
 *       are rejected with 422.
 *     tags: [Alerts]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetZone, title, message]
 *             properties:
 *               targetZone:
 *                 type: string
 *                 description: Region or district name this alert targets
 *                 example: Addis Ababa
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                 default: MEDIUM
 *               channel:
 *                 type: string
 *                 enum: [WEB, SMS, USSD, EMAIL]
 *                 default: WEB
 *               diseaseId:
 *                 type: integer
 *               advisoryId:
 *                 type: string
 *                 format: uuid
 *                 description: Must reference an APPROVED advisory
 *     responses:
 *       201:
 *         description: Alert created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Linked advisory not found
 *       422:
 *         description: Linked advisory is not APPROVED
 */

/**
 * @swagger
 * /alerts/{id}/approve:
 *   put:
 *     summary: Approve and broadcast an alert (ADMIN)
 *     description: |
 *       BR-02: Validates that the linked advisory (if any) is APPROVED before
 *       triggering bulk email notification to users in the target zone.
 *     tags: [Alerts]
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
 *         description: Alert approved and notification triggered
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Alert not found
 *       422:
 *         description: Linked advisory is not APPROVED
 */

/**
 * @swagger
 * /alerts/{id}/reject:
 *   put:
 *     summary: Reject an alert and reset delivery counters (ADMIN)
 *     tags: [Alerts]
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
 *         description: Alert rejected
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Alert not found
 */
