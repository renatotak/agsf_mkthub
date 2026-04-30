/**
 * OECD-FAO Agricultural Outlook — SDMX code mappings.
 *
 * Source dataflow: OECD.TAD.ATM:DSD_AGR@DF_OUTLOOK_2023_2032 (1.0)
 *   https://sdmx.oecd.org/public/rest/data/OECD.TAD.ATM,DSD_AGR@DF_OUTLOOK_2023_2032/
 *
 * Output format: CSV (≈3MB for the full set, much lighter than JSON).
 *
 * Dimensions on each observation:
 *   REF_AREA      — country / aggregate (BRA, USA, OECD, WLD, ...)
 *   FREQ          — A (annual)
 *   COMMODITY     — CPC code (CPC_0111 etc.) OR Outlook short code (WT, MA, ...)
 *   MEASURE       — QP, QC, EX, IM, PROD, ...
 *   UNIT_MEASURE  — T (tonnes), L (litres)
 *   TIME_PERIOD   — year
 *   OBS_VALUE     — numeric
 *   UNIT_MULT     — multiplier exponent (3 = thousands, 6 = millions)
 *
 * We restrict to a small allowlist of countries × commodities × measures so a
 * single weekly run is bounded (~3-5k rows) and stays in the macro_statistics
 * shape used by the rest of the platform.
 */

export const OECD_OUTLOOK_BASE_URL =
  'https://sdmx.oecd.org/public/rest/data/OECD.TAD.ATM,DSD_AGR@DF_OUTLOOK_2023_2032/'

/** Allowlist of REF_AREA codes → human region names used in macro_statistics.region */
export const OECD_AREAS: Record<string, string> = {
  BRA: 'Brazil',
  WLD: 'World',
  W: 'World', // SDMX sometimes serves the aggregate as "W"
  OECD: 'OECD',
  USA: 'United States of America',
  ARG: 'Argentina',
  CHN: 'China',
  IND: 'India',
  AUS: 'Australia',
  EUR: 'European Union',
  EU27: 'European Union',
}

/**
 * Commodity allowlist. The Outlook ships both CPC numeric codes and legacy
 * short codes (WT, MA, RI, ...) depending on the dimension version. We map
 * both shapes to our internal commodity slug.
 */
export const OECD_COMMODITIES: Record<string, { commodity: string; label: string }> = {
  // Outlook short codes
  WT: { commodity: 'trigo', label: 'Wheat' },
  MA: { commodity: 'milho', label: 'Maize' },
  RI: { commodity: 'arroz', label: 'Rice' },
  CO: { commodity: 'algodao', label: 'Cotton' },
  SU: { commodity: 'acucar', label: 'Sugar' },
  OS: { commodity: 'oleaginosas', label: 'Oilseeds' },
  SO: { commodity: 'soja', label: 'Soybeans' },
  CR: { commodity: 'cereais', label: 'Coarse grains' },
  // CPC numeric mappings (subset that overlaps the Outlook commodity domain)
  CPC_0111: { commodity: 'trigo', label: 'Wheat (CPC 0111)' },
  CPC_0112: { commodity: 'milho', label: 'Maize (CPC 0112)' },
  CPC_0113: { commodity: 'arroz', label: 'Rice (CPC 0113)' },
  CPC_01441: { commodity: 'soja', label: 'Soybeans (CPC 01441)' },
  CPC_01802: { commodity: 'algodao', label: 'Cotton (CPC 01802)' },
  CPC_2151: { commodity: 'acucar', label: 'Refined sugar (CPC 2151)' },
}

/**
 * MEASURE → indicator + category in macro_statistics. We keep four
 * indicators that line up with the rest of the macro layer (FAOSTAT, USDA,
 * MDIC ComexStat all use these exact strings).
 */
export const OECD_MEASURES: Record<
  string,
  { indicator: string; category: string }
> = {
  QP: { indicator: 'production', category: 'oecd_outlook_production' },
  PROD: { indicator: 'production', category: 'oecd_outlook_production' },
  QC: { indicator: 'consumption', category: 'oecd_outlook_consumption' },
  CONS: { indicator: 'consumption', category: 'oecd_outlook_consumption' },
  EX: { indicator: 'exports', category: 'oecd_outlook_trade' },
  IM: { indicator: 'imports', category: 'oecd_outlook_trade' },
}

/** UNIT_MEASURE → unit string */
export const OECD_UNITS: Record<string, string> = {
  T: 'tonnes',
  L: 'litres',
  KG: 'kg',
  HG: 'hectograms',
}

/**
 * Build the SDMX CSV URL for a given start/end year window. We pull a few
 * historical years plus the next ~5 projection years so the macro panels
 * always have a continuous series.
 */
export function buildOecdOutlookUrl(startYear: number, endYear: number): string {
  const params = new URLSearchParams({
    format: 'csvfile',
    startPeriod: String(startYear),
    endPeriod: String(endYear),
    dimensionAtObservation: 'AllDimensions',
  })
  return `${OECD_OUTLOOK_BASE_URL}?${params.toString()}`
}

/**
 * Parse a single CSV row (already split by `,` with quote handling) into the
 * canonical macro_statistics shape, or return null if it should be skipped.
 *
 * Pure function — no I/O — so the scraper stays deterministic.
 */
export interface OecdRowInput {
  REF_AREA?: string
  COMMODITY?: string
  MEASURE?: string
  UNIT_MEASURE?: string
  TIME_PERIOD?: string
  OBS_VALUE?: string
  UNIT_MULT?: string
}

export interface OecdMacroRow extends Record<string, unknown> {
  source_id: 'oecd_outlook'
  category: string
  commodity: string
  region: string
  indicator: string
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: Record<string, unknown>
}

export function mapOecdRow(input: OecdRowInput): OecdMacroRow | null {
  const area = input.REF_AREA?.trim()
  const commCode = input.COMMODITY?.trim()
  const measure = input.MEASURE?.trim()
  const period = input.TIME_PERIOD?.trim()
  const rawValue = input.OBS_VALUE?.trim()
  if (!area || !commCode || !measure || !period || !rawValue) return null

  const region = OECD_AREAS[area]
  const commodity = OECD_COMMODITIES[commCode]
  const measureMeta = OECD_MEASURES[measure]
  if (!region || !commodity || !measureMeta) return null

  const numeric = parseFloat(rawValue)
  if (!Number.isFinite(numeric)) return null

  // UNIT_MULT in SDMX is the exponent of 10 to apply to the raw value.
  const mult = parseInt(input.UNIT_MULT || '0', 10)
  const factor = Number.isFinite(mult) ? Math.pow(10, mult) : 1
  const value = numeric * factor

  const unitKey = (input.UNIT_MEASURE || '').trim().toUpperCase()
  const unit = OECD_UNITS[unitKey] || unitKey || 'units'

  return {
    source_id: 'oecd_outlook',
    category: measureMeta.category,
    commodity: commodity.commodity,
    region,
    indicator: measureMeta.indicator,
    value,
    unit,
    period,
    reference_date: `${period}-12-31`,
    metadata: {
      oecd_ref_area: area,
      oecd_commodity_code: commCode,
      oecd_measure: measure,
      oecd_unit_mult: mult,
      oecd_label: commodity.label,
    },
  }
}

/**
 * Minimal CSV parser tuned for the OECD SDMX CSV (RFC 4180 style: comma
 * separator, double-quoted fields, doubled `""` for embedded quotes). Avoids
 * pulling in a CSV library since we only need to read ~10 named columns.
 */
export function parseOecdCsv(body: string): OecdRowInput[] {
  const lines: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n') {
        row.push(field)
        lines.push(row)
        row = []
        field = ''
      } else if (ch === '\r') {
        // ignore; handled by \n
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    lines.push(row)
  }

  if (lines.length === 0) return []
  const header = lines[0]
  const out: OecdRowInput[] = []
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r]
    if (cols.length < 2) continue
    const rec: Record<string, string> = {}
    for (let c = 0; c < header.length; c++) {
      rec[header[c]] = cols[c] ?? ''
    }
    out.push(rec as OecdRowInput)
  }
  return out
}
