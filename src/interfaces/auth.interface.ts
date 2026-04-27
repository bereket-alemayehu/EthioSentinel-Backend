import { Role } from "@prisma/client";

export interface ITokenPayload {
  id: string;
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
    id: string;
    username: string;
    email: string;
    role: Role;
    region: string;
    assignedDistrict: string | null;
  };
}
