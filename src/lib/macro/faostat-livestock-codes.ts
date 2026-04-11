/**
 * FAOSTAT v1 REST API code mappings — Livestock domain (QL).
 *
 * Companion to faostat-codes.ts (QCL = crops). The QL domain covers
 * livestock production: cattle, chicken, swine. This adds boi-gordo
 * (live cattle) coverage to the Pulso do Mercado Contexto Macro tab.
 *
 * Code source: fenixservices.fao.org/faostat/api/v1/en/definitions/domain/QL
 */

// Areas / countries — same as crop codes
export const LIVESTOCK_AREAS: Record<number, string> = {
  5000: 'World',
  21: 'Brazil',
  9: 'Argentina',
  231: 'United States of America',
  351: 'China',
  100: 'India',
  14: 'Australia',
}

// Items / livestock (FAOSTAT "item_code", QL domain)
export const LIVESTOCK_ITEMS: Record<number, { commodity: string; label: string }> = {
  866:  { commodity: 'cattle_meat', label: 'Meat of cattle with bone, fresh or chilled' },
  1058: { commodity: 'chicken_meat', label: 'Meat of chickens, fresh or chilled' },
  1035: { commodity: 'swine_meat', label: 'Meat of pig with bone, fresh or chilled' },
  882:  { commodity: 'cattle_milk', label: 'Raw milk of cattle' },
}

// Elements / metrics
export const LIVESTOCK_ELEMENTS: Record<
  number,
  { indicator: string; category: string; unit: string }
> = {
  5510: { indicator: 'production', category: 'production', unit: 'tonnes' },
  5318: { indicator: 'producing_animals', category: 'production', unit: 'head' },
}

export const FAOSTAT_LIVESTOCK_BASE_URL = 'https://fenixservices.fao.org/faostat/api/v1/en/data/QL'

export function buildFaostatLivestockUrl(years: number[]): string {
  const params = new URLSearchParams({
    area: Object.keys(LIVESTOCK_AREAS).join(','),
    item: Object.keys(LIVESTOCK_ITEMS).join(','),
    element: Object.keys(LIVESTOCK_ELEMENTS).join(','),
    year: years.join(','),
    format: 'json',
    show_codes: 'true',
    show_unit: 'true',
    show_flags: 'false',
    null_values: 'false',
  })
  return `${FAOSTAT_LIVESTOCK_BASE_URL}?${params.toString()}`
}
