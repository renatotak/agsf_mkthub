/**
 * MDIC ComexStat — code mappings.
 *
 * Brazilian foreign trade statistics from MDIC (Ministério do
 * Desenvolvimento, Indústria, Comércio e Serviços). The ComexStat
 * REST API is open and documented at:
 *
 *   https://comexstat.mdic.gov.br/pt/home
 *   https://api.comexstat.mdic.gov.br/general (POST)
 *
 * We query yearly export+import volumes and FOB values for key agro
 * NCM codes and emit one macro_statistics row per
 * (commodity, indicator, period).
 */

export const MDIC_API_URL = 'https://api-comexstat.mdic.gov.br/general'

// NCM code prefix → our commodity slug. ComexStat allows 4-, 6- or
// 8-digit codes; we use 4-digit chapter heads to capture all variants.
export const MDIC_NCM_COMMODITIES: Record<string, { commodity: string; label: string }> = {
  '1201': { commodity: 'soybean',      label: 'Soja em grãos' },
  '1005': { commodity: 'corn',         label: 'Milho' },
  '0901': { commodity: 'coffee',       label: 'Café' },
  '1701': { commodity: 'sugar',        label: 'Açúcar' },
  '5201': { commodity: 'cotton',       label: 'Algodão em pluma' },
  '0202': { commodity: 'cattle_meat',  label: 'Carne bovina congelada' },
  '0207': { commodity: 'chicken_meat', label: 'Carne de frango' },
  '0203': { commodity: 'swine_meat',   label: 'Carne suína' },
  '1507': { commodity: 'soy_oil',      label: 'Óleo de soja' },
  '2304': { commodity: 'soy_meal',     label: 'Farelo de soja' },
}

// Two indicators per commodity per year. Field names match the
// ComexStat API response keys (metricKG = volume in kg, metricFOB =
// FOB value in USD).
export const MDIC_INDICATORS = [
  { value: 'metricKG',  indicator: 'exports_volume',  category: 'trade', unit: 'kg' },
  { value: 'metricFOB', indicator: 'exports_value',   category: 'trade', unit: 'USD' },
] as const
