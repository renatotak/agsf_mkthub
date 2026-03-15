import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

// [TODO for Claude] import OpenAI from 'openai'

export async function POST(request: Request) {
  // Optional: protect this route by requiring authentication or a specific API key
  
  try {
    const supabase = createAdminClient()

    // 1. [TODO for Claude] Fetch recent market data from Supabase to feed the LLM prompt
    // 2. [TODO for Claude] Call OpenAI API with a system prompt and the market data
    
    /* Example OpenAI Prompt:
       "You are an expert agro copywriter creating content ideas based on live market data.
        Market context: Soy is up 2%, Selic is 10.5%.
        Generate 3 content ideas for the 'Market Trends' pillar and 2 for 'Credit Risk'.
        Return as JSON matching our ContentIdea database interface."
    */

    // --- MOCK IMPLEMENTATION TO TEST PIPELINE ---
    const mockIdea = {
      id: `ai-idea-${Date.now()}`,
      title_pt: '[AI] Novo Impacto da Soja',
      title_en: '[AI] New Soy Impact',
      type: 'social',
      pillar: 'Market Trends',
      description_pt: 'Post gerado via API simulando a integração com LLM.',
      description_en: 'Post generated via API simulating LLM integration.',
      keywords: ['AI', 'teste', 'soja'],
      trend_score: Math.floor(Math.random() * 20) + 80, // Random 80-99
      suggested_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] // +3 days
    }

    const { data: insertedIdea, error: insertError } = await supabase
      .from('content_ideas')
      .insert([mockIdea])
      .select()

    if (insertError) throw insertError

    return NextResponse.json({
      success: true,
      message: 'AI Content Generated successfully (MOCK)',
      data: insertedIdea
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate AI content' },
      { status: 500 }
    )
  }
}
