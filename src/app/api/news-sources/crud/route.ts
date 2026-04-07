import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Phase 22 — News Sources CRUD
 *
 * GET    /api/news-sources/crud           → list all sources (enabled + disabled)
 * GET    /api/news-sources/crud?enabled=1 → only enabled
 * POST   /api/news-sources/crud           → create new source
 * PATCH  /api/news-sources/crud           → update an existing source by id
 * DELETE /api/news-sources/crud?id=...    → SOFT delete (sets enabled=false)
 *
 * NOTE: Hard-delete is forbidden because agro_news.source_name references
 * the human-readable name as plain text. Soft-delete preserves history.
 */

const VALID_CATEGORIES = new Set([
  "commodities", "livestock", "policy", "technology", "credit",
  "sustainability", "judicial", "general", "reading_room",
]);

const VALID_LANGUAGES = new Set(["pt", "en", "es"]);

const VALID_SOURCE_TYPES = new Set(["rss", "reading_room", "api", "scrape"]);

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const enabledOnly = req.nextUrl.searchParams.get("enabled") === "1";

  let query = supabase
    .from("news_sources")
    .select("*")
    .order("name", { ascending: true });

  if (enabledOnly) query = query.eq("enabled", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const sourceType: string = typeof body.source_type === "string" ? body.source_type : "rss";
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    return NextResponse.json({ error: `invalid source_type (allowed: ${[...VALID_SOURCE_TYPES].join(",")})` }, { status: 400 });
  }

  // RSS sources require a valid feed URL
  const rss_url = body.rss_url ?? null;
  if (sourceType === "rss") {
    if (!isValidUrl(rss_url)) {
      return NextResponse.json({ error: "rss_url is required and must be a valid http(s) URL" }, { status: 400 });
    }
  } else if (rss_url != null && rss_url !== "" && !isValidUrl(rss_url)) {
    return NextResponse.json({ error: "rss_url, if provided, must be a valid http(s) URL" }, { status: 400 });
  }

  const website_url = body.website_url ?? null;
  if (website_url != null && website_url !== "" && !isValidUrl(website_url)) {
    return NextResponse.json({ error: "website_url, if provided, must be a valid http(s) URL" }, { status: 400 });
  }

  const category: string = typeof body.category === "string" ? body.category : "general";
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: `invalid category (allowed: ${[...VALID_CATEGORIES].join(",")})` }, { status: 400 });
  }

  const language: string = typeof body.language === "string" ? body.language : "pt";
  if (!VALID_LANGUAGES.has(language)) {
    return NextResponse.json({ error: `invalid language (allowed: ${[...VALID_LANGUAGES].join(",")})` }, { status: 400 });
  }

  const enabled: boolean = body.enabled === false ? false : true;

  // ID strategy: caller may pass one, otherwise slugify the name. Append a
  // short hash if collision so we never silently overwrite.
  const baseId = typeof body.id === "string" && body.id ? slugify(body.id) : slugify(name);
  if (!baseId) return NextResponse.json({ error: "name must produce a non-empty slug" }, { status: 400 });

  let id = baseId;
  // Best-effort collision suffix (1 retry with timestamp)
  const { data: existing } = await supabase
    .from("news_sources")
    .select("id")
    .eq("id", baseId)
    .maybeSingle();
  if (existing) {
    id = `${baseId}-${Date.now().toString(36).slice(-4)}`;
  }

  const row = {
    id,
    name,
    rss_url: rss_url || null,
    website_url: website_url || null,
    category,
    language,
    enabled,
    source_type: sourceType,
    error_count: 0,
  };

  const { data, error } = await supabase
    .from("news_sources")
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = createAdminClient();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, any> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  if (body.rss_url !== undefined) {
    if (body.rss_url !== null && body.rss_url !== "" && !isValidUrl(body.rss_url)) {
      return NextResponse.json({ error: "rss_url must be a valid http(s) URL" }, { status: 400 });
    }
    updates.rss_url = body.rss_url || null;
  }
  if (body.website_url !== undefined) {
    if (body.website_url !== null && body.website_url !== "" && !isValidUrl(body.website_url)) {
      return NextResponse.json({ error: "website_url must be a valid http(s) URL" }, { status: 400 });
    }
    updates.website_url = body.website_url || null;
  }
  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    updates.category = body.category;
  }
  if (body.language !== undefined) {
    if (!VALID_LANGUAGES.has(body.language)) {
      return NextResponse.json({ error: "invalid language" }, { status: 400 });
    }
    updates.language = body.language;
  }
  if (body.source_type !== undefined) {
    if (!VALID_SOURCE_TYPES.has(body.source_type)) {
      return NextResponse.json({ error: "invalid source_type" }, { status: 400 });
    }
    updates.source_type = body.source_type;
  }
  if (body.enabled !== undefined) {
    updates.enabled = !!body.enabled;
  }
  if (body.error_count !== undefined && Number.isFinite(body.error_count)) {
    updates.error_count = Number(body.error_count);
  }
  if (body.last_error !== undefined) {
    updates.last_error = body.last_error || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("news_sources")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  // Soft-delete: flip enabled=false. Never hard-delete.
  const { data, error } = await supabase
    .from("news_sources")
    .update({ enabled: false })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data, soft_deleted: true });
}
