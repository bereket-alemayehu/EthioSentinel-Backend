import type { UserRole, Language } from "../../generated/prisma/enums";

export interface IUser {
  id: number;
  fullName: string;
  email: string;
  password?: string;
  phoneNumber?: string | null;
  role: UserRole;
  isActive: boolean;
  preferredLanguage: Language;
  regionId?: number | null;
  districtId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
