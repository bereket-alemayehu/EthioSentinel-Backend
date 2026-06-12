/**
 * Backfill missing district latitude/longitude from health facility coordinates.
 * Run: npm run db:backfill-district-coords
 * Force recompute all centroids: npm run db:backfill-district-coords -- --force
 */
import { prisma } from "../lib/prisma";
import { findNearestDistrictRow, isPlausibleEthiopiaCoordinate } from "../utils/geo.util";

const force = process.argv.includes("--force");

async function main() {
  const [total, withCoords, withoutCoords, facilityCount, linkedFacilities] =
    await Promise.all([
      prisma.district.count(),
      prisma.district.count({
        where: { latitude: { not: null }, longitude: { not: null } },
      }),
      prisma.district.count({
        where: { OR: [{ latitude: null }, { longitude: null }] },
      }),
      prisma.healthFacility.count(),
      prisma.healthFacility.count({ where: { districtId: { not: null } } }),
    ]);

  console.log("District coordinate status:");
  console.log(`  Total districts:     ${total}`);
  console.log(`  With coordinates:    ${withCoords}`);
  console.log(`  Missing coordinates: ${withoutCoords}`);
  console.log(`  Health facilities:   ${facilityCount} (${linkedFacilities} linked to a district)`);
  console.log(`  Mode:                ${force ? "force (recompute all)" : "fill missing only"}`);
  console.log("");

  const facilities = await prisma.healthFacility.findMany({
    where: {
      Y: { not: null },
      X: { not: null },
    },
    select: {
      districtId: true,
      Woreda: true,
      Region: true,
      Y: true,
      X: true,
    },
  });

  const sumsByDistrictId = new Map<number, { lat: number; lon: number; n: number }>();
  const sumsByRegionWoreda = new Map<string, { lat: number; lon: number; n: number }>();

  for (const f of facilities) {
    const lat = Number(f.Y);
    const lon = Number(f.X);
    if (!isPlausibleEthiopiaCoordinate(lat, lon)) continue;

    if (f.districtId) {
      const prev = sumsByDistrictId.get(f.districtId) ?? { lat: 0, lon: 0, n: 0 };
      prev.lat += lat;
      prev.lon += lon;
      prev.n += 1;
      sumsByDistrictId.set(f.districtId, prev);
    }

    const woreda = (f.Woreda ?? "").trim().toLowerCase();
    const region = (f.Region ?? "").trim().toLowerCase();
    if (woreda && region) {
      const key = `${region}::${woreda}`;
      const prev = sumsByRegionWoreda.get(key) ?? { lat: 0, lon: 0, n: 0 };
      prev.lat += lat;
      prev.lon += lon;
      prev.n += 1;
      sumsByRegionWoreda.set(key, prev);
    }
  }

  const districts = await prisma.district.findMany({
    include: { region: { select: { name: true } } },
  });

  let updated = 0;
  let skipped = 0;

  for (const district of districts) {
    const hasCoords = district.latitude != null && district.longitude != null;
    if (hasCoords && !force) {
      skipped += 1;
      continue;
    }

    let centroid = sumsByDistrictId.get(district.id);
    if (!centroid || centroid.n === 0) {
      const key = `${district.region.name.toLowerCase()}::${district.name.toLowerCase().trim()}`;
      centroid = sumsByRegionWoreda.get(key);
    }

    if (!centroid || centroid.n === 0) {
      continue;
    }

    const latitude = centroid.lat / centroid.n;
    const longitude = centroid.lon / centroid.n;
    if (!isPlausibleEthiopiaCoordinate(latitude, longitude)) continue;

    await prisma.district.update({
      where: { id: district.id },
      data: { latitude, longitude },
    });
    updated += 1;
    console.log(
      `Updated ${district.region.name} / ${district.name} → ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (${centroid.n} facilities)`,
    );
  }

  console.log("");
  if (updated === 0) {
    console.log(
      "No districts were updated. This usually means coordinates are already set in the database.",
    );
    console.log(
      "If the app still shows Addis Ababa while you are in Bahir Dar, the browser is likely",
    );
    console.log(
      "reporting an approximate IP/Wi‑Fi location (common on laptops). On the citizen map:",
    );
    console.log("  • Allow location permission and tap “Detect my region”");
    console.log("  • Or choose Amhara → Bahirdar administration manually in the dropdown");
  } else {
    console.log(`Done. Updated ${updated} district(s); skipped ${skipped} (already had coordinates).`);
  }

  const bahirLat = 11.5931;
  const bahirLon = 37.3861;
  const withCoordsRows = await prisma.district.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    include: { region: { select: { name: true } } },
  });
  const nearestBahir = findNearestDistrictRow(
    bahirLat,
    bahirLon,
    withCoordsRows.map((d) => ({
      districtId: d.id,
      districtName: d.name,
      regionId: d.regionId,
      regionName: d.region.name,
      latitude: Number(d.latitude),
      longitude: Number(d.longitude),
    })),
  );
  if (nearestBahir) {
    console.log("");
    console.log(
      `Sanity check (Bahir Dar GPS): nearest district is "${nearestBahir.districtName}" in ${nearestBahir.regionName} (${nearestBahir.distanceKm.toFixed(1)} km away).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
