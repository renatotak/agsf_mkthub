/**
 * Phase 7a — Persona-based executive briefing endpoint.
 *
 *   GET /api/persona-briefing?date=YYYY-MM-DD&persona=ceo|head_comercial|head_credito|marketing
 *
 * Logic:
 *   1. Check persona_briefings for (date, persona) — return if generated_at < 24h
 *   2. Pull executive_briefings row for the date as base data
 *   3. Generate persona-tailored summary via Vertex AI (gemini-2.5-flash)
 *   4. Upsert to persona_briefings
 *   5. Return {summary, highlights, generated_at, persona, cached}
 *
 * Generation is lazy — only triggered on tab click, never at cron time.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { logActivity } from "@/lib/activity-log"

export const revalidate = 0 // always dynamic — responses are stale-checked per request

type Persona = "ceo" | "head_comercial" | "head_credito" | "marketing"

const VALID_PERSONAS: Persona[] = ["ceo", "head_comercial", "head_credito", "marketing"]

const PERSONA_SYSTEM_PROMPTS: Record<Persona, string> = {
  ceo: `Você está operando como assistente do CEO / Managing Partner da AgriSafe.
O CEO pensa em impacto, escalabilidade e posicionamento de longo prazo.
Prioridades semanais: USD/BRL e direção de preços, movimentos de concorrentes (captações, lançamentos, parcerias de TerraMagna, Traive, Agrotools), saúde do funil CRM, e detecção de anomalias (queda de commodity >5%, captação de concorrente, estágio de pipeline parado).
Formato: visão macro estratégica, 2 parágrafos concisos + 3-5 destaques priorizados. O CEO lê em 2 minutos.`,

  head_comercial: `Você assessora o Head Comercial & Parcerias da AgriSafe.
Foco: pipeline de vendas, novos mercados, movimentos de concorrentes, empresas em dificuldade que podem precisar de serviços AgriSafe, alertas de crédito rurais relevantes para abordagem comercial, parceiros potenciais (revendas, indústrias, cooperativas, bancos).
Framework: qualificação de oportunidade (dor real, budget, sponsor, timing, capacidade de entrega).
Destaque: entidades em RJ ou com sinais de estresse financeiro = oportunidades de engajamento comercial.`,

  head_credito: `Você assessora o Head de Crédito & Reestruturação da AgriSafe.
Foco: RJ/falências recentes, inadimplência rural (BCB SGS), normas que afetam crédito rural (PRONAMP, ABC+, BNDES, CMN), entidades em risco, movimentos de Fiagros e securitização.
Padrão obrigatório: toda cifra deve ter fonte. Sinalizar limitações e ressalvas.
Identifique gatilhos de risco: dívidas em atraso, covenants rompidos, queda de preço de commodity que afeta capacidade de pagamento.`,

  marketing: `Você assessora o time de Marketing da AgriSafe.
Foco: oportunidades de conteúdo para LinkedIn/Instagram, eventos agro nos próximos 30 dias, temas em alta no setor que geram engajamento, ângulos únicos para posts baseados nos dados de hoje.
AgriSafe se diferencia por rigor técnico e dados — o conteúdo deve refletir autoridade, não claims vazios.
Sugira 2-3 títulos concretos de posts/artigos baseados nos dados de hoje.`,
}

const PERSONA_OUTPUT_PROMPT = `
Responda em JSON com exatamente esta estrutura:
{
  "summary": "2-3 parágrafos de análise adaptada ao perfil acima, em português (PT-BR). Cite dados específicos do briefing fornecido.",
  "highlights": [
    {"title": "Título do destaque", "body": "1-2 frases de detalhe", "priority": "high|medium|low"}
  ]
}

highlights deve ter 3-5 itens. priority reflete urgência para o perfil em questão.
Não repita informações genéricas — filtre e priorize o que importa especificamente para o perfil.`

async function generatePersonaSummary(
  persona: Persona,
  briefingData: Record<string, unknown>,
): Promise<{ summary: string; highlights: { title: string; body: string; priority: string }[] }> {
  const { summarizeText } = await import("@/lib/gemini")

  const systemPrompt = PERSONA_SYSTEM_PROMPTS[persona] + PERSONA_OUTPUT_PROMPT

  const context = JSON.stringify({
    date: briefingData.briefing_date,
    executive_summary: (briefingData.executive_summary as string | null)?.slice(0, 800) || "",
    market_moves: briefingData.market_moves || [],
    price_ruptures: (briefingData as any).price_ruptures || [],
    top_news: (briefingData.top_news as any[] | null)?.slice(0, 6).map((n: any) => ({
      title: n.title,
      category: n.category,
    })) || [],
    regulatory_updates: (briefingData.regulatory_updates as any[] | null)?.slice(0, 4).map((r: any) => ({
      title: r.title,
      body: r.body,
      impact: r.impact,
    })) || [],
    rj_alerts: briefingData.rj_alerts || [],
    upcoming_events: (briefingData.upcoming_events as any[] | null)?.slice(0, 4) || [],
  })

  const raw = await summarizeText(systemPrompt, context, 400)

  try {
    const parsed = JSON.parse(raw)
    return {
      summary: parsed.summary || raw.slice(0, 1200),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    }
  } catch {
    return {
      summary: raw.slice(0, 1200),
      highlights: [],
    }
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const dateParam = searchParams.get("date")
  const personaParam = searchParams.get("persona") as Persona | null

  if (!personaParam || !VALID_PERSONAS.includes(personaParam)) {
    return NextResponse.json(
      { error: "persona must be one of: ceo, head_comercial, head_credito, marketing" },
      { status: 400 },
    )
  }

  const persona = personaParam
  const supabase = createAdminClient()

  // Resolve date — default to today
  const today = new Date().toISOString().slice(0, 10)
  const date = dateParam || today

  // 1. Check cache — return if found and < 24h old
  const { data: cached } = await supabase
    .from("persona_briefings")
    .select("*")
    .eq("briefing_date", date)
    .eq("persona", persona)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()
    const ageHours = age / (1000 * 60 * 60)
    if (ageHours < 24) {
      return NextResponse.json({ ...cached, cached: true })
    }
  }

  // 2. Pull base executive_briefings row
  const { data: briefing, error: bErr } = await supabase
    .from("executive_briefings")
    .select("*")
    .eq("briefing_date", date)
    .maybeSingle()

  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }

  if (!briefing) {
    return NextResponse.json({ error: "No briefing found for this date", date }, { status: 404 })
  }

  // 3. Generate persona-tailored summary via Vertex AI
  let summary = ""
  let highlights: { title: string; body: string; priority: string }[] = []
  let modelUsed = "gemini-2.5-flash"

  try {
    const result = await generatePersonaSummary(persona, briefing)
    summary = result.summary
    highlights = result.highlights
  } catch (err) {
    // Algorithmic fallback: extract relevant sections without LLM
    const rjAlerts: any[] = briefing.rj_alerts || []
    const moves: any[] = briefing.market_moves || []
    const events: any[] = briefing.upcoming_events || []
    const regs: any[] = briefing.regulatory_updates || []

    if (persona === "head_credito") {
      summary = `Resumo para Head de Crédito — ${date}.\n${rjAlerts.length > 0 ? `${rjAlerts.length} alerta(s) de RJ: ${rjAlerts.map((r: any) => r.company).join(", ")}.` : "Sem novos alertas de RJ."} ${regs.length > 0 ? `${regs.length} atualização(ões) regulatória(s).` : ""}`
    } else if (persona === "marketing") {
      summary = `Resumo para Marketing — ${date}.\n${events.length > 0 ? `${events.length} evento(s) nos próximos 7 dias.` : "Sem eventos próximos."}`
    } else if (persona === "head_comercial") {
      summary = `Resumo para Head Comercial — ${date}.\n${moves.length > 0 ? `Principais movimentos: ${moves.slice(0, 3).map((m: any) => `${m.commodity} ${m.change_pct > 0 ? "+" : ""}${m.change_pct}%`).join(", ")}.` : "Sem movimentos expressivos."}`
    } else {
      summary = (briefing.executive_summary as string | null)?.slice(0, 800) || `Briefing executivo — ${date}.`
    }
    modelUsed = "fallback"
  }

  // 4. Upsert to persona_briefings
  const row = {
    briefing_date: date,
    persona,
    generated_at: new Date().toISOString(),
    summary,
    highlights,
    model_used: modelUsed,
    confidentiality: "agrisafe_published",
  }

  const { error: upsertErr } = await supabase
    .from("persona_briefings")
    .upsert(row, { onConflict: "briefing_date,persona" })

  if (upsertErr) {
    // Non-fatal — return generated data even if cache write failed
    console.error("[persona-briefing] upsert error:", upsertErr.message)
  }

  // 5. Log activity
  await logActivity(supabase, {
    action: "upsert",
    target_table: "persona_briefings",
    target_id: `${date}:${persona}`,
    source: "api/persona-briefing",
    source_kind: "manual",
    summary: `Generated ${persona} briefing for ${date}`,
  }).catch(() => {})

  return NextResponse.json({ ...row, cached: false })
}
