import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";
import { isGeminiConfigured, summarizeText } from "@/lib/gemini";

/**
 * POST /api/events/parse-url
 *
 * Phase 4d — Accepts an event URL, scrapes it with Cheerio first
 * (algorithms first!), falls back to Vertex AI only if Cheerio
 * extraction is insufficient.
 *
 * Returns: { name, date_start, date_end, city, state, url, organizer, description }
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Brazilian states for validation
const BR_STATES = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

// Date patterns commonly found on Brazilian event pages
const DATE_PATTERNS = [
  // "12 a 15 de março de 2026" / "12 a 15 de mar. 2026"
  /(\d{1,2})\s*(?:a|e|-|até)\s*(\d{1,2})\s*de\s*(\w+\.?)\s*(?:de\s+)?(\d{4})/i,
  // "12 de março de 2026"
  /(\d{1,2})\s*de\s*(\w+\.?)\s*(?:de\s+)?(\d{4})/i,
  // "12/03/2026" or "12-03-2026"
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  // "2026-03-12" ISO
  /(\d{4})-(\d{2})-(\d{2})/,
  // "March 12-15, 2026"
  /(\w+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})/i,
  // "March 12, 2026"
  /(\w+)\s+(\d{1,2}),?\s*(\d{4})/i,
];

const MONTH_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4,
  maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9,
  outubro: 10, novembro: 11, dezembro: 12,
  "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
  "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
  "jan.": 1, "fev.": 2, "mar.": 3, "abr.": 4, "mai.": 5, "jun.": 6,
  "jul.": 7, "ago.": 8, "set.": 9, "out.": 10, "nov.": 11, "dez.": 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseMonth(s: string): number | null {
  const key = s.toLowerCase().replace(/\.$/, "");
  return MONTH_MAP[key] ?? MONTH_MAP[key + "."] ?? null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

interface ParsedDates {
  date_start: string | null;
  date_end: string | null;
}

function extractDates(text: string): ParsedDates {
  // Try range pattern first: "12 a 15 de março de 2026"
  let m = text.match(DATE_PATTERNS[0]);
  if (m) {
    const month = parseMonth(m[3]);
    if (month) {
      return {
        date_start: toIso(+m[4], month, +m[1]),
        date_end: toIso(+m[4], month, +m[2]),
      };
    }
  }

  // "12 de março de 2026"
  m = text.match(DATE_PATTERNS[1]);
  if (m) {
    const month = parseMonth(m[2]);
    if (month) {
      return { date_start: toIso(+m[3], month, +m[1]), date_end: null };
    }
  }

  // "12/03/2026"
  m = text.match(DATE_PATTERNS[2]);
  if (m) {
    return { date_start: toIso(+m[3], +m[2], +m[1]), date_end: null };
  }

  // ISO "2026-03-12"
  m = text.match(DATE_PATTERNS[3]);
  if (m) {
    return { date_start: toIso(+m[1], +m[2], +m[3]), date_end: null };
  }

  // "March 12-15, 2026"
  m = text.match(DATE_PATTERNS[4]);
  if (m) {
    const month = parseMonth(m[1]);
    if (month) {
      return {
        date_start: toIso(+m[4], month, +m[2]),
        date_end: toIso(+m[4], month, +m[3]),
      };
    }
  }

  // "March 12, 2026"
  m = text.match(DATE_PATTERNS[5]);
  if (m) {
    const month = parseMonth(m[1]);
    if (month) {
      return { date_start: toIso(+m[3], month, +m[2]), date_end: null };
    }
  }

  return { date_start: null, date_end: null };
}

function extractLocation(text: string): { city: string | null; state: string | null } {
  // Match "Cidade - UF", "Cidade, UF", "Cidade/UF", "Cidade (UF)"
  const locationPattern = /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)\s*[-,\/\(]\s*([A-Z]{2})\b/g;
  let match;
  while ((match = locationPattern.exec(text)) !== null) {
    const state = match[2].toUpperCase();
    if (BR_STATES.has(state)) {
      return { city: match[1].trim(), state };
    }
  }
  return { city: null, state: null };
}

interface ParsedEvent {
  name: string | null;
  date_start: string | null;
  date_end: string | null;
  city: string | null;
  state: string | null;
  url: string;
  organizer: string | null;
  description: string | null;
  parse_method: "cheerio" | "ai";
}

function cheerioExtract(html: string, url: string): ParsedEvent {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header, .cookie-bar, .ad, .advertisement").remove();

  // --- Name ---
  // Try og:title, h1, title in order
  let name = $('meta[property="og:title"]').attr("content")?.trim()
    || $("h1").first().text().trim()
    || $("title").text().trim()
    || null;
  // Clean up common suffixes like " | Site Name"
  if (name) {
    name = name.split(/\s*[\|–—]\s*/)[0].trim() || name;
  }

  // --- Description ---
  let description = $('meta[property="og:description"]').attr("content")?.trim()
    || $('meta[name="description"]').attr("content")?.trim()
    || null;

  // --- Dates ---
  // Try structured data first (JSON-LD)
  let date_start: string | null = null;
  let date_end: string | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).text());
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item["@type"] === "Event" || item["@type"]?.includes?.("Event")) {
          if (item.startDate) {
            date_start = item.startDate.slice(0, 10);
          }
          if (item.endDate) {
            date_end = item.endDate.slice(0, 10);
          }
          if (item.name && !name) name = item.name;
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });

  // Fallback: extract dates from body text
  if (!date_start) {
    const bodyText = $("body").text();
    const dates = extractDates(bodyText);
    date_start = dates.date_start;
    date_end = dates.date_end;
  }

  // --- Location ---
  let city: string | null = null;
  let state: string | null = null;

  // JSON-LD location
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).text());
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item["@type"] === "Event" && item.location?.address) {
          const addr = typeof item.location.address === "string"
            ? item.location.address
            : item.location.address.addressLocality || "";
          const loc = extractLocation(addr + " " + (item.location.address.addressRegion || ""));
          if (loc.city) { city = loc.city; state = loc.state; }
        }
      }
    } catch { /* ignore */ }
  });

  // Fallback: scan body text
  if (!city) {
    const bodyText = $("body").text();
    const loc = extractLocation(bodyText);
    city = loc.city;
    state = loc.state;
  }

  // --- Organizer ---
  let organizer: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).text());
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item["@type"] === "Event" && item.organizer) {
          organizer = typeof item.organizer === "string"
            ? item.organizer
            : item.organizer.name || null;
        }
      }
    } catch { /* ignore */ }
  });

  return {
    name,
    date_start,
    date_end,
    city,
    state,
    url,
    organizer,
    description,
    parse_method: "cheerio",
  };
}

function isCheerioSufficient(parsed: ParsedEvent): boolean {
  // We need at least a name and a date to consider Cheerio sufficient
  return !!(parsed.name && parsed.date_start);
}

async function aiExtract(html: string, url: string): Promise<ParsedEvent | null> {
  if (!isGeminiConfigured()) return null;

  // Strip HTML tags to get plain text, limit to 8k chars for the prompt
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  const plainText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  if (plainText.length < 50) return null;

  const systemPrompt = `You are a data extraction assistant. Extract event details from the provided webpage text. Return valid JSON with exactly these fields:
- "name": string (event title)
- "date_start": string (YYYY-MM-DD format)
- "date_end": string or null (YYYY-MM-DD format, null if same day or unknown)
- "city": string or null (city name in Brazil)
- "state": string or null (2-letter Brazilian state code, e.g. "SP", "MT")
- "organizer": string or null
- "description": string or null (1-2 sentence summary)

Return ONLY the JSON object, no other text.`;

  const userPrompt = `URL: ${url}\n\nPage content:\n${plainText}`;

  try {
    const raw = await summarizeText(systemPrompt, userPrompt, 500);
    const parsed = JSON.parse(raw);
    return {
      name: parsed.name || null,
      date_start: parsed.date_start || null,
      date_end: parsed.date_end || null,
      city: parsed.city || null,
      state: parsed.state?.toUpperCase() || null,
      url,
      organizer: parsed.organizer || null,
      description: parsed.description || null,
      parse_method: "ai",
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = body.url?.trim();

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Valid URL required" }, { status: 400 });
  }

  try {
    // Fetch the page
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AgriSafeMarketHub/1.0 (event-parser)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: HTTP ${res.status}` },
        { status: 422 },
      );
    }

    const html = await res.text();

    // Step 1: Cheerio extraction (algorithms first)
    let parsed = cheerioExtract(html, url);

    // Step 2: Fall back to AI only if Cheerio insufficient
    if (!isCheerioSufficient(parsed)) {
      const aiResult = await aiExtract(html, url);
      if (aiResult) {
        // Merge: prefer AI results but keep any Cheerio data that AI missed
        parsed = {
          name: aiResult.name || parsed.name,
          date_start: aiResult.date_start || parsed.date_start,
          date_end: aiResult.date_end || parsed.date_end,
          city: aiResult.city || parsed.city,
          state: aiResult.state || parsed.state,
          url,
          organizer: aiResult.organizer || parsed.organizer,
          description: aiResult.description || parsed.description,
          parse_method: "ai",
        };
      }
    }

    await logActivity(supabaseAdmin, {
      action: "insert",
      target_table: "events",
      source: "manual:events_parse_url",
      source_kind: "manual",
      summary: `URL parsed (${parsed.parse_method}): ${parsed.name || url}`.slice(0, 200),
      metadata: { url, parse_method: parsed.parse_method, has_date: !!parsed.date_start },
    });

    return NextResponse.json({ success: true, event: parsed });
  } catch (e: any) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return NextResponse.json({ error: "URL fetch timed out (15s)" }, { status: 422 });
    }
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
