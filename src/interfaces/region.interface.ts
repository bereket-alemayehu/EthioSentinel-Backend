import type { Language } from "../../generated/prisma/enums";

export interface IRegion {
  id: number;
  name: string;
  code: string;
  primaryLanguage: Language;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDistrict {
  id: number;
  regionId: number;
  name: string;
  code: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
