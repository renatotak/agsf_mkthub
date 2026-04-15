/**
 * Phase 29 — sync-events-agrural job module.
 *
 * Scrapes agrural.com.br for events:
 *   - /encontro-2025/ (or current year) — annual Encontro de Mercado conference
 *   - /palestras-e-cursos-.../ — recurring lectures and courses
 *
 * AgRural is a consultancy, not an event aggregator, so the page structure
 * is narrative rather than a structured event list. The scraper extracts
 * what it can from headings, paragraphs, and metadata.
 *
 * Pattern follows sync-events-na.ts (manual upsert + entity-matcher).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import type { JobResult } from '@/jobs/types'

const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'
const BASE_URL = 'https://agrural.com.br'

// Pages to scrape — the encontro slug changes yearly, so we probe both patterns.
const ENCONTRO_SLUGS = [
  '/encontro-2026/',
  '/encontro-2025/',
]
const PALESTRAS_URL = `${BASE_URL}/palestras-e-cursos-sobre-o-mercado-de-soja-milho-e-algodao/`

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function inferType(name: string): string {
  const lower = name.toLowerCase()
  if (/encontro|conferência|conference|summit/.test(lower)) return 'conference'
  if (/palestra|lecture/.test(lower)) return 'workshop'
  if (/curso|course|capacitação|treinamento/.test(lower)) return 'workshop'
  if (/feira|expo|show/.test(lower)) return 'fair'
  if (/webinar|online|live/.test(lower)) return 'webinar'
  return 'conference'
}

/**
 * Parse dates from Brazilian Portuguese text.
 * Handles:
 *   "21 e 22 de maio de 2026"
 *   "14 a 16 de maio de 2025"
 *   "21-22 de maio de 2026"
 *   "maio de 2026" (month only → first of month)
 */
function parseBrDateRange(text: string): { start: string; end: string | null } | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()

  // "21 e 22 de maio de 2026" or "21 a 22 de maio de 2026" or "21-22 de maio de 2026"
  let m = t.match(/(\d{1,2})\s*(?:e|a|-)\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s*(?:de\s+)?(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10), endDay = parseInt(m[2], 10)
    const month = MONTHS_PT[m[3]], year = parseInt(m[4], 10)
    if (month) return {
      start: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    }
  }

  // "14 de maio a 16 de maio de 2025"
  m = t.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s*a\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s*(?:de\s+)?(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10), startMonth = MONTHS_PT[m[2]]
    const endDay = parseInt(m[3], 10), endMonth = MONTHS_PT[m[4]], year = parseInt(m[5], 10)
    if (startMonth && endMonth) return {
      start: `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    }
  }

  // "21 de maio de 2026"
  m = t.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s*(?:de\s+)?(\d{4})/i)
  if (m) {
    const day = parseInt(m[1], 10), month = MONTHS_PT[m[2]], year = parseInt(m[3], 10)
    if (month) return {
      start: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      end: null,
    }
  }

  // "maio de 2026" (month only)
  m = t.match(/([a-zçãéí]+)\s*(?:de\s+)?(\d{4})/i)
  if (m) {
    const month = MONTHS_PT[m[1]], year = parseInt(m[2], 10)
    if (month) return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: null,
    }
  }

  return null
}

/**
 * Extract location from text. Looks for "City (UF)" or "City, UF" or "City - UF" patterns.
 */
function parseLocation(text: string): { location: string; uf: string | null } {
  // "Goiânia (GO)" or "Curitiba (PR)"
  let m = text.match(/([\w\s\u00C0-\u024F]+)\s*\(([A-Z]{2})\)/)
  if (m) return { location: `${m[1].trim()}, ${m[2]}`, uf: m[2] }

  // "Goiânia, GO" or "Goiânia - GO"
  m = text.match(/([\w\s\u00C0-\u024F]+)\s*[,\-–]\s*([A-Z]{2})\b/)
  if (m) return { location: `${m[1].trim()}, ${m[2]}`, uf: m[2] }

  return { location: text.trim(), uf: null }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

interface EventRow {
  id: string
  name: string
  date: string
  end_date: string | null
  location: string | null
  type: string
  description_pt: string | null
  description_en: string | null
  content_opportunity_pt: string | null
  content_opportunity_en: string | null
  website: string | null
  upcoming: boolean
  source_name: string
  source_url: string
  confidentiality: string
}

/**
 * Scrape the Encontro de Mercado page — AgRural's flagship annual conference.
 */
async function scrapeEncontro(): Promise<EventRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const events: EventRow[] = []

  for (const slug of ENCONTRO_SLUGS) {
    const url = `${BASE_URL}${slug}`
    const html = await fetchPage(url)
    if (!html) continue

    const $ = cheerio.load(html)
    const pageText = $('body').text()

    // Extract event name from h1/h2 or og:title
    let name = $('meta[property="og:title"]').attr('content')?.trim()
      || $('h1').first().text().trim()
      || $('h2').first().text().trim()
      || ''

    if (!name || name.length < 5) {
      // Try extracting from the slug
      const yearMatch = slug.match(/(\d{4})/)
      name = `Encontro de Mercado AgRural ${yearMatch ? yearMatch[1] : ''}`
    }

    // Clean up name - remove site suffix if present
    name = name.replace(/\s*[-–|]\s*AgRural\s*$/i, '').trim()
    if (!name.toLowerCase().includes('agrural') && !name.toLowerCase().includes('encontro')) {
      name = `Encontro de Mercado AgRural - ${name}`
    }

    // Extract date from page text
    let parsedDate: { start: string; end: string | null } | null = null

    // Look for date patterns in headings and paragraphs
    const dateTexts = [
      ...($('h1, h2, h3, h4').map((_, el) => $(el).text()).get()),
      ...($('p, span, div').map((_, el) => $(el).text()).get()),
    ]
    for (const txt of dateTexts) {
      parsedDate = parseBrDateRange(txt)
      if (parsedDate) break
    }

    // Fallback: search full page text for date patterns
    if (!parsedDate) {
      const datePatterns = pageText.match(/\d{1,2}\s*(?:e|a|-)\s*\d{1,2}\s*de\s+[a-zçãéí]+\s*(?:de\s+)?\d{4}/gi)
      if (datePatterns) {
        for (const pat of datePatterns) {
          parsedDate = parseBrDateRange(pat)
          if (parsedDate) break
        }
      }
    }

    if (!parsedDate) continue // Skip if we can't extract a date

    // Extract location
    let location: string | null = null
    const locationPatterns = [
      /(?:local|endere[cç]o|hotel|centro de conven[cç][oõ]es)[:\s]*([^\n]{5,80})/i,
      /([\w\s\u00C0-\u024F]+)\s*\((?:GO|SP|PR|MG|MT|MS|BA|RS|SC|RJ|PE|CE)\)/,
    ]
    for (const pat of locationPatterns) {
      const locMatch = pageText.match(pat)
      if (locMatch) {
        const parsed = parseLocation(locMatch[1] || locMatch[0])
        location = parsed.location
        break
      }
    }

    // Extract description from meta or first meaningful paragraph
    const description = $('meta[property="og:description"]').attr('content')?.trim()
      || $('meta[name="description"]').attr('content')?.trim()
      || ''

    const eventUrl = url
    const id = `agrural-${slugify(name)}`

    events.push({
      id, name,
      date: parsedDate.start,
      end_date: parsedDate.end,
      location,
      type: inferType(name),
      description_pt: description || `Evento organizado pela AgRural.`,
      description_en: `Event organized by AgRural.`,
      content_opportunity_pt: `Acompanhe a cobertura e análises de mercado da AgRural.`,
      content_opportunity_en: `Follow AgRural market coverage and analysis.`,
      website: eventUrl,
      upcoming: parsedDate.start >= today,
      source_name: 'AgRural',
      source_url: eventUrl,
      confidentiality: 'public',
    })

    break // Only need the first valid encontro page
  }

  return events
}

/**
 * Scrape the Palestras e Cursos page for recurring courses/lectures.
 */
async function scrapePalestras(): Promise<EventRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const currentYear = new Date().getFullYear()
  const events: EventRow[] = []

  const html = await fetchPage(PALESTRAS_URL)
  if (!html) return events

  const $ = cheerio.load(html)

  // Extract course blocks — they're under h3 headings
  $('h3').each((_, h3El) => {
    const heading = $(h3El).text().trim()
    if (!heading || heading.length < 5) return

    // Skip navigation/footer headings
    if (/menu|naveg|rodap|footer|contato|contact/i.test(heading)) return

    // Collect text from following siblings until next h3
    let bodyText = ''
    let sibling = $(h3El).next()
    while (sibling.length && !sibling.is('h3')) {
      bodyText += ' ' + sibling.text().trim()
      sibling = sibling.next()
    }

    // Try to extract dates from the body text
    let parsedDate = parseBrDateRange(bodyText)

    // If no date found, check if the heading contains a year
    if (!parsedDate) {
      const yearMatch = (heading + ' ' + bodyText).match(/20\d{2}/)
      if (yearMatch) {
        const year = parseInt(yearMatch[0], 10)
        // Only include current or future years
        if (year >= currentYear) {
          // Try to find a month
          const monthMatch = bodyText.toLowerCase().match(/(?:em|de)\s+([a-zçãéí]+)\s/)
          if (monthMatch && MONTHS_PT[monthMatch[1]]) {
            parsedDate = {
              start: `${year}-${String(MONTHS_PT[monthMatch[1]]).padStart(2, '0')}-01`,
              end: null,
            }
          } else {
            // Fallback: use year start
            parsedDate = { start: `${year}-01-01`, end: null }
          }
        }
      }
    }

    // Skip entries without any date reference
    if (!parsedDate) return

    // Extract location from body text
    let location: string | null = null
    const locMatch = bodyText.match(/(?:em|local[:\s])\s*([\w\s\u00C0-\u024F]+\s*\([A-Z]{2}\))/i)
      || bodyText.match(/(Curitiba|São Paulo|Goiânia|Londrina|Maringá|Campo Mourão)\s*(?:\(([A-Z]{2})\))?/i)
    if (locMatch) {
      const parsed = parseLocation(locMatch[1] || locMatch[0])
      location = parsed.location
    }

    const name = heading
    const id = `agrural-${slugify(name)}`

    events.push({
      id, name,
      date: parsedDate.start,
      end_date: parsedDate.end,
      location,
      type: inferType(name),
      description_pt: bodyText.slice(0, 300).trim() || `Curso/palestra organizado pela AgRural.`,
      description_en: `Course/lecture organized by AgRural.`,
      content_opportunity_pt: null,
      content_opportunity_en: null,
      website: PALESTRAS_URL,
      upcoming: parsedDate.start >= today,
      source_name: 'AgRural',
      source_url: PALESTRAS_URL,
      confidentiality: 'public',
    })
  })

  return events
}

export async function runSyncEventsAgrural(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    // Scrape both sources in parallel
    const [encontroEvents, palestraEvents] = await Promise.all([
      scrapeEncontro(),
      scrapePalestras(),
    ])

    const allEvents = [...encontroEvents, ...palestraEvents]

    // Deduplicate by id
    const seen = new Set<string>()
    const events = allEvents.filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })

    if (events.length === 0) {
      // Not an error — AgRural may simply have no upcoming events at the moment
      const finishedAt = new Date().toISOString()
      await logSync(supabase, {
        source: 'sync-events-agrural',
        started_at: startedAt,
        finished_at: finishedAt,
        records_fetched: 0,
        records_inserted: 0,
        errors: 0,
        status: 'success',
      })
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'events',
        source: 'sync-events-agrural',
        source_kind: 'cron',
        actor: 'cron',
        summary: 'AgRural: nenhum evento encontrado neste ciclo',
        metadata: { status: 'success', upserted: 0 },
      })
      return {
        ok: true,
        status: 'success',
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: 0,
        recordsUpdated: 0,
        errors: [],
      }
    }

    const { error } = await supabase.from('events').upsert(events, { onConflict: 'id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

    // Entity mentions — link events to known legal_entities
    let totalMentions = 0
    try {
      const matchableEntities = await loadMatchableEntities(supabase)
      for (const ev of events) {
        const haystack = `${ev.name} ${ev.description_pt || ''} ${ev.location || ''}`
        const entityUids = matchEntitiesInText(haystack, matchableEntities)
        if (entityUids.length > 0) {
          totalMentions += await writeEntityMentions(supabase, {
            entityUids,
            sourceTable: 'events',
            sourceId: ev.id,
            mentionType: 'mentioned',
            extractedBy: 'regex_v1',
          })
        }
      }
    } catch (e) {
      console.error('[sync-events-agrural] entity-matcher failed:', (e as Error).message)
    }

    const finishedAt = new Date().toISOString()
    await logSync(supabase, {
      source: 'sync-events-agrural',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: encontroEvents.length + palestraEvents.length,
      records_inserted: events.length,
      errors: 0,
      status: 'success',
    })

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'events',
      source: 'sync-events-agrural',
      source_kind: 'cron',
      actor: 'cron',
      summary: `AgRural: ${events.length} evento(s) sincronizados${totalMentions ? `, ${totalMentions} entidades vinculadas` : ''}`,
      metadata: {
        status: 'success',
        upserted: events.length,
        encontro: encontroEvents.length,
        palestras: palestraEvents.length,
        entity_mentions: totalMentions,
      },
    })

    return {
      ok: true,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: encontroEvents.length + palestraEvents.length,
      recordsUpdated: events.length,
      errors: [],
      stats: { entity_mentions: totalMentions, encontro: encontroEvents.length, palestras: palestraEvents.length },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-events-agrural',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: message,
      })
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'events',
        source: 'sync-events-agrural',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-events-agrural falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
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
