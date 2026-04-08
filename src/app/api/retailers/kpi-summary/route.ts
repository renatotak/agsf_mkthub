import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 1800; // 30 min — KPI strip is read-mostly

/**
 * GET /api/retailers/kpi-summary
 *
 * Aggregates the four CRM-style indicators surfaced at the top of the
 * Diretório de Canais (Phase 24A):
 *
 *   1. Total channels — count + breakdown by `grupo_acesso`
 *   2. Cities with channels — distinct municipality count + top 5 by share
 *   3. Channels in Recuperação Judicial — count + total exposed debt
 *   4. Channels mentioned in news — distinct entity count + recent preview
 *
 * All four go through the existing 5-entity model: retailers carry
 * `entity_uid` (Phase 17C, mig 024), `entity_mentions` rows are written by
 * the algorithmic matcher, and `v_retailers_in_rj` is the deterministic RJ
 * cross-reference view (mig 023). No LLM in this route — guardrail #1.
 *
 * Designed to be cheap: at most 5 small queries, all indexed.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // ── 1. Total channels + grupo_acesso breakdown ──────────────
    const [{ count: total }, { data: byGroupRows }] = await Promise.all([
      supabase.from('retailers').select('*', { count: 'exact', head: true }),
      supabase.from('retailers').select('grupo_acesso').not('grupo_acesso', 'is', null),
    ]);

    const byGroupCount: Record<string, number> = {};
    for (const r of byGroupRows || []) {
      const g = (r as any).grupo_acesso as string;
      byGroupCount[g] = (byGroupCount[g] || 0) + 1;
    }

    // ── 2. Cities (municípios) ──────────────────────────────────
    // Count distinct (municipio, uf) pairs across retailer_locations and
    // surface the top 5 by # of locations. We pull (cnpj_raiz, municipio,
    // uf) so we can also collapse to "channels per city" rather than
    // "branches per city" — a single retailer with many branches in the
    // same city should count once.
    const { data: locRows } = await supabase
      .from('retailer_locations')
      .select('cnpj_raiz, municipio, uf')
      .not('municipio', 'is', null)
      .not('uf', 'is', null)
      .limit(50000); // hard cap; we only have ~30k locations

    // Channels per city (dedup on cnpj_raiz so each retailer counts once
    // per city, not once per branch).
    const cityChannelMap = new Map<string, { municipio: string; uf: string; channels: Set<string> }>();
    for (const row of locRows || []) {
      const r = row as any;
      const key = `${r.municipio}|${r.uf}`;
      if (!cityChannelMap.has(key)) {
        cityChannelMap.set(key, { municipio: r.municipio, uf: r.uf, channels: new Set() });
      }
      cityChannelMap.get(key)!.channels.add(r.cnpj_raiz);
    }

    const cityCount = cityChannelMap.size;
    const topCities = Array.from(cityChannelMap.values())
      .map((c) => ({ municipio: c.municipio, uf: c.uf, count: c.channels.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ── 3. Recuperação Judicial cross-reference ─────────────────
    // v_retailers_in_rj is the deterministic JOIN of retailers ×
    // recuperacao_judicial through legal_entities (mig 023). Returns
    // one row per (retailer, RJ filing) pair so we count distinct
    // entity_uid for the channel count.
    const { data: rjRows } = await supabase
      .from('v_retailers_in_rj')
      .select('entity_uid, rj_debt_value');

    const rjEntities = new Set<string>();
    let inRjExposure = 0;
    for (const r of rjRows || []) {
      const row = r as any;
      if (row.entity_uid) rjEntities.add(row.entity_uid);
      if (typeof row.rj_debt_value === 'number') inRjExposure += row.rj_debt_value;
    }
    const inRjCount = rjEntities.size;

    // ── 4. Channels mentioned in news ───────────────────────────
    // Phase 17E pattern: entity_mentions where source_table='agro_news'
    // joined to retailers via entity_uid. We can't directly join to
    // retailers in PostgREST (no FK chain), so we fetch the universe of
    // retailer entity_uids first, then filter mentions by that set.
    const { data: retailerEntityRows } = await supabase
      .from('retailers')
      .select('entity_uid')
      .not('entity_uid', 'is', null);
    const retailerEntityUids = new Set(
      (retailerEntityRows || []).map((r: any) => r.entity_uid as string)
    );

    let mentionedInNewsCount = 0;
    let recentMentionsPreview: Array<{
      entity_uid: string;
      news_id: string;
      news_title: string | null;
      source_name: string | null;
      published_at: string | null;
    }> = [];

    if (retailerEntityUids.size > 0) {
      // Pull the most recent agro_news mentions, then filter to retailers.
      // Limit at 500 mentions — generous since the dataset is small and
      // we only need ~20 for the preview.
      const { data: mentionRows } = await supabase
        .from('entity_mentions')
        .select('entity_uid, source_id')
        .eq('source_table', 'agro_news')
        .limit(2000);

      const retailerMentions = (mentionRows || []).filter((m: any) =>
        retailerEntityUids.has(m.entity_uid)
      );
      mentionedInNewsCount = new Set(retailerMentions.map((m: any) => m.entity_uid)).size;

      // For the preview, take the first ~50 unique news IDs and look them
      // up in agro_news ordered by published_at desc.
      const previewNewsIds = Array.from(
        new Set(retailerMentions.map((m: any) => m.source_id as string))
      ).slice(0, 50);

      if (previewNewsIds.length > 0) {
        const { data: newsRows } = await supabase
          .from('agro_news')
          .select('id, title, source_name, published_at')
          .in('id', previewNewsIds)
          .order('published_at', { ascending: false })
          .limit(20);

        // Re-attach entity_uid + retailer name. Need a quick lookup of
        // entity_uid → retailer name. We pull a small set of retailers
        // for the entity_uids that appear in our preview.
        const previewEntityUids = Array.from(
          new Set(
            retailerMentions
              .filter((m: any) => previewNewsIds.includes(m.source_id))
              .map((m: any) => m.entity_uid as string)
          )
        );
        const { data: retailerNames } = await supabase
          .from('retailers')
          .select('entity_uid, nome_fantasia, razao_social')
          .in('entity_uid', previewEntityUids);
        const nameByEntity = new Map<string, string>();
        for (const r of retailerNames || []) {
          const row = r as any;
          nameByEntity.set(row.entity_uid, row.nome_fantasia || row.razao_social || '');
        }

        // Walk newsRows in published_at order, attach the first matching
        // retailer for each news_id. (One news article may mention
        // multiple retailers; for the compact preview we surface one.)
        const newsToEntity = new Map<string, string>();
        for (const m of retailerMentions) {
          const mm = m as any;
          if (!newsToEntity.has(mm.source_id)) newsToEntity.set(mm.source_id, mm.entity_uid);
        }

        recentMentionsPreview = (newsRows || []).map((n: any) => {
          const eUid = newsToEntity.get(n.id) || '';
          return {
            entity_uid: eUid,
            news_id: n.id,
            news_title: n.title,
            source_name: n.source_name,
            published_at: n.published_at,
            retailer_name: nameByEntity.get(eUid) || null,
          } as any;
        });
      }
    }

    return NextResponse.json({
      total: total || 0,
      byGroupCount,
      cityCount,
      topCities,
      inRjCount,
      inRjExposure,
      mentionedInNewsCount,
      recentMentionsPreview,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
