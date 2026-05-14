import { Role } from "@prisma/client";

export interface ITokenPayload {
  id: string;
  role: Role;
  email: string | null;
  phoneNumber?: string | null;
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
    email: string | null;
    phoneNumber?: string | null;
    role: Role;
    region: string | null;
    assignedDistrict: string | null;
  };
}
