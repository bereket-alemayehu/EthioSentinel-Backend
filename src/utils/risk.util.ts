export type ReportRiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

const RISK_RANK: Record<ReportRiskLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function maxRisk(...levels: ReportRiskLevel[]): ReportRiskLevel {
  return levels.reduce(
    (highest, level) => (RISK_RANK[level] > RISK_RANK[highest] ? level : highest),
    "LOW" as ReportRiskLevel,
  );
}

/** Risk from statistical z-score (primary anomaly signal). */
export function riskFromZScore(zScore?: number): ReportRiskLevel {
  if (typeof zScore !== "number" || Number.isNaN(zScore)) {
    return "MODERATE";
  }
  if (zScore >= 3) return "CRITICAL";
  if (zScore >= 2) return "HIGH";
  if (zScore >= 1) return "MODERATE";
  return "LOW";
}

/** Risk from mortality in the current report (deaths + mortality rate). */
export function riskFromMortality(
  deaths: number,
  mortalityRate?: number,
): ReportRiskLevel {
  if (deaths >= 3 || (deaths > 0 && (mortalityRate ?? 0) >= 0.1)) {
    return "CRITICAL";
  }
  if (deaths >= 1) return "HIGH";
  return "LOW";
}

/**
 * Advisory / alert risk from anomaly detection: z-score and mortality together.
 * The higher of the two signals wins (neither is a fallback for the other).
 */
export function riskFromAnomalySignal(input: {
  zScore?: number;
  deaths: number;
  mortalityRate?: number;
}): ReportRiskLevel {
  return maxRisk(
    riskFromZScore(input.zScore),
    riskFromMortality(input.deaths, input.mortalityRate),
  );
}

/** Aggregated regional/district risk for dashboards (cases + deaths + spikes). */
export function riskFromAggregatedCounts(
  cases: number,
  deaths: number,
  spikeCount = 0,
): ReportRiskLevel {
  if (deaths >= 10 || spikeCount >= 3 || cases >= 1000) return "CRITICAL";
  if (deaths >= 3 || spikeCount >= 1 || cases >= 250) return "HIGH";
  if (deaths >= 1 || cases >= 50) return "MODERATE";
  return "LOW";
}

export function reportRiskToAlertSeverity(
  risk: ReportRiskLevel,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (risk === "MODERATE") return "MEDIUM";
  return risk;
}
