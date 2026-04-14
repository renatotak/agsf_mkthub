import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface ApiKeyMeta {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  active: boolean;
}

export interface AccessLogOpts {
  apiKeyId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  responseTimeMs?: number;
}

/* ── Key generation & hashing ──────────────────────────────────────────── */

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `agsf_${randomBytes(32).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

/* ── Verification ──────────────────────────────────────────────────────── */

/**
 * Extract and verify an API key from the request headers.
 * Checks `x-api-key` first, then `Authorization: Bearer <key>`.
 * Returns key metadata if valid and active, null otherwise.
 * Atomically bumps access_count and last_used_at on hit.
 */
export async function verifyApiKey(
  supabase: SupabaseClient,
  request: Request,
): Promise<ApiKeyMeta | null> {
  const raw = extractRawKey(request);
  if (!raw) return null;

  const hash = hashApiKey(raw);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, permissions, active, access_count")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !data || !data.active) return null;

  // Fire-and-forget: bump access_count + last_used_at
  supabase
    .from("api_keys")
    .update({ access_count: (data.access_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    id: data.id,
    name: data.name,
    key_prefix: data.key_prefix,
    permissions: data.permissions ?? [],
    active: data.active,
  };
}

/* ── Access logging ────────────────────────────────────────────────────── */

/** Fire-and-forget insert to api_access_logs. Never throws. */
export async function logApiAccess(
  supabase: SupabaseClient,
  opts: AccessLogOpts,
): Promise<void> {
  try {
    await supabase.from("api_access_logs").insert({
      api_key_id: opts.apiKeyId,
      endpoint: opts.endpoint,
      method: opts.method,
      status_code: opts.statusCode,
      ip_address: opts.ip,
      user_agent: opts.userAgent,
      response_time_ms: opts.responseTimeMs ?? null,
    });
  } catch {
    // fail-soft — never break the request for a logging failure
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function extractRawKey(request: Request): string | null {
  const xKey = request.headers.get("x-api-key");
  if (xKey) return xKey.trim();

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  return null;
}

/** Extract client IP from standard headers (Vercel, Cloudflare, forwarded). */
export function extractClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}
