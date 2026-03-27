import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Router } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "EthioSentinel API Documentation",
      version: "1.0.0",
      description: "API documentation for the EthioSentinel Backend system",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT}/api`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
        },
      },
    },
  },
  apis: ["./src/routes/swagger/*.swagger.ts"], // Path to the independent swagger files
};

const specs = swaggerJsdoc(options);
const swaggerRouter = Router();

swaggerRouter.use("/", swaggerUi.serve);
swaggerRouter.get("/", swaggerUi.setup(specs));

// Add a route to get the JSON representation
swaggerRouter.get("/json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(specs);
});

export default swaggerRouter;
