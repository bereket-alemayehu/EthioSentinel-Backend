import type { Role } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

export {};
