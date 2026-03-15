import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic' // Ensure the cron job is never cached

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret for security
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // 2. [TODO for Claude] Implement HTML Scraping via Cheerio/Puppeteer to get live CEPEA data
    // 3. [TODO for Claude] Implement Fetch requests to BCB SGS API to get live macro data

    // --- MOCK IMPLEMENTATION TO TEST PIPELINE ---
    // Update the 'last_update' of a specific commodity to prove the admin client can bypass RLS
    const { data: updatedSoy, error: updateError } = await supabase
      .from('commodity_prices')
      .update({
        change_24h: (Math.random() * 4 - 2).toFixed(2), // Random change between -2 and +2
        last_update: new Date().toISOString().split('T')[0]
      })
      .eq('id', 'soy')
      .select()

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      message: 'Market data synchronized successfully (MOCK DATA)',
      timestamp: new Date().toISOString(),
      mockDataInjected: updatedSoy
    })
  } catch (error: any) {
    console.error('Error syncing market data:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync data' },
      { status: 500 }
    )
  }
}
