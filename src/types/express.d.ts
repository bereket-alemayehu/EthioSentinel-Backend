import type { UserRole } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: number;
        email: string;
        role: UserRole;
      };
    }
  }
}

export {};
