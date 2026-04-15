import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

/**
 * PATCH /api/rj-enrich — enrich existing RJ rows with missing debt_value.
 *
 * Body: { limit?: number } — how many to enrich (default 10)
 *
 * For each row in recuperacao_judicial WHERE debt_value IS NULL AND entity_name IS NOT NULL:
 *   1. DDG scrape: "{entity_name} recuperação judicial dívida R$"
 *   2. Parse BRL amounts via regex (same patterns as rj-add)
 *   3. Update debt_value + summary snippet + source_url
 *   4. Log to activity_log
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── DDG debt-amount scraper (duplicated from rj-add) ─────────────────────

const CURRENCY_PATTERNS = [
  // R$ N (mi|bi|mil)
  /R\$\s*([\d.,]+)\s*(bi|bilh[õo][eê]s?|bi\b|milh[õo][eê]s?|mi\b|mil\b)/gi,
  // dívida/passivo de N (milhões/bilhões)
  /(?:d[íi]vida|passivo|exposição|pendência|d[ée]bito)[^0-9]{0,40}([\d.,]+)\s*(bi|bilh[õo][eê]s?|milh[õo][eê]s?|mi\b)/gi,
];

function parseAmountToBRL(amount: string, unit: string): number | null {
  const normalized = amount.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;

  const u = unit.toLowerCase();
  if (/bi/.test(u)) return value * 1_000_000_000;
  if (/mi(?!l)/.test(u) || /milh/.test(u)) return value * 1_000_000;
  if (/mil/.test(u)) return value * 1_000;
  return value;
}

async function scrapeDebtAmount(entityName: string): Promise<{ debt: number | null; source_url?: string; snippet?: string }> {
  try {
    const query = `"${entityName}" recuperação judicial dívida R$`;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { debt: null };
    const html = await res.text();

    let best = { value: 0, snippet: "", url: "" };
    const blocks = html.split(/class="result results_links/);
    for (let i = 1; i < Math.min(blocks.length, 8); i++) {
      const block = blocks[i];
      if (block.includes("result--ad")) continue;

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
      const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);
      const haystack = `${titleMatch?.[1] || ""} ${snippetMatch?.[1] || ""}`.replace(/<[^>]+>/g, "");

      for (const pattern of CURRENCY_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(haystack)) !== null) {
          const val = parseAmountToBRL(m[1], m[2]);
          if (val && val > best.value && val < 1e12) {
            let url = "";
            if (uddgMatch?.[1]) {
              try { url = decodeURIComponent(uddgMatch[1]); } catch { /* skip */ }
            }
            best = { value: val, snippet: haystack.slice(0, 240).trim(), url };
          }
        }
      }
    }

    if (best.value > 0) {
      return { debt: best.value, source_url: best.url, snippet: best.snippet };
    }
    return { debt: null };
  } catch {
    return { debt: null };
  }
}

// ─── PATCH handler ────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults apply
  }

  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

  // Fetch rows with missing debt_value
  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("recuperacao_judicial")
    .select("id, entity_name")
    .is("debt_value", null)
    .not("entity_name", "is", null)
    .not("entity_name", "eq", "")
    .limit(limit);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, skipped: 0, errors: [] });
  }

  let enriched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const result = await scrapeDebtAmount(row.entity_name);
      if (!result.debt) {
        skipped++;
        continue;
      }

      const updatePayload: Record<string, any> = {
        debt_value: result.debt,
      };
      if (result.snippet) updatePayload.summary = result.snippet;
      if (result.source_url) updatePayload.source_url = result.source_url;

      const { error: updateError } = await supabaseAdmin
        .from("recuperacao_judicial")
        .update(updatePayload)
        .eq("id", row.id);

      if (updateError) {
        errors.push(`${row.entity_name}: ${updateError.message}`);
        continue;
      }

      enriched++;

      await logActivity(supabaseAdmin, {
        action: "update",
        target_table: "recuperacao_judicial",
        target_id: row.id,
        source: "rj-enrich",
        source_kind: "manual",
        summary: `Enriched debt_value for ${row.entity_name}: R$ ${result.debt.toLocaleString("pt-BR")}`.slice(0, 200),
        metadata: {
          debt_value: result.debt,
          source_url: result.source_url || null,
        },
      });
    } catch (e: any) {
      errors.push(`${row.entity_name}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, enriched, skipped, errors });
}
