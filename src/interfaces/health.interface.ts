import type { AdvisoryStatus, RiskLevel, AlertSeverity, AlertChannel, Language } from "@prisma/client";

export interface IAdvisory {
  id: number;
  diseaseId: number;
  regionId: number;
  districtId?: number | null;
  sourceReportId?: number | null;
  approvedById?: number | null;
  title: string;
  content: string;
  language: Language;
  status: AdvisoryStatus;
  riskLevel: RiskLevel;
  generatedByAI: boolean;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAlert {
  id: number;
  regionId: number;
  districtId?: number | null;
  diseaseId?: number | null;
  advisoryId?: number | null;
  createdById?: number | null;
  title: string;
  message: string;
  severity: AlertSeverity;
  channel: AlertChannel;
  deliveryCount: number;
  failedCount: number;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
