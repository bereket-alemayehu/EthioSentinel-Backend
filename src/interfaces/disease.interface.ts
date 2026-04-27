import type { ReportSource, ReportStatus } from "@prisma/client";

export interface IDisease {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  symptomProfile?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDiseaseReport {
  id: number;
  districtId: number;
  diseaseId: number;
  reporterId: number;
  reportDate: Date;
  caseCount: number;
  deathCount: number;
  source: ReportSource;
  status: ReportStatus;
  isMortalityPriority: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
