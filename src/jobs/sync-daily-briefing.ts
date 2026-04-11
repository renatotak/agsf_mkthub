/**
 * Phase 27 — sync-daily-briefing job module.
 *
 * Aggregates last 24h of news, prices, regulations, RJ filings, and
 * upcoming events into a structured executive briefing. Uses Gemini
 * for prose generation only — all data aggregation is algorithmic.
 *
 * Output: one row per day in executive_briefings, upserted by briefing_date.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { JobResult } from "@/jobs/types"
import { logActivity } from "@/lib/activity-log"

interface BriefingData {
  topNews: { title: string; summary: string; category: string; source: string; url?: string }[]
  newsCount: number
  marketMoves: { commodity: string; price: number; change_pct: number; unit: string }[]
  newRegulations: { title: string; body: string; impact: string; areas: string[] }[]
  newRJ: { company: string; cnpj: string }[]
  upcomingEvents: { name: string; date: string; location: string }[]
  sourceHealth: { total: number; healthy: number; error: number }
}

async function gatherData(supabase: SupabaseClient): Promise<BriefingData> {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  // News — last 24h
  const { data: news, count: newsCount } = await supabase
    .from("agro_news")
    .select("title, summary, category, source_name, source_url", { count: "exact" })
    .gte("published_at", yesterday)
    .order("published_at", { ascending: false })
    .limit(10)

  // Prices — latest per commodity with change
  const { data: prices } = await supabase
    .from("commodity_prices")
    .select("commodity, price, change_percent, unit")
    .order("updated_at", { ascending: false })
    .limit(10)

  // Sort by absolute change to find biggest movers
  const marketMoves = (prices || [])
    .filter((p: any) => p.change_percent != null)
    .sort((a: any, b: any) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
    .slice(0, 5)
    .map((p: any) => ({
      commodity: p.commodity,
      price: p.price,
      change_pct: p.change_percent,
      unit: p.unit,
    }))

  // Regulatory — last 24h
  const { data: regs } = await supabase
    .from("regulatory_norms")
    .select("title, body, impact_level, affected_areas")
    .gte("published_at", yesterday)
    .order("published_at", { ascending: false })
    .limit(5)

  // RJ — last 24h
  const { data: rj } = await supabase
    .from("recuperacao_judicial")
    .select("company_name, entity_cnpj")
    .gte("created_at", yesterday)
    .limit(5)

  // Events — next 7 days
  const { data: events } = await supabase
    .from("events")
    .select("name, start_date, location")
    .gte("start_date", today)
    .lte("start_date", nextWeek)
    .order("start_date")
    .limit(5)

  // Source health
  const { data: sources } = await supabase
    .from("data_sources")
    .select("url_status")
    .eq("active", true)

  const total = sources?.length || 0
  const healthy = sources?.filter((s: any) => s.url_status === "active").length || 0
  const error = sources?.filter((s: any) => s.url_status === "error").length || 0

  return {
    topNews: (news || []).map((n: any) => ({
      title: n.title,
      summary: n.summary?.slice(0, 200) || "",
      category: n.category || "",
      source: n.source_name || "",
      url: n.source_url,
    })),
    newsCount: newsCount ?? 0,
    marketMoves,
    newRegulations: (regs || []).map((r: any) => ({
      title: r.title,
      body: r.body,
      impact: r.impact_level,
      areas: r.affected_areas || [],
    })),
    newRJ: (rj || []).map((r: any) => ({
      company: r.company_name,
      cnpj: r.entity_cnpj || "",
    })),
    upcomingEvents: (events || []).map((e: any) => ({
      name: e.name,
      date: e.start_date?.slice(0, 10) || "",
      location: e.location || "",
    })),
    sourceHealth: { total, healthy, error },
  }
}

async function generateSummary(data: BriefingData): Promise<string> {
  try {
    const { summarizeText } = await import("@/lib/gemini")

    const systemPrompt = `You are a senior agribusiness analyst at AgriSafe, writing a daily executive briefing for the CEO. Write in Portuguese (PT-BR). Be concise and actionable.

Output a JSON object with exactly this structure:
{
  "executive_summary": "2-3 paragraph overview of today's highlights, risks, and opportunities. Reference specific data points.",
  "key_takeaways": ["3-5 bullet points of the most important things the CEO needs to know today"]
}

Focus on what changed, what requires attention, and strategic implications. If there are no significant changes in a category, say so briefly rather than padding.`

    const context = JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      news_count: data.newsCount,
      top_headlines: data.topNews.slice(0, 5).map(n => `[${n.category}] ${n.title}`),
      market_moves: data.marketMoves.map(m => `${m.commodity}: ${m.change_pct > 0 ? "+" : ""}${m.change_pct}%`),
      new_regulations: data.newRegulations.map(r => `[${r.body}/${r.impact}] ${r.title}`),
      new_rj_filings: data.newRJ.map(r => r.company),
      upcoming_events: data.upcomingEvents.map(e => `${e.name} (${e.date}, ${e.location})`),
      source_health: data.sourceHealth,
    })

    const raw = await summarizeText(systemPrompt, context, 1500)
    const parsed = JSON.parse(raw)
    return parsed.executive_summary || raw
  } catch {
    // Fallback: algorithmic summary without LLM
    const lines: string[] = []
    lines.push(`Briefing do dia ${new Date().toLocaleDateString("pt-BR")}.`)
    if (data.newsCount > 0) lines.push(`${data.newsCount} notícias indexadas nas últimas 24h.`)
    if (data.marketMoves.length > 0) {
      const top = data.marketMoves[0]
      lines.push(`Maior movimentação: ${top.commodity} (${top.change_pct > 0 ? "+" : ""}${top.change_pct}%).`)
    }
    if (data.newRegulations.length > 0) lines.push(`${data.newRegulations.length} nova(s) norma(s) regulatória(s).`)
    if (data.newRJ.length > 0) lines.push(`${data.newRJ.length} novo(s) processo(s) de recuperação judicial.`)
    if (data.upcomingEvents.length > 0) lines.push(`${data.upcomingEvents.length} evento(s) nos próximos 7 dias.`)
    return lines.join(" ")
  }
}

export async function runSyncDailyBriefing(supabase: SupabaseClient): Promise<JobResult> {
  const startIso = new Date().toISOString()
  const start = Date.now()
  const errors: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  try {
    const data = await gatherData(supabase)
    const summary = await generateSummary(data)

    const row = {
      briefing_date: today,
      executive_summary: summary,
      market_moves: data.marketMoves,
      top_news: data.topNews,
      regulatory_updates: data.newRegulations,
      rj_alerts: data.newRJ,
      upcoming_events: data.upcomingEvents,
      source_health: data.sourceHealth,
      data_window_hours: 24,
      model_used: "gemini-2.5-flash",
    }

    const { error } = await supabase
      .from("executive_briefings")
      .upsert(row, { onConflict: "briefing_date" })

    if (error) {
      errors.push(error.message)
    }

    await logActivity(supabase, {
      action: "upsert",
      target_table: "executive_briefings",
      target_id: today,
      source: "sync-daily-briefing",
      source_kind: "cron",
      summary: `Briefing for ${today}: ${data.newsCount} news, ${data.marketMoves.length} movers, ${data.newRegulations.length} norms`,
    }).catch(() => {})

    const duration = Date.now() - start
    return {
      ok: errors.length === 0,
      status: errors.length > 0 ? "error" : "success",
      startedAt: startIso,
      finishedAt: new Date().toISOString(),
      recordsFetched: 1,
      recordsUpdated: errors.length > 0 ? 0 : 1,
      durationMs: duration,
      errors,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    const duration = Date.now() - start
    return { ok: false, status: "error", startedAt: startIso, finishedAt: new Date().toISOString(), recordsFetched: 0, recordsUpdated: 0, durationMs: duration, errors }
  }
}
