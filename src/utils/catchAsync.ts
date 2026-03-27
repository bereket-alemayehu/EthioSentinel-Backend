import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps an async Express handler so that any rejected promise is forwarded to
 * `next(err)` — eliminating repetitive try/catch in every controller.
 *
 * @example
 * export const getUser = catchAsync(async (req, res) => {
 *   const user = await userService.findById(req.params.id);
 *   sendSuccess(res, user);
 * });
 */
export const catchAsync = (fn: AsyncHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
