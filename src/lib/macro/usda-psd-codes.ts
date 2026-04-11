/**
 * USDA FAS PSD Online — code mappings.
 *
 * The PSD (Production, Supply & Distribution) database is the USDA's
 * canonical world commodity supply/demand dataset. Public CSV downloads
 * are available without an API key from:
 *   https://apps.fas.usda.gov/psdonline/downloads/psd_<commodity>_csv.zip
 *
 * We map their integer codes (Commodity_Code, Country_Code, Attribute_Id)
 * algorithmically — no LLM in the parsing loop.
 *
 * Reference: https://apps.fas.usda.gov/psdonline/app/index.html#/app/about
 */

// PSD downloads exposed as direct CSV ZIPs (no auth needed)
export const PSD_CSV_URLS = {
  oilseeds: 'https://apps.fas.usda.gov/psdonline/downloads/psd_oilseeds_csv.zip',
  grains:   'https://apps.fas.usda.gov/psdonline/downloads/psd_grains_pulses_csv.zip',
  cotton:   'https://apps.fas.usda.gov/psdonline/downloads/psd_cotton_csv.zip',
} as const

// Commodity codes we care about (USDA PSD Commodity_Code → our slug)
export const PSD_COMMODITIES: Record<string, { commodity: string; label: string }> = {
  '2222000': { commodity: 'soybean',     label: 'Oilseed, Soybean' },
  '0440000': { commodity: 'corn',        label: 'Corn' },
  '0410000': { commodity: 'wheat',       label: 'Wheat' },
  '5770000': { commodity: 'cotton',      label: 'Cotton' },
  '0422110': { commodity: 'rice',        label: 'Rice, Milled' },
}

// Country codes (USDA PSD Country_Code → our region label).
// USDA uses FAS-style codes (NOT ISO alpha-2). USDA does NOT publish a
// "World" total — only country-level rows + a few regional aggregates.
export const PSD_COUNTRIES: Record<string, string> = {
  'BR': 'Brazil',
  'AR': 'Argentina',
  'US': 'United States of America',
  'CH': 'China',
  'IN': 'India',
  'E4': 'European Union',
  'RS': 'Russia',
  'UP': 'Ukraine',
  'AS': 'Australia',
  'CA': 'Canada',
  'PA': 'Paraguay',
  'BL': 'Bolivia',
  'UY': 'Uruguay',
}

// Attribute IDs we care about. PSD stores these as zero-padded
// strings ("028") but we strip leading zeros via parseInt and key on
// the resulting integer.
export const PSD_ATTRIBUTES: Record<number, { indicator: string; category: string }> = {
  4:   { indicator: 'area_harvested', category: 'production' },
  28:  { indicator: 'production',     category: 'production' },
  57:  { indicator: 'imports',        category: 'trade' },
  88:  { indicator: 'exports',        category: 'trade' },
  176: { indicator: 'ending_stocks',  category: 'production' },
  184: { indicator: 'yield',          category: 'production' },
}

// PSD reports values in 1,000 metric tons (1000 MT). Multiply by 1000
// to get tonnes for consistency with FAOSTAT.
export const PSD_UNIT_MULTIPLIER = 1000
export const PSD_OUTPUT_UNIT = 'tonnes'
