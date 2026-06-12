/** Great-circle distance in kilometers (WGS84). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Rough bounding box for Ethiopia (WGS84). */
export function isPlausibleEthiopiaCoordinate(lat: number, lon: number): boolean {
  return lat >= 3 && lat <= 15.5 && lon >= 33 && lon <= 48.5;
}

export function normalizeRegionName(raw: string): string {
  const name = raw.trim();
  if (!name) return name;
  const lowered = name.toLowerCase();
  if (lowered === "amahara") return "Amhara";
  if (lowered === "addis ababa" || lowered === "addis abeba") return "Addis Ababa";
  return name;
}

/** Official Addis Ababa sub-city (woreda) names. */
export const ADDIS_ABABA_SUB_CITIES = [
  "Addis Ketema",
  "Akaki Kaliti",
  "Arada",
  "Bole",
  "Gulelle",
  "Kirkos",
  "Kolfe Keranio",
  "Lideta",
  "Lemi Kura",
  "Nifas Silk-Lafto",
  "Yeka",
] as const;

const ADDIS_SUB_CITY_ALIASES: Record<string, (typeof ADDIS_ABABA_SUB_CITIES)[number]> = {
  "addis ketema": "Addis Ketema",
  "akaki kality": "Akaki Kaliti",
  "akaki kaliti": "Akaki Kaliti",
  arada: "Arada",
  bole: "Bole",
  gulele: "Gulelle",
  gulelle: "Gulelle",
  kirkos: "Kirkos",
  "kolfe keranio": "Kolfe Keranio",
  "kolfe keraniyo": "Kolfe Keranio",
  "kolfe keraneyo": "Kolfe Keranio",
  lideta: "Lideta",
  "lemi kura": "Lemi Kura",
  "nifas silk lafto": "Nifas Silk-Lafto",
  "nifas silk-lafto": "Nifas Silk-Lafto",
  "nefas silk lafto": "Nifas Silk-Lafto",
  yeka: "Yeka",
};

/** Approximate sub-city centers when health-facility data has no samples. */
export const ADDIS_ABABA_SUB_CITY_COORDS: Record<
  (typeof ADDIS_ABABA_SUB_CITIES)[number],
  { latitude: number; longitude: number }
> = {
  "Addis Ketema": { latitude: 9.0306, longitude: 38.7369 },
  "Akaki Kaliti": { latitude: 8.9758, longitude: 38.7647 },
  Arada: { latitude: 9.0354, longitude: 38.7578 },
  Bole: { latitude: 8.9936, longitude: 38.7899 },
  Gulelle: { latitude: 9.0472, longitude: 38.7378 },
  Kirkos: { latitude: 9.0103, longitude: 38.7522 },
  "Kolfe Keranio": { latitude: 9.0247, longitude: 38.6936 },
  Lideta: { latitude: 9.0147, longitude: 38.7286 },
  "Lemi Kura": { latitude: 8.9762, longitude: 38.8743 },
  "Nifas Silk-Lafto": { latitude: 8.9686, longitude: 38.7375 },
  Yeka: { latitude: 9.0625, longitude: 38.7897 },
};

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddisAbabaSubCity(raw: string): (typeof ADDIS_ABABA_SUB_CITIES)[number] | null {
  const key = normalizeLookupKey(raw);
  if (!key) return null;
  return ADDIS_SUB_CITY_ALIASES[key] ?? null;
}

export function isNumericWoredaLabel(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

/** For Addis Ababa, sub-cities live in Zone; Woreda is often a kebele number. */
export function resolveDistrictName(
  regionName: string,
  zone: string,
  woreda: string,
): string | null {
  const normalizedRegion = normalizeRegionName(regionName);
  if (normalizedRegion === "Addis Ababa") {
    const fromZone = normalizeAddisAbabaSubCity(zone);
    if (fromZone) return fromZone;
    const fromWoreda = normalizeAddisAbabaSubCity(woreda);
    if (fromWoreda) return fromWoreda;
    return null;
  }

  const label = woreda.trim();
  return label || null;
}

export type DistrictGeoRow = {
  districtId: number;
  districtName: string;
  regionId: number;
  regionName: string;
  latitude: number;
  longitude: number;
};

export function findNearestDistrictRow(
  latitude: number,
  longitude: number,
  rows: DistrictGeoRow[],
): (DistrictGeoRow & { distanceKm: number }) | null {
  if (!isPlausibleEthiopiaCoordinate(latitude, longitude) || rows.length === 0) {
    return null;
  }

  let nearest: (DistrictGeoRow & { distanceKm: number }) | null = null;
  for (const row of rows) {
    const distanceKm = haversineKm(latitude, longitude, row.latitude, row.longitude);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { ...row, distanceKm };
    }
  }
  return nearest;
}

type DistrictLike = {
  id: number;
  name: string;
  code: string;
  latitude: unknown;
  longitude: unknown;
};

/** Collapse duplicate / numeric Addis Ababa rows into the 11 official sub-cities. */
export function normalizeAddisAbabaDistrictList<T extends DistrictLike>(districts: T[]): T[] {
  const merged = new Map<string, T>();

  for (const district of districts) {
    const canonical = normalizeAddisAbabaSubCity(district.name);
    if (!canonical) continue;

    const existing = merged.get(canonical);
    if (!existing) {
      merged.set(canonical, { ...district, name: canonical });
      continue;
    }

    const existingHasCoords = existing.latitude != null && existing.longitude != null;
    const candidateHasCoords = district.latitude != null && district.longitude != null;
    if (!existingHasCoords && candidateHasCoords) {
      merged.set(canonical, { ...district, name: canonical });
    }
  }

  return ADDIS_ABABA_SUB_CITIES.map((name) => merged.get(name)).filter(
    (district): district is T => district != null,
  );
}
