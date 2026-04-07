/**
 * FAOSTAT v1 REST API code mappings.
 *
 * FAOSTAT identifies areas (countries), items (commodities), and elements
 * (metrics like "production quantity") by integer codes. The full list is
 * published at fenixservices.fao.org/faostat/api/v1/en/definitions/...
 * but for our use case (Pulso do Mercado Contexto Macro) we only need a
 * small fixed subset, so we hardcode the codes algorithmically here.
 *
 * If FAOSTAT renumbers a code, the scraper will return rows with an
 * unmapped commodity/region/indicator and validatePayload() will surface
 * the failure via scraper_knowledge — that's the auto-correction signal
 * to come fix this file.
 */

// Areas / countries (FAOSTAT "area_code")
export const FAOSTAT_AREAS: Record<number, string> = {
  5000: 'World',
  21: 'Brazil',
  9: 'Argentina',
  231: 'United States of America',
  351: 'China',
}

// Items / commodities (FAOSTAT "item_code", QCL domain)
// Map to the commodity slugs used elsewhere in the app (matches
// src/components/MarketPulse.tsx commodity tabs).
export const FAOSTAT_ITEMS: Record<number, { commodity: string; label: string }> = {
  236: { commodity: 'soybean', label: 'Soybeans' },
  56: { commodity: 'corn', label: 'Maize (corn)' },
}

// Elements / metrics (FAOSTAT "element_code")
// Map to the indicator vocabulary used by macro_statistics.
export const FAOSTAT_ELEMENTS: Record<
  number,
  { indicator: string; category: string; unit: string }
> = {
  5510: { indicator: 'production', category: 'production', unit: 'tonnes' },
  5910: { indicator: 'exports', category: 'trade', unit: 'tonnes' },
}

export const FAOSTAT_BASE_URL = 'https://fenixservices.fao.org/faostat/api/v1/en/data/QCL'

export function buildFaostatUrl(years: number[]): string {
  const params = new URLSearchParams({
    area: Object.keys(FAOSTAT_AREAS).join(','),
    item: Object.keys(FAOSTAT_ITEMS).join(','),
    element: Object.keys(FAOSTAT_ELEMENTS).join(','),
    year: years.join(','),
    format: 'json',
    show_codes: 'true',
    show_unit: 'true',
    show_flags: 'false',
    null_values: 'false',
  })
  return `${FAOSTAT_BASE_URL}?${params.toString()}`
}

/**
 * Shape of a single FAOSTAT JSON record (after the wrapper unwraps `data`).
 * Field names are FAOSTAT's — we map them to our schema in the scraper.
 */
export interface FaostatRecord {
  'Area Code': number
  Area: string
  'Item Code': number
  Item: string
  'Element Code': number
  Element: string
  'Year Code': number
  Year: number | string
  Unit: string
  Value: number
}
