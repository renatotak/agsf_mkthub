import { env } from 'process'
import { createAdminClient } from '@/utils/supabase/admin'
import { generateEmbedding, summarizeText, isGeminiConfigured } from '@/lib/gemini'
import { resolveCallerTier, visibleTiers } from '@/lib/confidentiality'

export async function POST(req: Request) {
  try {
    if (!isGeminiConfigured()) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Gemini API not configured'
      }), { status: 400 })
    }

    const { prompt, history = [], lang = 'pt', module, entityContext } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Prompt is required'
      }), { status: 400 })
    }

    const supabase = createAdminClient()

    // Phase 24G — resolve the caller's confidentiality tier so the
    // semantic search RPC only surfaces rows the caller is allowed to
    // see. Defaults to `public` for unauthenticated requests; an
    // authenticated AgriSafe team session unlocks the full
    // public + agrisafe_published + agrisafe_confidential set.
    const callerTier = await resolveCallerTier(supabase, req)
    const visible = visibleTiers(callerTier)

    // 1. Get embedding for the prompt
    const queryEmbedding = await generateEmbedding(prompt)

    // 2. Search knowledge base — tier-filtered via the new
    //    `filter_confidentiality` arg added in migration 040.
    const { data: contextItems, error: searchError } = await supabase.rpc('match_knowledge_items', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
      filter_confidentiality: visible,
    })

    if (searchError) throw searchError

    // 3. Construct context string
    const context = (contextItems || [])
      .map((it: any) => `[TIER ${it.tier}] ${it.title}: ${it.content || it.summary}`)
      .join('\n\n')

    // 4. Fetch the Oracle settings (prompt & guardrails) from the database
    const { data: lens } = await supabase
        .from('analysis_lenses')
        .select('*')
        .eq('id', 'oracle_chat')
        .maybeSingle()

    // 5. App contextual injections (Events, etc)
    let appRuntimeContext = ''
    if (prompt.toLowerCase().includes('evento') || module === 'events') {
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('name, date, location, description_pt, type')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(10)
      
      if (upcomingEvents && upcomingEvents.length > 0) {
        appRuntimeContext += `\n[CONTEXTO DA APP: PRÓXIMOS EVENTOS AGRO]\n` +
          upcomingEvents.map((e: any) => `- ${e.name} em ${new Date(e.date).toLocaleDateString('pt-BR')} (${e.location || 'Local a definir'}): ${e.description_pt || e.type}`).join('\n')
      }
    }

    const basePrompt = lens?.system_prompt || `Você é o "Assistente AIA", um assistente de inteligência de mercado sênior especializado no agronegócio brasileiro pela AgriSafe.
Sua missão é fornecer respostas precisas, consultivas e baseadas em evidências usando o contexto fornecido.

DIRETRIZES:
- Se a informação estiver no contexto, use-a e cite a fonte (ex: "Segundo dados da CONAB...").
- Se a informação NÃO estiver no contexto, use seu conhecimento geral mas sinalize claramente o que é análise externa.
- Mantenha o tom profissional, formal e objetivo da AgriSafe.
- Idioma da resposta: Português Brasileiro.
- Formate a resposta usando Markdown (bold, lists, etc). Crie parágrafos concisos. Jamais retorne JSON.`

    const systemPrompt = `${basePrompt}

CONTEXTO DA BASE DE CONHECIMENTO:
${context || 'Nenhuma informação específica encontrada na base de conhecimento para esta consulta.'}
${appRuntimeContext}

HISTÓRICO DA CONVERSA:
${history.map((h: any) => `${h.role === 'user' ? 'Usuário' : 'Oráculo'}: ${h.content}`).join('\n')}
${module ? `\nMÓDULO ATIVO: O usuário está no módulo "${module}". Priorize informações relevantes a esse contexto.` : ""}
${entityContext?.entityName ? `\nENTIDADE EM FOCO: ${entityContext.entityName}${entityContext.cnpj ? ` (CNPJ: ${entityContext.cnpj})` : ''}. Quando possível, relacione a resposta a esta entidade.` : ""}
`

    const answer = await summarizeText(systemPrompt, prompt, lens?.max_tokens || 1500, false)

    // Log the prompt for the weekly oracle-insights clustering job.
    // Non-blocking — if oracle_chat_logs doesn't exist yet, silently skip.
    void supabase
      .from('oracle_chat_logs')
      .insert({
        prompt,
        context_count: (contextItems || []).length,
        module: module || null,
        lang,
      })
      .then(() => {})

    return new Response(JSON.stringify({
      success: true,
      answer,
      caller_tier: callerTier,
      context: (contextItems || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        tier: it.tier,
        confidentiality: it.confidentiality,
        source_url: it.source_url
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Chat API Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      message: error.message 
    }), { status: 500 })
  }
}
