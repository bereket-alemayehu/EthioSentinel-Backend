import { Request, Response, NextFunction } from "express";

export const apiLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Rate limiting logic here
  next();
};
