import { AppError } from "../utils/AppError";
import { sanitizeNotes } from "../utils/pii.util";

type ReportInput = {
  district?: unknown;
  diseaseType?: unknown;
  diseaseId?: unknown;
  caseCount?: unknown;
  deathCount?: unknown;
  notes?: unknown;
  isOfflineCached?: unknown;
  timestamp?: unknown;
};

type ValidatedReportInput = {
  district: string;
  diseaseType: string;
  diseaseId: number | undefined;
  caseCount: number;
  deathCount: number;
  notes: string | undefined;
  isOfflineCached: boolean;
  timestamp: Date;
};

/**
 * BR-01: Validates and sanitizes a disease report submission.
 * - Required fields: district, diseaseType
 * - Counts must be non-negative integers
 * - Date must not be in the future
 * - Notes are sanitized to strip PII before persistence
 */
export function validateAndSanitizeReport(
  input: ReportInput,
): ValidatedReportInput {
  const district = String(input.district ?? "").trim();
  if (!district) {
    throw new AppError("district is required", 400);
  }

  const diseaseType = String(input.diseaseType ?? "").trim();
  if (!diseaseType) {
    throw new AppError("diseaseType is required", 400);
  }

  const caseCount = Number(input.caseCount ?? 0);
  if (!Number.isInteger(caseCount) || caseCount < 0) {
    throw new AppError("caseCount must be a non-negative integer", 400);
  }

  const deathCount = Number(input.deathCount ?? 0);
  if (!Number.isInteger(deathCount) || deathCount < 0) {
    throw new AppError("deathCount must be a non-negative integer", 400);
  }

  if (deathCount > caseCount) {
    throw new AppError("deathCount cannot exceed caseCount", 400);
  }

  const timestamp = input.timestamp ? new Date(String(input.timestamp)) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError("Invalid timestamp format", 400);
  }
  
  if (timestamp > new Date()) {
    throw new AppError("Report date cannot be in the future", 400);
  }

  let notes: string | undefined;
  if (input.notes !== undefined && input.notes !== null && input.notes !== "") {
    notes = sanitizeNotes(String(input.notes));
  }

  const isOfflineCached = Boolean(input.isOfflineCached ?? false);
  const diseaseId = input.diseaseId ? Number(input.diseaseId) : undefined;

  return { district, diseaseType, diseaseId, caseCount, deathCount, notes, isOfflineCached, timestamp };
}
