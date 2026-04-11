#!/usr/bin/env node
/**
 * AgriSafe Market Hub — MCP Server
 *
 * Exposes the knowledge base, entity directory, market data, and
 * regulatory intelligence to LLM agents via the Model Context Protocol.
 *
 * Transport: stdio (for Claude Code / desktop use)
 *
 * Usage:
 *   node --env-file=.env.local node_modules/.bin/tsx src/mcp/server.ts
 *
 * Claude Code config (~/.claude/claude_code_config.json):
 *   {
 *     "mcpServers": {
 *       "agrisafe": {
 *         "command": "node",
 *         "args": ["--env-file=.env.local", "node_modules/.bin/tsx", "src/mcp/server.ts"],
 *         "cwd": "/path/to/agsf_mkthub"
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// ─── Supabase admin client ──────────────────────────────────────────────────

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ─── Gemini embedding (optional — falls back to keyword search) ─────────────

let geminiClient: any = null

async function getGemini() {
  if (geminiClient) return geminiClient
  const key = process.env.GEMINI_API_KEY
  if (!key || key.includes("your_")) return null
  const { GoogleGenAI } = await import("@google/genai")
  geminiClient = new GoogleGenAI({ apiKey: key })
  return geminiClient
}

async function embed(text: string): Promise<number[] | null> {
  const ai = await getGemini()
  if (!ai) return null
  const res = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text.slice(0, 10000),
    config: { outputDimensionality: 1536 },
  })
  return res.embeddings?.[0]?.values ?? null
}

// ─── Confidentiality helpers ────────────────────────────────────────────────

const TIER_HIERARCHY: Record<string, string[]> = {
  public: ["public"],
  agrisafe_published: ["public", "agrisafe_published"],
  agrisafe_confidential: ["public", "agrisafe_published", "agrisafe_confidential"],
}

function visibleTiers(callerTier: string): string[] {
  return TIER_HIERARCHY[callerTier] || ["public"]
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agrisafe-mkthub",
  version: "1.0.0",
})

// ── Tool: knowledge_search ──────────────────────────────────────────────────

server.tool(
  "knowledge_search",
  "Search the AgriSafe knowledge base using semantic (vector) or keyword search. Returns indexed articles, news, norms, and curated content. Respects confidentiality tiers.",
  {
    query: z.string().describe("Search query in Portuguese or English"),
    limit: z.number().min(1).max(20).default(5).describe("Max results"),
    tier: z.enum(["public", "agrisafe_published", "agrisafe_confidential"]).default("agrisafe_confidential").describe("Caller confidentiality tier"),
    category: z.string().optional().describe("Filter by category (e.g. agro_news, regulatory_norms, published_articles)"),
  },
  async ({ query, limit, tier, category }) => {
    const tiers = visibleTiers(tier)
    const embedding = await embed(query)

    let rows: any[] = []

    if (embedding) {
      const rpcParams: Record<string, unknown> = {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: limit,
        filter_confidentiality: tiers,
      }
      if (category) rpcParams.filter_category = category
      const { data } = await supabase.rpc("match_knowledge_items", rpcParams)
      rows = data || []
    } else {
      // Keyword fallback
      let q = supabase
        .from("knowledge_items")
        .select("id, title, summary, source_table, source_url, tier, confidentiality, indexed_at")
        .in("confidentiality", tiers)
        .or(`title.ilike.%${query}%,summary.ilike.%${query}%,content.ilike.%${query}%`)
        .order("indexed_at", { ascending: false })
        .limit(limit)
      if (category) q = q.eq("source_table", category)
      const { data } = await q
      rows = data || []
    }

    const text = rows.length === 0
      ? "No results found."
      : rows.map((r: any, i: number) =>
          `[${i + 1}] ${r.title || "Untitled"}\n   Source: ${r.source_table || "—"} | Tier: ${r.confidentiality || r.tier || "public"}\n   ${r.summary?.slice(0, 200) || ""}${r.source_url ? `\n   URL: ${r.source_url}` : ""}`
        ).join("\n\n")

    return { content: [{ type: "text" as const, text: `Found ${rows.length} result(s):\n\n${text}` }] }
  },
)

// ── Tool: entity_lookup ─────────────────────────────────────────────────────

server.tool(
  "entity_lookup",
  "Look up a legal entity (company, producer, cooperative) by name or CNPJ/CPF. Returns entity details, roles, and recent mentions.",
  {
    query: z.string().describe("Company name, CNPJ, or CPF to search"),
    limit: z.number().min(1).max(20).default(5),
  },
  async ({ query, limit }) => {
    // Try exact CNPJ match first
    const cnpjClean = query.replace(/\D/g, "")
    let rows: any[] = []

    if (cnpjClean.length >= 11) {
      const { data } = await supabase
        .from("legal_entities")
        .select("entity_uid, tax_id, tax_id_type, legal_name, display_name, primary_cnae, uf, city")
        .eq("tax_id", cnpjClean)
        .limit(1)
      rows = data || []
    }

    if (rows.length === 0) {
      const { data } = await supabase
        .from("legal_entities")
        .select("entity_uid, tax_id, tax_id_type, legal_name, display_name, primary_cnae, uf, city")
        .or(`display_name.ilike.%${query}%,legal_name.ilike.%${query}%`)
        .order("display_name")
        .limit(limit)
      rows = data || []
    }

    if (rows.length === 0) {
      return { content: [{ type: "text" as const, text: "No entities found." }] }
    }

    // Fetch roles for found entities
    const uids = rows.map((r: any) => r.entity_uid)
    const { data: roles } = await supabase
      .from("entity_roles")
      .select("entity_uid, role_type")
      .in("entity_uid", uids)

    const roleMap = new Map<string, string[]>()
    for (const r of roles || []) {
      if (!roleMap.has(r.entity_uid)) roleMap.set(r.entity_uid, [])
      roleMap.get(r.entity_uid)!.push(r.role_type)
    }

    const text = rows.map((r: any) => {
      const entityRoles = roleMap.get(r.entity_uid) || []
      return `${r.display_name || r.legal_name}\n  CNPJ/CPF: ${r.tax_id} | UF: ${r.uf || "—"} | City: ${r.city || "—"}\n  CNAE: ${r.primary_cnae || "—"} | Roles: ${entityRoles.join(", ") || "—"}`
    }).join("\n\n")

    return { content: [{ type: "text" as const, text: `Found ${rows.length} entity(ies):\n\n${text}` }] }
  },
)

// ── Tool: commodity_prices ──────────────────────────────────────────────────

server.tool(
  "commodity_prices",
  "Get current and historical commodity prices from BCB SGS and macro statistics from FAOSTAT, USDA, CONAB, and MDIC.",
  {
    commodity: z.string().optional().describe("Commodity slug (soybean, corn, coffee, wheat, cotton, cattle_meat)"),
    source: z.string().optional().describe("Source filter (faostat, usda_psd, conab, mdic_comexstat, worldbank_pinksheet)"),
    limit: z.number().min(1).max(50).default(10),
  },
  async ({ commodity, source, limit }) => {
    // Current prices from commodity_prices
    let priceText = ""
    if (!source || source === "bcb") {
      let q = supabase.from("commodity_prices").select("*").order("updated_at", { ascending: false }).limit(10)
      if (commodity) q = q.ilike("commodity", `%${commodity}%`)
      const { data } = await q
      if (data && data.length > 0) {
        priceText = "── Current Prices (BCB SGS) ──\n" +
          data.map((r: any) => `${r.commodity}: R$ ${r.price} (${r.unit}) — updated ${r.updated_at?.slice(0, 10)}`).join("\n")
      }
    }

    // Macro statistics
    let macroText = ""
    let q = supabase
      .from("macro_statistics")
      .select("source_id, commodity, region, indicator, value, unit, period")
      .order("reference_date", { ascending: false })
      .limit(limit)
    if (commodity) q = q.eq("commodity", commodity)
    if (source) q = q.eq("source_id", source)
    const { data: macro } = await q

    if (macro && macro.length > 0) {
      macroText = "\n── Macro Statistics ──\n" +
        macro.map((r: any) => `[${r.source_id}] ${r.commodity} | ${r.region} | ${r.indicator}: ${r.value} ${r.unit} (${r.period})`).join("\n")
    }

    const text = (priceText + macroText) || "No price data found."
    return { content: [{ type: "text" as const, text }] }
  },
)

// ── Tool: regulatory_norms ──────────────────────────────────────────────────

server.tool(
  "regulatory_norms",
  "Search regulatory norms (CMN, BCB, CVM, MAPA, CNJ) that impact agribusiness. Can filter by body, impact level, or affected areas.",
  {
    query: z.string().optional().describe("Search text in title/summary"),
    body: z.string().optional().describe("Regulatory body: CMN, BCB, CVM, MAPA, CNJ"),
    impact: z.enum(["high", "medium", "low"]).optional(),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({ query, body, impact, limit }) => {
    let q = supabase
      .from("regulatory_norms")
      .select("id, title, summary, body, norm_type, norm_number, impact_level, affected_areas, affected_cnaes, published_at, source_url")
      .order("published_at", { ascending: false })
      .limit(limit)

    if (body) q = q.eq("body", body)
    if (impact) q = q.eq("impact_level", impact)
    if (query) q = q.or(`title.ilike.%${query}%,summary.ilike.%${query}%`)

    const { data } = await q
    if (!data || data.length === 0) {
      return { content: [{ type: "text" as const, text: "No norms found." }] }
    }

    const text = data.map((n: any) =>
      `[${n.body}] ${n.norm_type} ${n.norm_number || ""} — ${n.impact_level} impact\n  ${n.title}\n  Areas: ${(n.affected_areas || []).join(", ")}\n  Published: ${n.published_at?.slice(0, 10)}${n.source_url ? `\n  URL: ${n.source_url}` : ""}`
    ).join("\n\n")

    return { content: [{ type: "text" as const, text: `Found ${data.length} norm(s):\n\n${text}` }] }
  },
)

// ── Tool: agro_news ─────────────────────────────────────────────────────────

server.tool(
  "agro_news",
  "Search recent agro news articles indexed from 5 RSS feeds + Reading Room extension.",
  {
    query: z.string().optional().describe("Search text in title/summary"),
    limit: z.number().min(1).max(30).default(10),
  },
  async ({ query, limit }) => {
    let q = supabase
      .from("agro_news")
      .select("id, title, summary, source_name, source_url, published_at")
      .order("published_at", { ascending: false })
      .limit(limit)

    if (query) q = q.or(`title.ilike.%${query}%,summary.ilike.%${query}%`)

    const { data } = await q
    if (!data || data.length === 0) {
      return { content: [{ type: "text" as const, text: "No news found." }] }
    }

    const text = data.map((n: any) =>
      `${n.title}\n  Source: ${n.source_name || "—"} | ${n.published_at?.slice(0, 10)}\n  ${n.summary?.slice(0, 150) || ""}${n.source_url ? `\n  URL: ${n.source_url}` : ""}`
    ).join("\n\n")

    return { content: [{ type: "text" as const, text: `Found ${data.length} article(s):\n\n${text}` }] }
  },
)

// ── Tool: database_stats ────────────────────────────────────────────────────

server.tool(
  "database_stats",
  "Get record counts and health status for key AgriSafe Market Hub tables. Useful for understanding what data is available.",
  {},
  async () => {
    const tables = [
      "legal_entities", "entity_roles", "entity_mentions",
      "agro_news", "events", "regulatory_norms", "recuperacao_judicial",
      "commodity_prices", "macro_statistics",
      "knowledge_items", "news_knowledge",
      "key_persons", "meetings", "leads",
      "data_sources", "activity_log",
    ]

    const counts = await Promise.all(
      tables.map(async (t) => {
        const { count } = await supabase.from(t).select("*", { count: "exact", head: true })
        return `${t}: ${count ?? "??"}`
      }),
    )

    return { content: [{ type: "text" as const, text: `AgriSafe Market Hub — Database Stats\n\n${counts.join("\n")}` }] }
  },
)

// ── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("MCP server error:", err)
  process.exit(1)
})
