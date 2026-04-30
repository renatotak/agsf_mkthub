/**
 * Phase 30 — sync-adapar-parana job module.
 *
 * Fetches the Paraná ADAPAR PDF list of state-registered agricultural
 * inputs (~135 pages, ~3,500 products) and upserts records into
 * `industry_products` with source_dataset='adapar_parana'.
 *
 * PDF URL (may change when ADAPAR updates their site):
 *   http://www.adapar.pr.gov.br/arquivos/File/DPFI/lista_0.pdf
 *
 * If the primary URL returns 404 or times out, the job falls through
 * a short list of alternative paths under the same domain and returns
 * ok=true with 0 records (so the Sunday orchestrator run never aborts).
 *
 * Algorithm-first per CLAUDE.md guardrail #1 — NO LLM.
 * pdf-parse is already in package.json ("pdf-parse": "^1.1.1").
 *
 * Dedup key: (source_dataset, product_name) via the partial unique
 * index added in migration 078 (uq_ip_state_product).
 *
 * Anchor to the 5-entity model: industry_products has no required
 * entity_uid FK (manufacturer_entity_uid is nullable). State
 * registrations carry titular_registro as a text field only — no
 * BrasilAPI lookup is performed here, keeping this job self-contained.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
// pdf-parse ships CommonJS; the default export is the parse function.
// We use a dynamic import so the module is loaded at runtime (avoids
// Next.js edge-runtime bundling issues with the native fs dependency).
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

// ─── URL candidates ─────────────────────────────────────────────────────────
// ADAPAR occasionally moves the file. Try these in order.
// NOTE: update this list if ADAPAR restructures their download area.
const PDF_URL_CANDIDATES = [
  'http://www.adapar.pr.gov.br/arquivos/File/DPFI/lista_0.pdf',
  'https://www.adapar.pr.gov.br/arquivos/File/DPFI/lista_0.pdf',
  'http://www.adapar.pr.gov.br/arquivos/File/DPFI/Lista_0.pdf',
]

const FETCH_TIMEOUT_MS = 120_000  // 2 min — large PDF
const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

// ─── Product-type classification ────────────────────────────────────────────
// Maps Portuguese category keywords found in the ADAPAR PDF to the
// product_type enum used by industry_products.
const PRODUCT_TYPE_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /herbic/i,                              type: 'herbicida' },
  { pattern: /fungic/i,                              type: 'fungicida' },
  { pattern: /insetic/i,                             type: 'inseticida' },
  { pattern: /acaric/i,                              type: 'acaricida' },
  { pattern: /nematic/i,                             type: 'nematicida' },
  { pattern: /fertiliz/i,                            type: 'fertilizante' },
  { pattern: /biol[oó]gic/i,                         type: 'biologico' },
]

function classifyProductType(text: string): string {
  for (const { pattern, type } of PRODUCT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type
  }
  return 'outros'
}

// ─── Toxicity / environmental class normalizer ───────────────────────────────
// ADAPAR uses "Classe I", "Classe II", "Classe III", "Classe IV" (Roman or Arabic).
// Some rows use "Extremamente Tóxico", "Altamente Tóxico", etc.
function normalizeClass(raw: string): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (/classe\s*[i1]/i.test(t) && !/[i1]{2}/i.test(t.replace(/classe/i, ''))) return 'Classe I'
  if (/classe\s*[i1]{2}/i.test(t))   return 'Classe II'
  if (/classe\s*[i1]{2}[i1]/i.test(t)) return 'Classe III'
  if (/classe\s*[i1]{3}v?/i.test(t)) return 'Classe III'
  if (/classe\s*(?:iv|4)/i.test(t))  return 'Classe IV'
  if (/extremamente\s+t[oó]xico/i.test(t)) return 'Classe I'
  if (/altamente\s+t[oó]xico/i.test(t))    return 'Classe II'
  if (/medianamente\s+t[oó]xico/i.test(t)) return 'Classe III'
  if (/pouco\s+t[oó]xico/i.test(t))        return 'Classe IV'
  return t.slice(0, 80) || null
}

// ─── Parsed product row ──────────────────────────────────────────────────────
interface AdaparProduct {
  product_name: string
  product_type: string
  active_ingredients: string[]
  titular_registro: string | null
  toxicity_class: string | null
  environmental_class: string | null
  agrofit_registro: string | null
}

// ─── PDF text → product rows ─────────────────────────────────────────────────
//
// The ADAPAR PDF uses a tabular layout. When extracted by pdf-parse the
// columns collapse into a single text stream. Observed format (one product
// per logical block, separated by newlines):
//
//   HERBICIDA  GLIFOSATO  480  ROUNDUP ORIGINAL  MONSANTO  Classe III  Classe III
//
// or multi-line blocks where each column is on its own line. We use a
// line-classification approach:
//
//   1. Split into lines.
//   2. A line that contains a product-type keyword (HERBICIDA, FUNGICIDA …)
//      opens a new product block.
//   3. Within a block we extract fields by position / regex heuristics.
//
// Because PDF text extraction is inherently messy, we are defensive:
//   - product_name must be ≥ 3 chars; shorter strings are skipped.
//   - We log the first 500 chars of raw text so log reviewers can verify
//     what was actually received.

// Registration number patterns for ADAPAR/MAPA/PR state registrations.
// Federal registrations look like "BR-XXXXXX" or bare 6-8 digit numbers.
// PR state registrations may look like "PR-XXXXX" or "SEAB-XXXXX".
const REGISTRO_PATTERN = /\b(?:PR|BR|SEAB|MAPA)[-\s]?\d{4,8}\b|\b\d{6,9}\b/

// Toxicity / environmental class inline pattern
const CLASS_INLINE = /classe\s+[IiVv1234]{1,4}|extremamente\s+t[oó]xico|altamente\s+t[oó]xico|medianamente\s+t[oó]xico|pouco\s+t[oó]xico/gi

// Product-type keyword that starts a new row
const PRODUCT_TYPE_KEYWORD = /\b(herbicida|fungicida|inseticida|acaricida|nematicida|fertilizante|biol[oó]gico|bactericida|regulador|dessecante)\b/i

/**
 * Parse raw text from the ADAPAR PDF into product rows.
 *
 * The ADAPAR PDF is a table with columns approximately:
 *   Tipo | Ingrediente Ativo | Concentração | Nome Comercial | Titular | Toxicidade | Amb
 *
 * pdf-parse collapses columns left-to-right on the same visual row into
 * a single line separated by spaces. We identify row boundaries by the
 * presence of a product-type keyword.
 */
function parseAdaparText(text: string): AdaparProduct[] {
  // Log first 500 chars at INFO level so launchd log shows what was received.
  console.info('[sync-adapar-parana] PDF text sample (first 500 chars):',
    text.slice(0, 500).replace(/\n/g, '↵'))

  const products: AdaparProduct[] = []
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)

  // We accumulate "current row" tokens. A row is triggered by a product-type
  // keyword. When the next row starts (or EOF), we finalize the previous one.
  let current: string[] = []

  function flush() {
    if (current.length === 0) return
    const joined = current.join(' ').replace(/\s{2,}/g, ' ').trim()
    current = []

    if (joined.length < 10) return

    // 1. Classify product type from the joined string
    const productType = classifyProductType(joined)

    // 2. Extract class info
    const classMatches = joined.match(CLASS_INLINE) || []
    const toxicityClass  = classMatches[0] ? normalizeClass(classMatches[0]) : null
    const environmentalClass = classMatches[1] ? normalizeClass(classMatches[1]) : null

    // Remove the class strings from the joined text before further parsing
    const withoutClass = joined.replace(CLASS_INLINE, '').replace(/\s{2,}/g, ' ').trim()

    // 3. Extract registration number
    const registroMatch = withoutClass.match(REGISTRO_PATTERN)
    const registro = registroMatch ? registroMatch[0].replace(/\s/g, '').toUpperCase() : null
    const withoutRegistro = withoutClass.replace(REGISTRO_PATTERN, '').replace(/\s{2,}/g, ' ').trim()

    // 4. Strip the product-type keyword itself from the remainder
    const withoutType = withoutRegistro
      .replace(PRODUCT_TYPE_KEYWORD, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    // 5. Heuristic: split on long sequences of uppercase + numbers to find
    //    the commercial name vs active ingredient vs company.
    //
    //    In the ADAPAR PDF the order is typically:
    //      <ingrediente ativo> <concentração> <nome comercial> <titular>
    //    but this varies. We look for an ALL-CAPS segment as the product name
    //    (commercial names are often in CAPS in the PDF) and treat the rest
    //    as active ingredient / holder candidates.
    const tokens = withoutType.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean)

    // Fallback: use the whole remainder as product name if we can't segment
    let product_name = withoutType.slice(0, 200).trim()
    let active_ingredients: string[] = []
    let titular_registro: string | null = null

    // Try to find a "nome comercial" segment: usually all-caps, ≥ 3 chars,
    // not a generic word, follows the active ingredient token
    const capsToken = tokens.find(t =>
      t.length >= 3 &&
      /^[A-ZÀ-Ü0-9 \-\.]+$/.test(t) &&
      !PRODUCT_TYPE_KEYWORD.test(t)
    )
    if (capsToken) {
      product_name = capsToken.trim()
      // Active ingredient: typically the token before the caps one (in the PDF
      // column order) — or any token that looks like a chemical name
      const capsIdx = tokens.indexOf(capsToken)
      if (capsIdx > 0) {
        active_ingredients = [tokens[capsIdx - 1].replace(/\d+\s*(?:g\/L|g\/kg|%)?/gi, '').trim()]
          .filter(s => s.length >= 3)
      }
      // Titular: token after the caps name (or last long token)
      if (capsIdx >= 0 && capsIdx + 1 < tokens.length) {
        titular_registro = tokens[capsIdx + 1].trim() || null
      }
    } else if (tokens.length >= 2) {
      // Fallback: first token = product name, last = titular
      product_name = tokens[0].trim()
      titular_registro = tokens[tokens.length - 1].trim() || null
      if (tokens.length >= 3) {
        active_ingredients = [tokens[1].trim()].filter(s => s.length >= 3)
      }
    }

    // Guard: skip obviously bad rows
    if (!product_name || product_name.length < 3) return
    // Skip header rows and summary lines
    if (/^(?:nome\s+comercial|ingrediente\s+ativo|titular|produto|tipo|classe)/i.test(product_name)) return
    if (/^(?:total|subtotal|\d+\s+produto)/i.test(product_name)) return

    products.push({
      product_name: product_name.slice(0, 500),
      product_type: productType,
      active_ingredients,
      titular_registro: titular_registro ? titular_registro.slice(0, 300) : null,
      toxicity_class: toxicityClass,
      environmental_class: environmentalClass,
      agrofit_registro: registro,
    })
  }

  for (const line of lines) {
    if (PRODUCT_TYPE_KEYWORD.test(line)) {
      // New product row starts — finalize previous
      flush()
      current = [line]
    } else {
      current.push(line)
    }
  }
  flush()  // flush last block

  return products
}

// ─── PDF fetch with URL fallback ─────────────────────────────────────────────

async function fetchPdf(): Promise<{ buffer: Buffer; url: string } | null> {
  for (const url of PDF_URL_CANDIDATES) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*;q=0.9' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        console.warn(`[sync-adapar-parana] ${url} → HTTP ${res.status}, trying next`)
        continue
      }
      const ab = await res.arrayBuffer()
      return { buffer: Buffer.from(ab), url }
    } catch (err) {
      console.warn(`[sync-adapar-parana] ${url} → ${(err as Error).message}, trying next`)
    }
  }
  return null
}

// ─── Main job function ────────────────────────────────────────────────────────

export async function runSyncAdaparParana(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const errors: string[] = []

  // ── 1. Fetch PDF ──────────────────────────────────────────────
  const fetched = await fetchPdf()

  if (!fetched) {
    const warning = 'ADAPAR Paraná PDF not reachable at any candidate URL — skipping run'
    console.warn(`[sync-adapar-parana] ${warning}`)

    const finishedAt = new Date().toISOString()
    await logSync(supabase, {
      source: 'sync-adapar-parana',
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'partial',
      records_fetched: 0,
      records_inserted: 0,
      errors: 1,
      error_message: warning,
    }).catch(() => {})

    await logActivity(supabase, {
      action: 'upsert',
      source: 'sync-adapar-parana',
      source_kind: 'cron',
      target_table: 'industry_products',
      summary: `ADAPAR Paraná: ${warning}`,
      metadata: { pdfPages: 0, rowsParsed: 0, rowsInserted: 0, rowsSkipped: 0, warning },
    }).catch(() => {})

    return {
      ok: true,   // do not break the Sunday orchestrator run
      status: 'success',
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [],
      stats: { pdfPages: 0, rowsParsed: 0, rowsInserted: 0, rowsSkipped: 0, warning },
    }
  }

  console.info(`[sync-adapar-parana] fetched ${(fetched.buffer.byteLength / 1024).toFixed(0)} KB from ${fetched.url}`)

  // ── 2. Parse PDF with pdf-parse ───────────────────────────────
  let pdfPages = 0
  let rawText = ''

  try {
    // Dynamic import so Next.js server bundle doesn't try to resolve 'fs'
    // at build time when ADAPAR is the only consumer of pdf-parse.
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(fetched.buffer)
    pdfPages = data.numpages
    rawText = data.text
    console.info(`[sync-adapar-parana] parsed PDF: ${pdfPages} pages, ${rawText.length} chars`)
  } catch (err) {
    const msg = `pdf-parse failed: ${(err as Error).message}`
    errors.push(msg)
    const finishedAt = new Date().toISOString()
    await logSync(supabase, {
      source: 'sync-adapar-parana',
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'error',
      records_fetched: 0,
      records_inserted: 0,
      errors: 1,
      error_message: msg,
    }).catch(() => {})
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      recordsFetched: 0,
      recordsUpdated: 0,
      errors,
      stats: { pdfPages, rowsParsed: 0, rowsInserted: 0, rowsSkipped: 0 },
    }
  }

  // ── 3. Parse text → product rows ──────────────────────────────
  const parsed = parseAdaparText(rawText)
  console.info(`[sync-adapar-parana] extracted ${parsed.length} product candidates`)

  // ── 4. Deduplicate within this run ────────────────────────────
  const seen = new Set<string>()
  let rowsSkipped = 0
  const now = new Date().toISOString()

  const rows = parsed
    .filter(p => {
      if (!p.product_name || p.product_name.length < 3) { rowsSkipped++; return false }
      const key = p.product_name.toLowerCase().trim()
      if (seen.has(key)) { rowsSkipped++; return false }
      seen.add(key)
      return true
    })
    .map(p => ({
      product_name: p.product_name,
      product_type: p.product_type,
      active_ingredients: p.active_ingredients,
      titular_registro: p.titular_registro,
      toxicity_class: p.toxicity_class,
      environmental_class: p.environmental_class,
      agrofit_registro: p.agrofit_registro,   // may be null
      source_dataset: 'adapar_parana',
      industry_id: null,                       // state registrations have no industry FK
      manufacturer_entity_uid: null,
      confidentiality: 'public',
      scraped_at: now,
    }))

  const rowsParsed = rows.length

  // ── 5. Upsert to industry_products ────────────────────────────
  // Conflict key: (source_dataset, product_name) via uq_ip_state_product (mig 078)
  // We chunk to keep Supabase payloads sane.
  let rowsInserted = 0
  const CHUNK_SIZE = 200

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error, count } = await supabase
      .from('industry_products')
      .upsert(chunk, {
        onConflict: 'source_dataset,product_name',
        ignoreDuplicates: false,
        count: 'exact',
      })

    if (error) {
      const msg = `upsert chunk ${Math.floor(i / CHUNK_SIZE)}: ${error.message}`
      errors.push(msg)
      console.error(`[sync-adapar-parana] ${msg}`)
    } else {
      rowsInserted += count || chunk.length
    }
  }

  // ── 6. Log sync + activity ────────────────────────────────────
  const finishedAt = new Date().toISOString()
  const status: 'success' | 'partial' | 'error' =
    errors.length === 0 ? 'success' :
    rowsInserted > 0    ? 'partial'  : 'error'

  await logSync(supabase, {
    source: 'sync-adapar-parana',
    started_at: startedAt,
    finished_at: finishedAt,
    status,
    records_fetched: rowsParsed,
    records_inserted: rowsInserted,
    errors: errors.length,
    error_message: errors.length > 0 ? errors.slice(0, 3).join('; ') : undefined,
  }).catch(() => {})

  await logActivity(supabase, {
    action: 'upsert',
    source: 'sync-adapar-parana',
    source_kind: 'cron',
    target_table: 'industry_products',
    summary: `ADAPAR Paraná: ${pdfPages} pages, ${rowsParsed} products parsed, ${rowsInserted} upserted`,
    metadata: { pdfUrl: fetched.url, pdfPages, rowsParsed, rowsInserted, rowsSkipped, errors: errors.length },
  }).catch(() => {})

  return {
    ok: status !== 'error',
    status,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    recordsFetched: rowsParsed,
    recordsUpdated: rowsInserted,
    errors,
    stats: { pdfPages, rowsParsed, rowsInserted, rowsSkipped },
  }
}
