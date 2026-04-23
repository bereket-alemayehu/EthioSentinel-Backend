/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Aggregated disease report analytics with filter and export support
 */

/**
 * @swagger
 * /analytics/reports:
 *   get:
 *     summary: Get aggregated disease report analytics (ADMIN, RESEARCHER)
 *     description: |
 *       Returns case/death totals and mortality rates grouped by district and disease type.
 *       Supports date range, district, and disease filters with pagination.
 *       Use `?export=pdf` or `?export=excel` to download a formatted report.
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         description: Filter reports on or after this date (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *         description: Filter reports on or before this date (inclusive, end of day)
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *           example: Kirkos
 *         description: Filter by district name (partial match, case-insensitive)
 *       - in: query
 *         name: diseaseType
 *         schema:
 *           type: string
 *           example: Cholera
 *         description: Filter by disease type (partial match, case-insensitive)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *       - in: query
 *         name: export
 *         schema:
 *           type: string
 *           enum: [json, pdf, excel]
 *           default: json
 *         description: Response format
 *     responses:
 *       200:
 *         description: Analytics data retrieved (JSON, PDF download, or Excel download)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       district:
 *                         type: string
 *                       diseaseType:
 *                         type: string
 *                       totalCases:
 *                         type: integer
 *                       totalDeaths:
 *                         type: integer
 *                       reportCount:
 *                         type: integer
 *                       mortalityRate:
 *                         type: string
 *                         example: "8.3%"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
