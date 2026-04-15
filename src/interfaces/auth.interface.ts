import type { Role } from "../../generated/prisma/enums";

export interface ITokenPayload {
  id: number;
  role: Role;
  email: string;
  iat?: number;
  exp?: number;
}

export interface IToken {
  accessToken: string;
}

export interface ILoginResponse {
  accessToken: string;
  user: {
    id: number;
    fullName: string;
    email: string;
    role: Role;
  };
}
