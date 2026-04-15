import type { Role, Language } from "../../generated/prisma/enums";

export interface IUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  password?: string;
  phoneNumber?: string | null;
  role: Role;
  region: string;
  assignedDistrict?: string | null;
  clearanceLevel?: string | null;
  isActive: boolean;
  preferredLanguage: Language;
  regionId?: number | null;
  districtId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
