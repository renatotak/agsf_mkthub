// Phase 22 follow-up: Backfill agro_news rows into knowledge_items.
//
// Why: knowledge_items had a missing UNIQUE (source_table, source_id)
// constraint until migration 033 landed. Both the sync-agro-news cron
// and the reading-room/ingest route were silently failing the
// `.upsert(..., { onConflict: 'source_table,source_id' })` call. As a
// result, ~99 of 126 agro_news rows existed in agro_news but not in
// knowledge_items. This script walks the unindexed rows, generates
// Gemini embeddings in batches of 20, and inserts them.
//
// Safe to re-run: ON CONFLICT (source_table, source_id) DO NOTHING means
// already-indexed rows are skipped. The script also pre-filters via a
// SELECT before each batch to minimize wasted Gemini calls.
//
// Usage:
//   node src/scripts/backfill-knowledge-items.js              # do everything
//   node src/scripts/backfill-knowledge-items.js --dry-run    # just count + show plan
//   node src/scripts/backfill-knowledge-items.js --limit 5    # process first 5 only

const fs = require('fs');
const path = require('path');

// ─── Args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : null;

// ─── Env loading (same pattern as verify-migrations script) ───
const envPath = path.join(__dirname, '..', '..', '.env.local');
const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
lines.forEach((l) => {
  if (l.startsWith('#') || !l.includes('=')) return;
  const i = l.indexOf('=');
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!GEMINI_KEY || GEMINI_KEY.includes('your_')) {
  console.error('Missing or placeholder GEMINI_API_KEY in .env.local');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────

async function generateEmbeddingBatch(texts) {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts.map((t) => t.slice(0, 10000)),
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return response.embeddings.map((e) => e.values);
}

async function fetchUnindexedNews(maxRows) {
  // Fetch all agro_news rows + all knowledge_items.source_id where
  // source_table='agro_news', then compute the diff client-side.
  // Two small queries beat a complex JOIN here.
  const { data: allNews, error: e1 } = await sb
    .from('agro_news')
    .select('id, title, summary, category, source_url, tags, published_at, confidentiality')
    .order('published_at', { ascending: false });
  if (e1) throw new Error('agro_news fetch failed: ' + e1.message);

  const { data: indexed, error: e2 } = await sb
    .from('knowledge_items')
    .select('source_id')
    .eq('source_table', 'agro_news');
  if (e2) throw new Error('knowledge_items fetch failed: ' + e2.message);

  const indexedIds = new Set((indexed || []).map((r) => r.source_id));
  const unindexed = (allNews || []).filter((n) => !indexedIds.has(n.id));
  return maxRows ? unindexed.slice(0, maxRows) : unindexed;
}

function buildKnowledgeRow(news, embedding) {
  return {
    tier: 2,
    title: news.title,
    summary: news.summary || null,
    source_type: 'news',
    source_table: 'agro_news',
    source_id: news.id,
    source_url: news.source_url,
    category: news.category,
    tags: news.tags || [],
    published_at: news.published_at,
    embedding: `[${embedding.join(',')}]`,
    confidentiality: news.confidentiality || 'public',
  };
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('Backfilling agro_news → knowledge_items');
  console.log('  dry-run:', dryRun);
  if (limit) console.log('  limit:  ', limit);

  const unindexed = await fetchUnindexedNews(limit);
  console.log('  unindexed rows:', unindexed.length);

  if (unindexed.length === 0) {
    console.log('Nothing to backfill — all agro_news already in knowledge_items.');
    return;
  }

  if (dryRun) {
    console.log('\nFirst 5 candidates (dry-run):');
    for (const n of unindexed.slice(0, 5)) {
      console.log('  ', n.id.padEnd(15), '|', (n.category || '-').padEnd(12), '|', (n.title || '').slice(0, 60));
    }
    console.log('\nDry-run complete. No writes made.');
    return;
  }

  const totalBatches = Math.ceil(unindexed.length / BATCH_SIZE);
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < unindexed.length; i += BATCH_SIZE) {
    const batch = unindexed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} rows)…`);

    // 1. Embed
    let embeddings;
    try {
      const texts = batch.map((n) => `${n.title} ${n.summary || ''}`);
      embeddings = await generateEmbeddingBatch(texts);
    } catch (err) {
      console.error('  ✗ Gemini batch failed:', err.message);
      failed += batch.length;
      continue;
    }

    // 2. Build rows + upsert
    const rows = batch.map((n, idx) => buildKnowledgeRow(n, embeddings[idx]));
    const { error: upErr, count } = await sb
      .from('knowledge_items')
      .upsert(rows, { onConflict: 'source_table,source_id', count: 'exact' });

    if (upErr) {
      console.error('  ✗ Upsert failed:', upErr.message);
      failed += batch.length;
      continue;
    }

    inserted += rows.length;
    console.log('  ✓ ' + rows.length + ' embedded + upserted');
  }

  console.log('\n────────────────────────');
  console.log('Inserted:', inserted, '/ Failed:', failed, '/ Total processed:', inserted + failed);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
