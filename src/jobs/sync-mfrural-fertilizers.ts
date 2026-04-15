/**
 * Phase 2a — sync-mfrural-fertilizers job module.
 *
 * Scrapes MFRural.com.br inorganic fertilizer listings to extract
 * per-region asking prices for DAP, MAP, KCl, and Urea.
 * Writes to `macro_statistics` with source_id='mfrural'.
 *
 * Uses Cheerio for HTML parsing — no LLM involved.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import type { JobResult } from '@/jobs/types'

const BASE_URL = 'https://www.mfrural.com.br/produtos/1-11-04/fertilizantes-inorganicos'
const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'
const MAX_PAGES = 15

// Target fertilizer keywords → canonical commodity slug
const COMMODITY_PATTERNS: { pattern: RegExp; slug: string }[] = [
  { pattern: /\bDAP\b/i,                                          slug: 'dap' },
  { pattern: /\bMAP\b/i,                                          slug: 'map' },
  { pattern: /\b(?:KCl|cloreto\s+de\s+pot[aá]ssio|potash)\b/i,   slug: 'kcl' },
  { pattern: /\b(?:ur[eé]ia|urea)\b/i,                            slug: 'ureia' },
]

// Brazilian state abbreviations → region grouping
const STATE_TO_REGION: Record<string, string> = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
  PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
}

interface MfruralListing {
  name: string
  slug: string
  priceBrl: number
  unit: string
  state: string
  region: string
  city: string
}

/**
 * Parse a BRL price string like "R$ 3.200,00" → 3200.00
 */
function parseBrlPrice(text: string): number | null {
  const cleaned = text
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')      // thousands separator
    .replace(',', '.')       // decimal
    .trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Extract the 2-letter state abbreviation from a location string like "Ribeirão Preto - SP"
 */
function extractState(location: string): string | null {
  const m = location.match(/\b([A-Z]{2})\s*$/)
  return m ? m[1] : null
}

/**
 * Match a product name to one of our target commodity slugs.
 */
function matchCommodity(name: string): string | null {
  for (const { pattern, slug } of COMMODITY_PATTERNS) {
    if (pattern.test(name)) return slug
  }
  return null
}

async function fetchPage(pageNum: number): Promise<string> {
  const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?pg=${pageNum}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`MFRural returned HTTP ${res.status} for page ${pageNum}`)
  return res.text()
}

function parseListings(html: string): MfruralListing[] {
  const $ = cheerio.load(html)
  const listings: MfruralListing[] = []

  // MFRural product cards are <a> tags linking to /detalhe/... with product info inside.
  // We look for links to product detail pages and extract name, price, location.
  $('a[href*="/detalhe/"]').each((_, el) => {
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, ' ').trim()
    if (!text) return

    // Try to extract the product name (first meaningful text line)
    const lines = text.split(/\s{2,}/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return

    const name = lines[0]
    const slug = matchCommodity(name)
    if (!slug) return

    // Find price: look for "R$" pattern anywhere in the card text
    let priceBrl: number | null = null
    let unit = 'tonelada'
    for (const line of lines) {
      const priceMatch = line.match(/R\$\s*[\d.,]+/)
      if (priceMatch) {
        priceBrl = parseBrlPrice(priceMatch[0])
        // Detect unit from the same line
        const lowerLine = line.toLowerCase()
        if (/tonelada/i.test(lowerLine)) unit = 'tonelada'
        else if (/\bkg\b/i.test(lowerLine)) unit = 'kg'
        else if (/\bsc\b|saca/i.test(lowerLine)) unit = 'saca'
        else if (/unidade/i.test(lowerLine)) unit = 'unidade'
        break
      }
    }
    if (!priceBrl) return

    // Find location: look for "City - XX" pattern (state abbreviation)
    let state: string | null = null
    let city = ''
    for (const line of lines) {
      const extracted = extractState(line)
      if (extracted && STATE_TO_REGION[extracted]) {
        state = extracted
        city = line.replace(/\s*-\s*[A-Z]{2}\s*$/, '').trim()
        break
      }
    }
    if (!state) return

    listings.push({
      name,
      slug,
      priceBrl,
      unit,
      state,
      region: STATE_TO_REGION[state],
      city,
    })
  })

  return listings
}

function hasNextPage(html: string): boolean {
  const $ = cheerio.load(html)
  // Pagination: look for a "next" or "Próxima" link, or numbered page links
  const paginationLinks = $('a[href*="pg="]')
  return paginationLinks.length > 0
}

interface MacroStatRow extends Record<string, unknown> {
  source_id: 'mfrural'
  category: 'fertilizer_price'
  commodity: string
  region: string
  indicator: string
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: Record<string, unknown>
}

const mfruralFertilizersScraper: ScraperFn<MacroStatRow> = async () => {
  const allListings: MfruralListing[] = []
  let totalBytes = 0
  let lastHttpStatus = 200

  // Paginate through results
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page)
    totalBytes += html.length
    const listings = parseListings(html)
    allListings.push(...listings)

    // Stop if no more pages or no listings found on this page
    if (listings.length === 0 || !hasNextPage(html)) break

    // Polite delay between pages
    await new Promise(r => setTimeout(r, 1500))
  }

  if (allListings.length === 0) {
    throw new Error('MFRural: no matching fertilizer listings found — page structure may have changed')
  }

  // Aggregate: median price per commodity × region for the current period
  const today = new Date().toISOString().slice(0, 10)
  const period = today.slice(0, 7) // YYYY-MM
  const groups = new Map<string, { prices: number[]; unit: string; listings: string[] }>()

  for (const l of allListings) {
    // Normalize price to BRL/tonelada
    let normalizedPrice = l.priceBrl
    if (l.unit === 'kg') normalizedPrice *= 1000
    else if (l.unit === 'saca' || l.unit === 'unidade') {
      // Skip non-standard units — can't reliably convert
      continue
    }

    const key = `${l.slug}|${l.region}`
    const existing = groups.get(key) || { prices: [], unit: 'BRL/t', listings: [] }
    existing.prices.push(normalizedPrice)
    existing.listings.push(`${l.city}-${l.state}`)
    groups.set(key, existing)
  }

  const rows: MacroStatRow[] = []
  for (const [key, data] of groups) {
    const [commodity, region] = key.split('|')
    const sorted = data.prices.sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]

    rows.push({
      source_id: 'mfrural',
      category: 'fertilizer_price',
      commodity,
      region,
      indicator: 'median_asking_price',
      value: Math.round(median * 100) / 100,
      unit: 'BRL/t',
      period,
      reference_date: today,
      metadata: {
        sample_size: data.prices.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        sample_cities: [...new Set(data.listings)].slice(0, 10),
      },
    })
  }

  // Also emit a national-level median per commodity
  const nationalGroups = new Map<string, number[]>()
  for (const [key, data] of groups) {
    const commodity = key.split('|')[0]
    const existing = nationalGroups.get(commodity) || []
    existing.push(...data.prices)
    nationalGroups.set(commodity, existing)
  }

  for (const [commodity, prices] of nationalGroups) {
    const sorted = prices.sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]

    rows.push({
      source_id: 'mfrural',
      category: 'fertilizer_price',
      commodity,
      region: 'Brasil',
      indicator: 'median_asking_price',
      value: Math.round(median * 100) / 100,
      unit: 'BRL/t',
      period,
      reference_date: today,
      metadata: {
        sample_size: prices.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
      },
    })
  }

  return {
    rows,
    httpStatus: lastHttpStatus,
    bytesFetched: totalBytes,
    targetPeriod: today,
  }
}

export function runSyncMfruralFertilizers(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-mfrural-fertilizers',
    scraperFn: mfruralFertilizersScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
