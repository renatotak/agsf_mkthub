/**
 * Phase 30 — sync-llm-news-scout job module.
 *
 * Weekly Vertex AI-powered news discovery that finds agribusiness articles
 * from sources NOT covered by the existing RSS feeds (Canal Rural, Globo
 * Rural, Embrapa Notícias, CNA, AgroLink).
 *
 * Algorithm (guardrail #1 — algorithms first, LLM only for prose):
 *   1. Cheerio-scrape each portal's article listing page
 *   2. Regex-classify category (no LLM)
 *   3. Batch up to 10 articles → single Gemini call for PT-BR summaries
 *   4. Upsert agro_news, run norm extractor + entity matcher inline
 *
 * Cost controls:
 *   - Max 50 new articles per run (→ at most 5 Gemini batch calls)
 *   - Source failures are non-fatal: log and continue
 *   - Gemini failures fall back to first sentence of body text
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import * as cheerio from 'cheerio'
import { logSync } from '@/lib/sync-logger'
import { logActivity, logActivityBatch } from '@/lib/activity-log'
import { isGeminiConfigured, summarizeText } from '@/lib/gemini'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import { extractNormsFromNews } from '@/lib/extract-norms-from-news'
import type { JobResult } from '@/jobs/types'

// ─── Source definitions ──────────────────────────────────────────────────────

interface ScoutSource {
  name: string
  listUrl: string
  /** CSS selectors tried in order; first one that yields links wins */
  linkSelectors: string[]
  /** Base URL for resolving relative hrefs */
  baseUrl: string
}

const SOURCES: ScoutSource[] = [
  {
    name: 'Canal Rural',
    listUrl: 'https://www.canalrural.com.br/noticias/',
    linkSelectors: ['article a', '.noticia a', 'h2 a', '.card-title a', '.entry-title a'],
    baseUrl: 'https://www.canalrural.com.br',
  },
  {
    name: 'Globo Rural',
    listUrl: 'https://revistagloborural.globo.com/',
    linkSelectors: ['article a', '.feed-post-link', 'h2 a', '.post-title a', '.card a'],
    baseUrl: 'https://revistagloborural.globo.com',
  },
  {
    name: 'Embrapa Notícias',
    listUrl: 'https://www.embrapa.br/busca-de-noticias',
    linkSelectors: ['.resultado-busca a', '.noticia a', 'h3 a', 'h2 a', '.titulo a'],
    baseUrl: 'https://www.embrapa.br',
  },
  {
    name: 'CNA Notícias',
    listUrl: 'https://www.cnabrasil.org.br/noticias',
    linkSelectors: ['.card-noticia a', 'article a', 'h2 a', 'h3 a', '.card-title a'],
    baseUrl: 'https://www.cnabrasil.org.br',
  },
  {
    name: 'AgroLink',
    listUrl: 'https://www.agrolink.com.br/noticias/',
    linkSelectors: ['.noticia-title a', 'article a', 'h2 a', '.lista-noticias a', '.card a'],
    baseUrl: 'https://www.agrolink.com.br',
  },
]

const USER_AGENT = 'AgriSafe-MarketHub/1.0 (News Scout)'
const FETCH_TIMEOUT_MS = 15_000
const MAX_ARTICLES_PER_RUN = 50
const GEMINI_BATCH_SIZE = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stable 32-char hex id derived from URL */
function makeId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32)
}

/** Algorithm-first category classifier (guardrail #1 — no LLM) */
function classifyCategory(title: string, body: string): string {
  const text = `${title} ${body}`.toLowerCase()
  if (/portaria|instrução|decreto|regulamentação|legislação|norma|provimento|resolução/.test(text)) {
    return 'regulatorio'
  }
  if (/preço|soja|milho|commodity|exportação|importação|cotação|boi|arroba|grão|safra/.test(text)) {
    return 'mercado'
  }
  if (/tecnologia|startup|inovação|digital|drone|precision|satellite|sensoriamento|inteligência artificial/.test(text)) {
    return 'tecnologia'
  }
  if (/sustent|ambiental|carbono|organic|rastreab|esg|desmat|bioma/.test(text)) {
    return 'sustentabilidade'
  }
  return 'outros'
}

/** Fetch with timeout and User-Agent; returns null on failure */
async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Extract the <body> text of an article page, stripping nav/footer/sidebar */
function extractArticleBody($: cheerio.CheerioAPI): string {
  // Remove structural noise
  $('nav, header, footer, aside, script, style, [class*="sidebar"], [class*="menu"], [class*="nav"], [id*="sidebar"], [id*="menu"], [id*="nav"]').remove()

  // Try canonical content containers first
  const selectors = [
    'article',
    '[class*="article-body"]',
    '[class*="post-content"]',
    '[class*="entry-content"]',
    '[class*="materia"]',
    '[class*="conteudo"]',
    '.content',
    'main',
  ]

  for (const sel of selectors) {
    const el = $(sel).first()
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, ' ').trim()
      if (text.length > 100) return text
    }
  }

  // Fallback: body text
  return $('body').text().replace(/\s+/g, ' ').trim()
}

/** Parse published_at from og:article:published_time or similar meta tags */
function extractPublishedAt($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[name="DC.date"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
    $('[class*="date"]').first().text().trim(),
  ]
  for (const c of candidates) {
    if (!c) continue
    const d = new Date(c)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

/** Resolve an href to an absolute URL */
function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href) return null
  try {
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return `https:${href}`
    return new URL(href, baseUrl).href
  } catch {
    return null
  }
}

/** Extract article links from a listing page using the source's selector list */
function extractLinks($: cheerio.CheerioAPI, source: ScoutSource): string[] {
  const links = new Set<string>()
  for (const sel of source.linkSelectors) {
    $(sel).each((_i, el) => {
      const href = $(el).attr('href') || ''
      const abs = resolveUrl(href, source.baseUrl)
      if (abs && abs.startsWith(source.baseUrl)) links.add(abs)
    })
    if (links.size >= 30) break // enough candidates from first matching selector
  }
  return Array.from(links)
}

// ─── Gemini batch summarizer ─────────────────────────────────────────────────

interface ArticleDraft {
  id: string
  url: string
  title: string
  bodyText: string
  sourceName: string
  publishedAt: string
}

interface SummarizedArticle extends ArticleDraft {
  summary: string
  category: string
}

/**
 * Batch-summarize up to 10 articles in a single Gemini call.
 * Returns fallback (first sentence) if Gemini fails.
 */
async function batchSummarize(articles: ArticleDraft[]): Promise<SummarizedArticle[]> {
  if (articles.length === 0) return []

  const fallback = (a: ArticleDraft): SummarizedArticle => ({
    ...a,
    summary: a.bodyText.slice(0, 300).replace(/\s+/g, ' ').trim(),
    category: classifyCategory(a.title, a.bodyText),
  })

  if (!isGeminiConfigured()) {
    return articles.map(fallback)
  }

  const systemPrompt = `Você é um analista sênior de agronegócio da AgriSafe. Para cada artigo fornecido, escreva um resumo em PT-BR de exatamente 2 frases que capture o fato principal e o impacto para o setor agropecuário. Retorne um JSON array com objetos {idx, summary}. Use somente informações presentes no texto — não invente dados.`

  const items = articles.map((a, idx) => ({
    idx,
    title: a.title,
    body: a.bodyText.slice(0, 800),
  }))

  try {
    const raw = await summarizeText(systemPrompt, JSON.stringify(items), 1500, true)
    const parsed: Array<{ idx: number; summary: string }> = JSON.parse(raw)
    const map = new Map(parsed.map((p) => [p.idx, p.summary]))

    return articles.map((a, idx) => ({
      ...a,
      summary: (map.get(idx) || fallback(a).summary).slice(0, 600),
      category: classifyCategory(a.title, a.bodyText),
    }))
  } catch {
    return articles.map(fallback)
  }
}

// ─── Main job ─────────────────────────────────────────────────────────────────

export async function runSyncLlmNewsScout(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  let totalNew = 0
  let totalSkipped = 0
  let totalMentions = 0
  let totalNormsDetected = 0
  const errors: string[] = []

  try {
    // Load entity matching catalogue once for the whole run
    const matchableEntities = await loadMatchableEntities(supabase)

    // Collect all discovered article URLs already present in DB to skip duplicates
    // We do a lightweight check by fetching recent agro_news source_urls
    const { data: existingRows } = await supabase
      .from('agro_news')
      .select('source_url')
      .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    const existingUrls = new Set((existingRows || []).map((r: { source_url: string }) => r.source_url))

    const pending: ArticleDraft[] = []

    // ── Phase 1: scrape listing pages, collect candidate article URLs ──────────
    for (const source of SOURCES) {
      if (pending.length >= MAX_ARTICLES_PER_RUN) break

      try {
        const listHtml = await safeFetch(source.listUrl)
        if (!listHtml) {
          errors.push(`${source.name}: failed to fetch listing page`)
          continue
        }

        const $ = cheerio.load(listHtml)
        const links = extractLinks($, source)

        for (const url of links) {
          if (pending.length >= MAX_ARTICLES_PER_RUN) break
          if (existingUrls.has(url)) {
            totalSkipped++
            continue
          }

          // Fetch the article page
          const articleHtml = await safeFetch(url)
          if (!articleHtml) continue

          const $a = cheerio.load(articleHtml)
          const title =
            $a('meta[property="og:title"]').attr('content') ||
            $a('h1').first().text().trim() ||
            ''
          if (!title) continue

          const bodyText = extractArticleBody($a)
          if (bodyText.length < 80) continue

          const rawPublishedAt = extractPublishedAt($a)
          const publishedAt = rawPublishedAt || new Date().toISOString()

          pending.push({
            id: makeId(url),
            url,
            title,
            bodyText,
            sourceName: source.name,
            publishedAt,
          })

          // Mark as seen so we don't double-process across sources
          existingUrls.add(url)
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e?.message || String(e)}`)
      }
    }

    // ── Phase 2: batch summarize via Gemini (≤5 calls for ≤50 articles) ───────
    const summarized: SummarizedArticle[] = []
    for (let i = 0; i < pending.length; i += GEMINI_BATCH_SIZE) {
      const batch = pending.slice(i, i + GEMINI_BATCH_SIZE)
      const results = await batchSummarize(batch)
      summarized.push(...results)
    }

    // ── Phase 3: upsert agro_news + downstream processing ─────────────────────
    const activityBatch: Parameters<typeof logActivityBatch>[1] = []

    for (const art of summarized) {
      const row = {
        id: art.id,
        title: art.title,
        summary: art.summary,
        content: art.bodyText.slice(0, 5000),
        source_name: art.sourceName,
        source_url: art.url,
        url: art.url,
        category: art.category,
        published_at: art.publishedAt,
        tags: [] as string[],
        confidentiality: 'public',
      }

      const { error } = await supabase
        .from('agro_news')
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true })

      if (error) {
        totalSkipped++
        continue
      }

      totalNew++

      activityBatch.push({
        action: 'upsert',
        target_table: 'agro_news',
        target_id: art.id,
        source: 'sync-llm-news-scout',
        source_kind: 'cron',
        actor: 'cron',
        summary: art.title.slice(0, 200),
        metadata: { source_name: art.sourceName, url: art.url, category: art.category },
      })

      // Entity mentions
      const entityUids = matchEntitiesInText(`${art.title} ${art.summary}`, matchableEntities)
      if (entityUids.length > 0) {
        totalMentions += await writeEntityMentions(supabase, {
          entityUids,
          sourceTable: 'agro_news',
          sourceId: art.id,
          mentionType: 'mentioned',
          extractedBy: 'regex_v1',
        })
      }

      // Norm extraction
      const normCandidates = extractNormsFromNews({
        title: art.title,
        summary: art.summary,
        source_url: art.url,
        published_at: art.publishedAt,
      })
      if (normCandidates.length > 0) {
        const normRows = normCandidates.map((c) => ({
          id: c.id,
          body: c.body,
          norm_type: c.norm_type,
          norm_number: c.norm_number,
          title: c.title,
          summary: c.summary,
          published_at: c.published_at,
          effective_at: null,
          impact_level: c.impact_level,
          affected_areas: c.affected_areas,
          affected_cnaes: c.affected_cnaes,
          source_url: c.source_url,
        }))
        const { error: normErr } = await supabase
          .from('regulatory_norms')
          .upsert(normRows, { onConflict: 'id', ignoreDuplicates: false })
        if (!normErr) {
          totalNormsDetected += normRows.length
          for (const nr of normRows) {
            activityBatch.push({
              action: 'upsert',
              target_table: 'regulatory_norms',
              target_id: nr.id,
              source: 'sync-llm-news-scout:norm_extractor',
              source_kind: 'cron',
              actor: 'cron',
              summary: `${nr.title} (detectado em notícia)`.slice(0, 200),
              metadata: { news_url: art.url, body: nr.body, norm_type: nr.norm_type },
            })
          }
        }
      }
    }

    // Flush activity log in one shot
    if (activityBatch.length > 0) {
      await logActivityBatch(supabase, activityBatch)
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : totalNew > 0 ? 'partial' : 'error'

    await logSync(supabase, {
      source: 'sync-llm-news-scout',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: pending.length + totalSkipped,
      records_inserted: totalNew,
      errors: errors.length,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return {
      ok: status !== 'error',
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: pending.length + totalSkipped,
      recordsUpdated: totalNew,
      errors,
      stats: {
        new: totalNew,
        skipped: totalSkipped,
        entity_mentions: totalMentions,
        norms_detected: totalNormsDetected,
        sources: SOURCES.length,
        gemini_calls: Math.ceil(pending.length / GEMINI_BATCH_SIZE),
      },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-llm-news-scout',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0,
        records_inserted: 0,
        errors: 1,
        status: 'error',
        error_message: message,
      })
    } catch {}
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
    }
  }
}
