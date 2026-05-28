/**
 * Citizen-facing and email copy — no z-scores, baselines, or internal AI jargon.
 */

export type HealthMessagingInput = {
  diseaseType: string;
  district: string;
  currentCases: number;
  historicalMean?: number;
  riskLevel?: string;
};

const DISEASE_KEY = (name: string) => name.trim().toLowerCase();

function diseaseGuidance(diseaseType: string): {
  watchFor: string[];
  recommendations: string[];
  seekCare: string[];
} {
  const d = DISEASE_KEY(diseaseType);

  if (d.includes("measles")) {
    return {
      watchFor: [
        "High fever followed by a rash that spreads from the face to the body",
        "Runny nose, red eyes, cough, and tiredness in children",
        "Loss of appetite or unusual fussiness in young children",
      ],
      recommendations: [
        "A community vaccination drive is planned—check with your local health post for dates and bring your child's vaccination card.",
        "Keep children who are sick at home and away from school, church, and crowded gatherings until a health worker clears them.",
        "Do not share cups, utensils, or towels within the household while someone is ill.",
        "Ensure good ventilation at home and encourage rest and plenty of fluids.",
        "Pregnant women and infants should avoid contact with anyone who has fever or rash.",
      ],
      seekCare: [
        "Child has difficulty breathing, is very sleepy, or refuses to drink",
        "Fever lasts more than three days or rash spreads with high fever",
        "Any infant under six months with fever",
      ],
    };
  }

  if (d.includes("cholera")) {
    return {
      watchFor: [
        "Sudden watery diarrhea and vomiting",
        "Leg cramps, thirst, or dry mouth",
        "Weakness or dizziness when standing",
      ],
      recommendations: [
        "Drink only boiled, treated, or bottled water; avoid ice from unknown sources.",
        "Wash hands with soap before eating and after using the toilet.",
        "Cook food thoroughly and eat it while still hot.",
        "Use latrines safely and keep the home compound clean.",
        "Prepare oral rehydration solution (ORS) at home if taught by health workers—give sips often to children and adults with diarrhea.",
      ],
      seekCare: [
        "Signs of severe dehydration (sunken eyes, no urine, very weak)",
        "Blood in stool or persistent vomiting",
        "Any child or elderly person with many watery stools in a day",
      ],
    };
  }

  if (d.includes("malaria")) {
    return {
      watchFor: [
        "Fever with chills, headache, or body aches",
        "Nausea, vomiting, or weakness",
        "Symptoms that return after prior treatment",
      ],
      recommendations: [
        "Sleep under an insecticide-treated bed net every night.",
        "Remove standing water near homes where mosquitoes breed.",
        "Wear long sleeves in the evening when mosquitoes are active.",
        "Complete the full course of any antimalarial medicine prescribed—do not stop early.",
        "Pregnant women should attend antenatal visits and follow malaria prevention advice from clinicians.",
      ],
      seekCare: [
        "Fever in pregnancy or in children under five years",
        "Confusion, very pale skin, or difficulty breathing with fever",
        "Fever that does not improve within 48 hours after starting treatment",
      ],
    };
  }

  if (d.includes("tb") || d.includes("tuberculosis")) {
    return {
      watchFor: [
        "Cough lasting more than two weeks",
        "Night sweats, weight loss, or long-lasting fever",
        "Coughing blood or chest pain",
      ],
      recommendations: [
        "Anyone with a long cough should visit a health facility for screening—early treatment protects the family.",
        "Take all TB medicines exactly as directed for the full course.",
        "Cover your mouth when coughing and dispose of tissues safely.",
        "Keep windows open for airflow at home.",
      ],
      seekCare: [
        "Coughing blood or severe chest pain",
        "Unable to take medicines due to side effects—contact your clinic",
      ],
    };
  }

  return {
    watchFor: [
      "Fever, cough, diarrhea, vomiting, rash, or unusual weakness",
      "Symptoms that are new, worsening, or not improving after a few days",
    ],
    recommendations: [
      "Wash hands often with soap and safe water.",
      "Share accurate information with neighbors—avoid rumors and stigma.",
      "Follow instructions from your local health office and community health workers.",
      "Keep sick family members resting at home when advised.",
      "Use clean water and safe food handling practices.",
    ],
    seekCare: [
      "Difficulty breathing, confusion, or inability to drink fluids",
      "High fever in infants, pregnant women, or elderly family members",
      "Any sudden worsening of symptoms",
    ],
  };
}

function formatList(title: string, items: string[]): string {
  return [title, ...items.map((item, i) => `${i + 1}. ${item}`)].join("\n");
}

/** Full citizen advisory body with clear sections and numbered recommendations. */
export function buildDetailedCitizenAdvisory(input: {
  diseaseType: string;
  district: string;
  currentCases?: number;
  riskLevel?: string;
  extraNote?: string;
}): string {
  const disease = input.diseaseType.trim() || "this illness";
  const district = input.district.trim() || "your area";
  const cases =
    typeof input.currentCases === "number" && input.currentCases > 0
      ? Math.round(input.currentCases)
      : null;
  const risk = (input.riskLevel ?? "MODERATE").toUpperCase();
  const guide = diseaseGuidance(disease);

  const overviewParts = [
    `Health officials have issued guidance for ${district} because of ${disease} activity in the community.`,
    cases
      ? `Recent reports from the area include about ${cases} case${cases === 1 ? "" : "s"}—higher than usual for this period.`
      : `Community health teams are monitoring the situation closely.`,
    `Risk level for this advisory: ${risk}. Please read each recommendation below and share it with family and neighbors.`,
  ];

  const blocks: string[] = [overviewParts.join(" "), ""];

  if (input.extraNote?.trim()) {
    blocks.push("Update from health authorities:", input.extraNote.trim(), "");
  }

  blocks.push(
    formatList("Warning signs to watch for:", guide.watchFor),
    "",
    formatList("Recommendations for families and the community:", guide.recommendations),
    "",
    formatList("Seek medical care immediately if you notice:", guide.seekCare),
    "",
    "This advisory may be updated as more information becomes available. For questions, contact your nearest health post or call your local health office.",
  );

  return blocks.join("\n");
}

export function buildCitizenAdvisoryContent(input: HealthMessagingInput): string {
  return buildDetailedCitizenAdvisory({
    diseaseType: input.diseaseType,
    district: input.district,
    currentCases: input.currentCases,
    riskLevel: input.riskLevel ?? "MODERATE",
  });
}

import { ChatService } from "../services/chat.service";

/**
 * Translate arbitrary user-facing text into a target language using Gemini.
 * Returns original text when target language is English or empty.
 */
async function translateText(text: string, targetLang?: string): Promise<string> {
  const lang = (targetLang ?? "").trim();
  if (!lang) return text;
  const l = lang.toLowerCase();
  if (l === "en" || l.startsWith("en") || l === "english") return text;

  const prompt = `Translate the following public-health advisory text into ${lang} for a general Ethiopian audience.
- Keep the tone clear, concise and non-technical.
- Preserve placeholders like disease names and district names.
- Keep lists and numbered items separated by newlines.
- Output only the translated text without commentary.

Text:
${text}`;

  try {
    const translated = await ChatService.requestGeminiReply({ prompt });
    return translated.trim();
  } catch (e) {
    return text; // fallback to English on translation error
  }
}

/**
 * Localized version of full advisory content. Returns English by default.
 */
export async function buildCitizenAdvisoryContentLocalized(
  input: HealthMessagingInput,
  language?: string,
): Promise<string> {
  const english = buildDetailedCitizenAdvisory({
    diseaseType: input.diseaseType,
    district: input.district,
    currentCases: input.currentCases,
    riskLevel: input.riskLevel ?? "MODERATE",
  });
  if (!language) return english;
  return translateText(english, language);
}

/**
 * Localized short SMS alert. Ensures brevity by asking the translator to keep it concise.
 */
export async function buildCitizenSmsAlertLocalized(
  diseaseType: string,
  district: string,
  language?: string,
): Promise<string> {
  const base = buildCitizenSmsAlert(diseaseType, district);
  if (!language) return base;

  const prompt = `Translate the following SMS into ${language} for a general Ethiopian audience. Keep it under 160 characters, preserve the disease and district names, and output only the translated SMS.\n\nSMS:\n${base}`;

  try {
    const translated = await ChatService.requestGeminiReply({ prompt });
    return translated.trim();
  } catch (e) {
    return base;
  }
}

/** Expand short legacy or admin one-line advisories for public display. */
export function enrichCitizenAdvisoryContent(
  raw: string,
  meta: { diseaseType: string; district: string; riskLevel?: string; currentCases?: number },
): string {
  const cleaned = sanitizePublicHealthText(raw);
  const lineCount = cleaned.split("\n").filter((l) => l.length > 20).length;
  const isBrief = cleaned.length < 320 || lineCount < 3;

  if (!isBrief) return cleaned;

  return buildDetailedCitizenAdvisory({
    diseaseType: meta.diseaseType,
    district: meta.district,
    riskLevel: meta.riskLevel,
    currentCases: meta.currentCases,
    extraNote: cleaned || undefined,
  });
}

export function buildCitizenAdvisoryTitle(diseaseType: string, district: string): string {
  return `Health advisory: ${diseaseType} in ${district}`;
}

export function buildCitizenAlertMessage(input: HealthMessagingInput): string {
  const cases = Math.max(0, Math.round(input.currentCases));
  return (
    `Increased ${input.diseaseType} activity has been reported in ${input.district} ` +
    `(${cases} recent case${cases === 1 ? "" : "s"}). Please read the full advisory and follow each recommendation.`
  );
}

export function buildCitizenAlertTitle(diseaseType: string, district: string): string {
  return `Health alert: ${diseaseType} in ${district}`;
}

export function buildCitizenSmsAlert(diseaseType: string, district: string): string {
  return (
    `EthioSentinel: ${diseaseType} guidance for ${district}. ` +
    `Open the app for full recommendations: vaccination, hygiene, and when to seek care.`
  );
}

/** Admin-only spike review note (email to health staff). */
export function buildAdminSpikeSummary(
  input: HealthMessagingInput & { zScore?: number },
): string {
  const z =
    typeof input.zScore === "number" ? input.zScore.toFixed(2) : "n/a";
  return (
    `Internal review: ${input.diseaseType} in ${input.district}. ` +
    `Cases ${input.currentCases}, recent baseline ~${(input.historicalMean ?? 0).toFixed(1)}, z-score ${z}. ` +
    `Approve the draft alert/advisory before public broadcast.`
  );
}

const TECHNICAL_LINE =
  /^(AI anomaly|Current cases:|baseline mean|z-score|Suggested immediate actions:|This draft was generated|Source:|Unusual .+ increase detected|An AI-generated|requires ADMIN review)/i;

export function sanitizePublicHealthText(text: string): string {
  if (!text?.trim()) return "";

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (TECHNICAL_LINE.test(line)) return false;
      if (/z-score|baseline mean|AI Draft:/i.test(line)) return false;
      if (/requires\s+ADMIN\s+review/i.test(line)) return false;
      return true;
    });

  return lines
    .join("\n")
    .replace(/AI anomaly signal detected for/gi, "Health officials are monitoring")
    .replace(/AI detected a potential/gi, "Health officials are reviewing a possible")
    .trim();
}

export function resolveDiseaseDisplayName(parts: {
  diseaseName?: string | null;
  diseaseType?: string | null;
  title?: string | null;
}): string {
  if (parts.diseaseName?.trim()) return parts.diseaseName.trim();
  if (parts.diseaseType?.trim()) return parts.diseaseType.trim();
  const title = parts.title ?? "";
  const m = title.match(/:\s*([^:]+)\s+in\s+/i) || title.match(/for\s+(\w[\w\s-]+?)\s+in/i);
  if (m?.[1]) return m[1].replace(/^AI\s*Draft:\s*/i, "").trim();
  return "General health concern";
}
