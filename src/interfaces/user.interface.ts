import type { Role, Language } from "../../generated/prisma/enums";

export interface IUser {
  id: number;
  fullName: string;
  email: string;
  password?: string;
  phoneNumber?: string | null;
  role: Role;
  isActive: boolean;
  preferredLanguage: Language;
  regionId?: number | null;
  districtId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
