import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class UserController {
  static getAllUsers = catchAsync(async (req: Request, res: Response) => {
    const users = await UserService.getAllUsers();
    return sendSuccess(res, users, "Users retrieved successfully");
  });
}
