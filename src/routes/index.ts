import { Router } from "express";
import { advisoriesRouter } from "./advisories.routes";
import { alertsRouter } from "./alerts.routes";
import { authRouter } from "./auth.routes";
import { diseasesRouter } from "./diseases.routes";
import { healthRouter } from "./health.routes";
import { regionsRouter } from "./regions.routes";
import { reportsRouter } from "./reports.routes";
import { usersRouter } from "./users.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(regionsRouter);
apiRouter.use(diseasesRouter);
apiRouter.use(usersRouter);
apiRouter.use(reportsRouter);
apiRouter.use(advisoriesRouter);
apiRouter.use(alertsRouter);
