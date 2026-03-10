import { Router } from "express";
import { prisma } from "../lib/prisma";

export const regionsRouter = Router();

regionsRouter.get("/regions", async (_req, res) => {
  try {
    const regions = await prisma.region.findMany({
      include: {
        districts: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(regions);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
