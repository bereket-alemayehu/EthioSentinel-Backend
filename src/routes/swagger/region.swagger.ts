/**
 * @swagger
 * tags:
 *   name: Regions
 *   description: Regional and administrative division data
 */

/**
 * @swagger
 * /regions:
 *   get:
 *     summary: Get all regions with their districts
 *     description: Returns a list of all regions in Ethiopia, including their associated districts and geographical coordinates (latitude/longitude) required for map visualization.
 *     tags: [Regions]
 *     responses:
 *       200:
 *         description: Regions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Regions retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Addis Ababa
 *                       code:
 *                         type: string
 *                         example: AA
 *                       districts:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 1
 *                             name:
 *                               type: string
 *                               example: Kirkos
 *                             latitude:
 *                               type: number
 *                               format: float
 *                               example: 9.0123
 *                             longitude:
 *                               type: number
 *                               format: float
 *                               example: 38.7456
 */
