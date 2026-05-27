import { AppError } from "../utils/AppError";
import { sanitizeNotes } from "../utils/pii.util";

type ReportInput = {
  district?: unknown;
  diseaseType?: unknown;
  diseaseId?: unknown;
  caseCount?: unknown;
  deathCount?: unknown;
  date?: unknown;
  reportDate?: unknown;
  timestamp?: unknown;
  notes?: unknown;
  isOfflineCached?: unknown;
};

type ValidatedReportInput = {
  district: string;
  diseaseType: string;
  diseaseId: number | undefined;
  caseCount: number;
  deathCount: number;
  timestamp: Date | undefined;
  notes: string | undefined;
  isOfflineCached: boolean;
};

/**
 * BR-01: Validates and sanitizes a disease report submission.
 * - Required fields: district, diseaseType
 * - Counts must be non-negative integers
 * - Notes are sanitized to strip PII before persistence
 */
export function validateAndSanitizeReport(input: ReportInput,): ValidatedReportInput {
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

  let timestamp: Date | undefined;
  const rawDate = input.reportDate ?? input.date ?? input.timestamp;
  if (rawDate !== undefined && rawDate !== null && rawDate !== "") {
    const dateText = String(rawDate);
    const parsed =
      /^\d{4}-\d{2}-\d{2}$/.test(dateText)
        ? new Date(`${dateText}T12:00:00.000Z`)
        : new Date(dateText);

    if (Number.isNaN(parsed.getTime())) {
      throw new AppError("reportDate must be a valid date", 400);
    }

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (parsed > todayEnd) {
      throw new AppError("reportDate cannot be in the future", 400);
    }
    timestamp = parsed;
  }

  let notes: string | undefined;
  if (input.notes !== undefined && input.notes !== null && input.notes !== "") {
    notes = sanitizeNotes(String(input.notes));
  }

  const isOfflineCached = Boolean(input.isOfflineCached ?? false);
  const diseaseId = input.diseaseId ? Number(input.diseaseId) : undefined;

  return { district, diseaseType, diseaseId, caseCount, deathCount, timestamp, notes, isOfflineCached };
}
