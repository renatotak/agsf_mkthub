import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Search terms for agro companies in distress ───

const SEARCH_QUERIES = [
  '"recuperação judicial" agronegócio 2026',
  '"recuperação judicial" revenda insumos agrícolas',
  '"recuperação extrajudicial" agronegócio',
  '"recuperação judicial" cooperativa agrícola',
  '"recuperação judicial" usina sucroalcooleira',
  '"recuperação judicial" frigorífico',
  '"recuperação judicial" distribuidor defensivos agrícolas',
  '"falência" agronegócio empresa rural 2025 2026',
  '"reestruturação" empresa agrícola dívida',
  '"crise financeira" revenda agrícola',
];

// ─── DuckDuckGo HTML search (reused from company-research) ───

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const findings: SearchResult[] = [];
  const blocks = html.split(/class="result results_links/);
  for (let i = 1; i < Math.min(blocks.length, 8); i++) {
    const block = blocks[i];
    if (block.includes("result--ad")) continue;
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);

    if (!titleMatch) continue;
    const title = titleMatch[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    const snippet = (snippetMatch?.[1] || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
    let url = "";
    if (uddgMatch?.[1]) {
      try { url = decodeURIComponent(uddgMatch[1]); } catch { /* skip */ }
    }
    let source = "";
    try { source = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* skip */ }
    findings.push({ title, snippet, url, source });
  }
  return findings;
}

// ─── Classification helpers ───

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

interface RJFinding {
  entity_name: string;
  situation: string; // recuperacao_judicial | extrajudicial | falencia | reestruturacao
  summary: string;
  source_url: string;
  source_name: string;
  state: string | null;
  entity_type: string;
  search_query: string;
  found_at: string;
}

const SITUATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /recupera[çc][ãa]o judicial/i, label: "recuperacao_judicial" },
  { pattern: /recupera[çc][ãa]o extrajudicial/i, label: "extrajudicial" },
  { pattern: /fal[êe]ncia|falido/i, label: "falencia" },
  { pattern: /reestrutura[çc][ãa]o|crise financeira|d[ií]vida/i, label: "reestruturacao" },
  { pattern: /liquida[çc][ãa]o/i, label: "liquidacao" },
];

function classifySituation(text: string): string | null {
  for (const { pattern, label } of SITUATION_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function classifyEntityType(text: string): string {
  const lower = text.toLowerCase();
  if (/revenda|distribuid|com[ée]rcio.*(defensiv|insumo|agr[ií]col)/i.test(lower)) return "revenda";
  if (/cooperativa/i.test(lower)) return "cooperativa";
  if (/usina|sucro/i.test(lower)) return "usina";
  if (/frigor[ií]fico|abate/i.test(lower)) return "frigorifico";
  if (/produtor rural/i.test(lower)) return "produtor_rural";
  if (/agro|agr[ií]c|pecuári/i.test(lower)) return "empresa_agro";
  return "outros";
}

function extractState(text: string): string | null {
  const patterns: Record<string, RegExp> = {
    SP: /s[ãa]o paulo|\bSP\b/i, MT: /mato grosso(?! do sul)|\bMT\b/i,
    MS: /mato grosso do sul|\bMS\b/i, GO: /goi[áa]s|\bGO\b/i,
    MG: /minas gerais|\bMG\b/i, PR: /paran[áa]|\bPR\b/i,
    RS: /rio grande do sul|\bRS\b/i, BA: /bahia|\bBA\b/i,
    TO: /tocantins|\bTO\b/i, MA: /maranh[ãa]o|\bMA\b/i,
    PA: /par[áa](?! do)|\bPA\b/i, SC: /santa catarina|\bSC\b/i,
    RO: /rond[ôo]nia|\bRO\b/i, PI: /piau[ií]|\bPI\b/i,
  };
  for (const [uf, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) return uf;
  }
  return null;
}

function extractEntityName(title: string): string {
  // Remove common prefixes/suffixes from news titles
  return title
    .replace(/^(empresa|grupo|revenda|cooperativa|usina|frigor[ií]fico)\s+/i, "")
    .replace(/\s+(pede|entra em|solicita|tem|decreta)\s+.*/i, "")
    .trim()
    .slice(0, 200);
}

// ─── Relevance filter: must mention agro + distress ───

const AGRO_PATTERN = /agro|agr[ií]col|pecuári|soja|milho|caf[ée]|cana|algod[ãa]o|semente|defensiv|fertilizant|insumo|cooperativa|usina|frigor[ií]fico|revenda|rural/i;

function isRelevant(text: string): boolean {
  const hasSituation = classifySituation(text) !== null;
  const hasAgro = AGRO_PATTERN.test(text);
  return hasSituation && hasAgro;
}

// ─── POST handler: run the scan ───

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const maxQueries = Math.min(body.max_queries || SEARCH_QUERIES.length, SEARCH_QUERIES.length);
  const queries = SEARCH_QUERIES.slice(0, maxQueries);

  const allFindings: RJFinding[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      const results = await searchDuckDuckGo(query);
      for (const result of results) {
        const fullText = `${result.title} ${result.snippet}`;
        if (!isRelevant(fullText)) continue;
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        allFindings.push({
          entity_name: extractEntityName(result.title),
          situation: classifySituation(fullText) || "reestruturacao",
          summary: result.snippet.slice(0, 500),
          source_url: result.url,
          source_name: result.source,
          state: extractState(fullText),
          entity_type: classifyEntityType(fullText),
          search_query: query,
          found_at: new Date().toISOString(),
        });
      }
      // Small delay between searches to be respectful
      await new Promise((r) => setTimeout(r, 800));
    } catch (e: any) {
      errors.push(`${query.slice(0, 40)}: ${e.message}`);
    }
  }

  // Upsert into recuperacao_judicial table (findings from web search)
  let inserted = 0;
  for (const finding of allFindings) {
    const id = `rjscan-${hashString(finding.source_url)}`;
    const row = {
      id,
      entity_name: finding.entity_name,
      entity_cnpj: null,
      entity_type: finding.entity_type,
      court: null,
      case_number: null,
      status: finding.situation === "recuperacao_judicial" ? "em_andamento" : finding.situation,
      filing_date: null,
      summary: `[${finding.situation.toUpperCase()}] ${finding.summary}`,
      source_url: finding.source_url,
      source_name: `Web: ${finding.source_name}`,
      state: finding.state,
    };
    const { error } = await supabaseAdmin
      .from("recuperacao_judicial")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true });
    if (!error) inserted++;
  }

  return NextResponse.json({
    success: true,
    message: "RJ web scan completed",
    timestamp: new Date().toISOString(),
    stats: {
      queries_run: queries.length,
      total_results: allFindings.length,
      inserted,
      duplicates: allFindings.length - inserted,
    },
    findings: allFindings,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ─── GET handler: return recent scan results ───

export async function GET() {
  const { data } = await supabaseAdmin
    .from("recuperacao_judicial")
    .select("*")
    .like("source_name", "Web:%")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    success: true,
    count: data?.length || 0,
    data: data || [],
  });
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
