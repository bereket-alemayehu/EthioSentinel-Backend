import { prisma } from "../lib/prisma";
import Logger from "../utils/logger";

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

type OutbreakNewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl?: string;
  publishedAt: string | null;
  source: "WHO" | "WHO Africa" | "Google News";
  scope: "GLOBAL" | "AFRICA" | "ETHIOPIA";
  diseases: string[];
  countries: string[];
};

const WHO_DON_URL =
  "https://www.who.int/api/hubs/diseaseoutbreaknews?sf_provider=OpenAccessDataProvider&sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=20";
const WHO_AFRO_RSS_URL = "https://www.afro.who.int/rss/emergencies.xml";
const WHO_DON_RSS_URL = "https://www.who.int/feeds/entity/csr/don/en/rss.xml";

const DISEASE_KEYWORDS = [
  "cholera",
  "covid",
  "covid-19",
  "ebola",
  "hantavirus",
  "hanta virus",
  "malaria",
  "measles",
  "mpox",
  "dengue",
  "marburg",
  "yellow fever",
  "rift valley fever",
  "polio",
];

const AFRICAN_COUNTRIES = [
  "ethiopia",
  "kenya",
  "somalia",
  "sudan",
  "south sudan",
  "eritrea",
  "djibouti",
  "uganda",
  "tanzania",
  "rwanda",
  "burundi",
  "democratic republic of the congo",
  "nigeria",
  "ghana",
  "south africa",
  "zambia",
  "zimbabwe",
  "mozambique",
  "angola",
  "cameroon",
  "mali",
  "niger",
  "senegal",
];

function decodeHtmlEntities(value: unknown): string {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_match, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function stripHtml(value: unknown): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReadableSummary(raw: unknown): string {
  const decoded = decodeHtmlEntities(raw);
  const bodyMatch = decoded.match(/<div[^>]*field--name-body[^>]*>([\s\S]*?)<\/div>/i);
  const source = bodyMatch?.[1] ?? decoded;
  const paragraphs = Array.from(source.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);

  const text = paragraphs.length > 0 ? paragraphs.join(" ") : stripHtml(source);
  return text.length > 420 ? `${text.slice(0, 417).trim()}...` : text;
}

function riskFromCounts(cases: number, deaths: number, spikeCount: number): RiskLevel {
  if (deaths >= 10 || spikeCount >= 3 || cases >= 1000) return "CRITICAL";
  if (deaths >= 3 || spikeCount >= 1 || cases >= 250) return "HIGH";
  if (deaths >= 1 || cases >= 50) return "MODERATE";
  return "LOW";
}

function detectTerms(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term));
}

function parseRssItems(xml: string): OutbreakNewsItem[] {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return matches.slice(0, 20).map((match, index) => {
    const item = match[1];
    const readTag = (tag: string) => {
      const tagMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return tagMatch?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") ?? "";
    };
    const title = stripHtml(readTag("title"));
    const summary = extractReadableSummary(readTag("description"));
    const url = stripHtml(readTag("link"));
    const publishedAt = stripHtml(readTag("pubDate"));
    const imageUrl = stripHtml(
      item.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1] ??
        item.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1] ??
        item.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1] ??
        "",
    );
    const text = `${title} ${summary}`;

    return {
      id: `who-afro-${publishedAt || index}-${title}`.slice(0, 180),
      title,
      summary,
      url,
      imageUrl: imageUrl || undefined,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      source: "WHO Africa",
      scope: "AFRICA",
      diseases: detectTerms(text, DISEASE_KEYWORDS),
      countries: detectTerms(text, AFRICAN_COUNTRIES),
    };
  });
}

export class PublicHealthService {
  static async getEthiopiaRegionalStatus(days = 30) {
    const windowDays = Math.max(1, Math.min(365, days));
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - windowDays);

    const regions = await prisma.region.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        districts: {
          select: {
            id: true,
            name: true,
            code: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const districtToRegion = new Map<string, string>();
    for (const region of regions) {
      for (const district of region.districts) {
        districtToRegion.set(district.name.toLowerCase(), region.name);
      }
    }

    const realReportWhere = {
      timestamp: { gte: since },
      OR: [
        { notes: null },
        { notes: { not: { startsWith: "Prediction demo seed" } } },
      ],
    };
    const realSpikeWhere = {
      createdAt: { gte: since },
      classification: "ANOMALY" as const,
      OR: [
        { notes: null },
        { notes: { not: { startsWith: "Prediction demo seed" } } },
      ],
    };

    const [reportGroups, diseaseGroups, spikeGroups] = await Promise.all([
      prisma.diseaseReport.groupBy({
        by: ["district"],
        where: realReportWhere,
        _sum: { caseCount: true, deathCount: true },
        _count: { id: true },
      }),
      prisma.diseaseReport.groupBy({
        by: ["district", "diseaseType"],
        where: realReportWhere,
        _sum: { caseCount: true, deathCount: true },
      }),
      prisma.anomalySignal.groupBy({
        by: ["district"],
        where: realSpikeWhere,
        _count: { id: true },
      }),
    ]);

    const spikeByRegion = new Map<string, number>();
    const spikeByDistrict = new Map<string, number>();
    for (const row of spikeGroups) {
      const region = districtToRegion.get(row.district.toLowerCase());
      if (!region) continue;
      spikeByRegion.set(region, (spikeByRegion.get(region) ?? 0) + row._count.id);
      spikeByDistrict.set(row.district.toLowerCase(), row._count.id);
    }

    const regionTotals = new Map<
      string,
      { cases: number; deaths: number; reports: number; diseaseCases: Map<string, number> }
    >();
    const districtTotals = new Map<
      string,
      { cases: number; deaths: number; reports: number; diseaseCases: Map<string, number> }
    >();
    for (const region of regions) {
      regionTotals.set(region.name, {
        cases: 0,
        deaths: 0,
        reports: 0,
        diseaseCases: new Map(),
      });
      for (const district of region.districts) {
        districtTotals.set(district.name.toLowerCase(), {
          cases: 0,
          deaths: 0,
          reports: 0,
          diseaseCases: new Map(),
        });
      }
    }

    for (const row of reportGroups) {
      const region = districtToRegion.get(row.district.toLowerCase());
      if (!region) continue;
      const target = regionTotals.get(region);
      if (!target) continue;
      target.cases += row._sum.caseCount ?? 0;
      target.deaths += row._sum.deathCount ?? 0;
      target.reports += row._count.id;

      const districtTarget = districtTotals.get(row.district.toLowerCase());
      if (districtTarget) {
        districtTarget.cases += row._sum.caseCount ?? 0;
        districtTarget.deaths += row._sum.deathCount ?? 0;
        districtTarget.reports += row._count.id;
      }
    }

    for (const row of diseaseGroups) {
      const region = districtToRegion.get(row.district.toLowerCase());
      if (!region) continue;
      const target = regionTotals.get(region);
      if (!target) continue;
      target.diseaseCases.set(
        row.diseaseType,
        (target.diseaseCases.get(row.diseaseType) ?? 0) + (row._sum.caseCount ?? 0),
      );

      const districtTarget = districtTotals.get(row.district.toLowerCase());
      if (districtTarget) {
        districtTarget.diseaseCases.set(
          row.diseaseType,
          (districtTarget.diseaseCases.get(row.diseaseType) ?? 0) + (row._sum.caseCount ?? 0),
        );
      }
    }

    const data = regions.map((region) => {
      const totals = regionTotals.get(region.name)!;
      const spikeCount = spikeByRegion.get(region.name) ?? 0;
      const topDiseases = Array.from(totals.diseaseCases.entries())
        .map(([diseaseType, cases]) => ({ diseaseType, cases }))
        .sort((a, b) => b.cases - a.cases)
        .slice(0, 5);

      return {
        regionId: region.id,
        region: region.name,
        districtCount: region.districts.length,
        totalCases: totals.cases,
        totalDeaths: totals.deaths,
        reportCount: totals.reports,
        spikeCount,
        riskLevel: riskFromCounts(totals.cases, totals.deaths, spikeCount),
        topDiseases,
        districts: region.districts
          .map((district) => {
            const districtData = districtTotals.get(district.name.toLowerCase()) ?? {
              cases: 0,
              deaths: 0,
              reports: 0,
              diseaseCases: new Map<string, number>(),
            };
            const districtSpikes = spikeByDistrict.get(district.name.toLowerCase()) ?? 0;
            return {
              districtId: district.id,
              district: district.name,
              latitude: district.latitude?.toString() ?? null,
              longitude: district.longitude?.toString() ?? null,
              totalCases: districtData.cases,
              totalDeaths: districtData.deaths,
              reportCount: districtData.reports,
              spikeCount: districtSpikes,
              riskLevel: riskFromCounts(districtData.cases, districtData.deaths, districtSpikes),
              topDiseases: Array.from(districtData.diseaseCases.entries())
                .map(([diseaseType, cases]) => ({ diseaseType, cases }))
                .sort((a, b) => b.cases - a.cases)
                .slice(0, 4),
            };
          })
          .sort((a, b) => b.totalCases - a.totalCases),
      };
    });

    return {
      windowDays,
      source: "Verified HEW reports and imported public-health API records stored in EthioSentinel",
      data,
      totals: {
        cases: data.reduce((sum, item) => sum + item.totalCases, 0),
        deaths: data.reduce((sum, item) => sum + item.totalDeaths, 0),
        reports: data.reduce((sum, item) => sum + item.reportCount, 0),
        spikes: data.reduce((sum, item) => sum + item.spikeCount, 0),
      },
    };
  }

  static async getOutbreakNews(): Promise<OutbreakNewsItem[]> {
    const results: OutbreakNewsItem[] = [];

    try {
      const response = await fetch(WHO_DON_URL);
      if (response.ok) {
        const json = await response.json() as { value?: Array<Record<string, unknown>> };
        for (const [index, item] of (json.value ?? []).entries()) {
          const title = stripHtml(item.Title || item.TitleEn || item.Name);
          const summary = extractReadableSummary(item.Summary || item.Overview || item.Description);
          const published = String(item.PublicationDateAndTime || item.PublicationDate || item.LastModified || "");
          const urlName = String(item.UrlName || item.ItemDefaultUrl || item.DefaultUrl || "");
          const imageUrl = stripHtml(
            item.ThumbnailUrl ||
              item.ImageUrl ||
              item.Image ||
              item.HeroImage ||
              "",
          );
          const url = urlName
            ? urlName.startsWith("http")
              ? urlName
              : `https://www.who.int/emergencies/disease-outbreak-news/item/${urlName}`
            : "https://www.who.int/emergencies/disease-outbreak-news";
          const text = `${title} ${summary}`;
          results.push({
            id: `who-${published || index}-${title}`.slice(0, 180),
            title,
            summary,
            url,
            imageUrl: imageUrl || undefined,
            publishedAt: published ? new Date(published).toISOString() : null,
            source: "WHO",
            scope: "GLOBAL",
            diseases: detectTerms(text, DISEASE_KEYWORDS),
            countries: detectTerms(text, AFRICAN_COUNTRIES),
          });
        }
      }
    } catch (error) {
      Logger.warn("Failed to fetch WHO outbreak news", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const response = await fetch(WHO_DON_RSS_URL);
      if (response.ok) {
        results.push(
          ...parseRssItems(await response.text()).map((item) => ({
            ...item,
            source: "WHO" as const,
            scope: "GLOBAL" as const,
          })),
        );
      }
    } catch (error) {
      Logger.warn("Failed to fetch WHO DON RSS", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const response = await fetch(WHO_AFRO_RSS_URL);
      if (response.ok) {
        results.push(...parseRssItems(await response.text()));
      }
    } catch (error) {
      Logger.warn("Failed to fetch WHO Africa RSS", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q=Ethiopia+health&hl=en-US&gl=US&ceid=US:en";
      const response = await fetch(GOOGLE_NEWS_RSS);
      if (response.ok) {
        results.push(
          ...parseRssItems(await response.text()).map((item) => ({
            ...item,
            source: "Google News" as const,
            scope: "ETHIOPIA" as const,
          })),
        );
      }
    } catch (error) {
      Logger.warn("Failed to fetch Google News RSS", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const unique = new Map<string, OutbreakNewsItem>();
    for (const item of results) {
      if (!item.title) continue;
      unique.set(`${item.source}:${item.title}`, item);
    }

    return Array.from(unique.values())
      .sort((a, b) => {
        const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bTime - aTime;
      })
      .slice(0, 30);
  }
}
