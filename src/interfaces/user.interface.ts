import { Role } from "@prisma/client";

export interface IUser {
  id: string;
  username: string;
  email: string;
  phoneNumber?: string | null;
  role: Role;
  isActive: boolean;
  region: string;
  assignedDistrict?: string | null;
  clearanceLevel?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
