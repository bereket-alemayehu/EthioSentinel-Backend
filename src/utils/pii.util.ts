/**
 * BR-01: PII stripping utilities.
 * Reports must contain only aggregated epidemiological data (counts, district, disease type).
 * Free-text fields like `notes` are sanitized before persistence.
 */

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, label: "email" },
  { pattern: /\b(\+?2519|09)\d{8}\b/g, label: "ET-phone" },
  { pattern: /\b(\+?\d[\s\-.]?){9,14}\d\b/g, label: "phone" },
  { pattern: /\b(Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\b/g, label: "name-title" },
];

/**
 * Strips known PII patterns from a free-text string.
 * Each match is replaced with [REDACTED].
 */
export function sanitizeNotes(text: string): string {
  let result = text;
  for (const { pattern } of PII_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result.trim();
}

/**
 * Returns true if the text contains recognizable PII.
 * Used for validation — callers can choose to reject rather than sanitize.
 */
export function containsPii(text: string): boolean {
  return PII_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
