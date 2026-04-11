/**
 * CONAB (Companhia Nacional de Abastecimento) — code mappings.
 *
 * CONAB publishes a "Previsão de Safra por Produto" XLSX with each
 * monthly Levantamento de Grãos. The file path is versioned by month
 * (e.g. site_previsao_de_safra-por_produto-mar-2026.xlsx) so we have
 * to scrape the boletim index page first to find the latest one.
 *
 * Workbook structure (one sheet per crop):
 *   Row 0: header categories  REGIÃO/UF | ÁREA | PRODUTIVIDADE | PRODUÇÃO
 *   Row 1: subheaders          Safra X/Y | Safra Y/Z | VAR. % (× 3)
 *   Row 2: column letters      (a) | (b) | (b/a) | (c) | (d) | (d/c) | (e) | (f) | (f/e)
 *   Row 3+: data rows by region/UF — NORTE, RR, RO, ..., BRASIL
 */

export const CONAB_BOLETIM_INDEX_URL =
  'https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-graos/safra-de-graos/'

// CONAB blocks default User-Agents — pretend to be a browser
export const CONAB_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Sheet name → commodity slug. We pick the "Total" variant where
// available so we don't double-count first/second crop sheets.
export const CONAB_SHEETS: Record<string, string> = {
  'Soja':         'soybean',
  'Milho Total':  'corn',
  'Algodao Total':'cotton',
  'Algodão Total':'cotton',
  'Trigo':        'wheat',
  'Arroz Total':  'rice',
  'Feijão Total': 'beans',
  'Feijao Total': 'beans',
  'Sorgo':        'sorghum',
  'Aveia':        'oats',
  'Cevada':       'barley',
}

// Indicator column groups in the per-crop sheets — three groups of
// three columns each (area, productivity, production), plus the
// REGIÃO/UF cell at column 0. The indicator groups always start at
// columns 1, 4 and 7 respectively.
export const CONAB_INDICATOR_GROUPS = [
  { startCol: 1, indicator: 'area_planted',  category: 'production', unit: 'hectares', multiplier: 1000 },
  { startCol: 4, indicator: 'yield',         category: 'production', unit: 'kg/hectare', multiplier: 1 },
  { startCol: 7, indicator: 'production',    category: 'production', unit: 'tonnes',  multiplier: 1000 },
] as const

// Brazilian state codes — used to recognize per-UF rows. Region rows
// (NORTE / NORDESTE / etc.) and the BRASIL total row are handled
// separately so the granularity is tagged correctly.
export const BRAZILIAN_STATES = new Set([
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
])

export const BRAZILIAN_REGIONS = new Set([
  'NORTE','NORDESTE','SUDESTE','SUL','CENTRO-OESTE','CENTRO OESTE',
])
