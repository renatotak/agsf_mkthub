import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/api-access-logs — read-only endpoint for API access logs (Phase 29).
 *
 *   GET /api/api-access-logs?key_id=X&endpoint=Y&from=Z&to=W&limit=N&offset=M
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const keyId = sp.get("key_id");
  const endpoint = sp.get("endpoint");
  const from = sp.get("from");
  const to = sp.get("to");
  const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);
  const offset = parseInt(sp.get("offset") || "0", 10);

  let query = supabaseAdmin
    .from("api_access_logs")
    .select("id, api_key_id, endpoint, method, status_code, ip_address, user_agent, response_time_ms, created_at, api_keys(name, key_prefix)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (keyId) query = query.eq("api_key_id", keyId);
  if (endpoint) query = query.eq("endpoint", endpoint);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    logs: data || [],
    total: count ?? 0,
    limit,
    offset,
  });
}
