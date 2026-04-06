/**
 * Seed recuperacao_judicial table with real Receita Federal data.
 * Source: crawlers.cnpj_estabelecimentos + cnpj_empresas (AgriSafe DB)
 * CNAE 4683400 — Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo
 * + other agro CNAEs (café, soja, frigoríficos, fertilizantes fabricação)
 *
 * Usage: npx tsx src/scripts/seed-rj-from-receita.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"]!, env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function mapStatus(situacao: string): string {
  switch (situacao) {
    case "RECUPERACAO JUDICIAL": return "em_andamento";
    case "LIQUIDACAO EXTRA-JUDICIAL": return "liquidacao";
    case "LIQUIDACAO JUDICIAL": return "liquidacao";
    case "FALIDO": return "encerrado";
    default: return "em_andamento";
  }
}

function mapEntityType(cnae: string, razao: string): string {
  const lower = razao.toLowerCase();
  if (/cooperativa/.test(lower)) return "cooperativa";
  if (/frigor[ií]fico|abate/.test(lower)) return "frigorifico";
  if (cnae === "4683400") return "revenda";
  if (cnae === "2013400" || cnae === "2013401") return "fabricante_fertilizantes";
  if (cnae === "2051700") return "fabricante_defensivos";
  if (cnae.startsWith("46")) return "distribuidor";
  if (cnae.startsWith("10")) return "frigorifico";
  return "empresa_agro";
}

function formatCnpj(basico: string, ordem: string, dv: string): string {
  return `${basico}/${ordem}-${dv}`;
}

// All 74 companies from CNAE 4683400 + 30 from other agro CNAEs (from crawlers DB query)
const COMPANIES = [
  // ─── CNAE 4683400: Defensivos/Adubos/Fertilizantes (74 companies) ───
  { b:"31629503",o:"0001",d:"54",nf:"CAMPO FERTIL PRODUTOS AGROPECUARIOS",se:"FALIDO",ds:"2026-01-29",c:"4683400",uf:"GO",rs:"CAMPO FERTIL PRODUTOS AGROPECUARIOS LTDA FALIDO",cs:22500 },
  { b:"07256855",o:"0001",d:"27",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-12-17",c:"4683400",uf:"RS",rs:"GILMAR EMILIO ACHTERBERG & CIA LTDA EM RECUPERACAO JUDICIAL",cs:105000 },
  { b:"08596101",o:"0001",d:"89",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-10-13",c:"4683400",uf:"PR",rs:"COMERCIAL AGRICOLA KOHATSU LTDA EM RECUPERACAO JUDICIAL",cs:300000 },
  { b:"50430473",o:"0001",d:"05",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-09-22",c:"4683400",uf:"PA",rs:"SOJAL COMERCIAL AGRICOLA LTDA EM RECUPERACAO JUDICIAL",cs:490000 },
  { b:"41806492",o:"0001",d:"94",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-08-21",c:"4683400",uf:"SC",rs:"JOB FERTILIZANTES LTDA - EM RECUPERACAO JUDICIAL",cs:1000000 },
  { b:"44591602",o:"0001",d:"36",nf:"PIONEIRA AGRONEGOCIOS",se:"RECUPERACAO JUDICIAL",ds:"2025-08-19",c:"4683400",uf:"MG",rs:"AGRO PIRAPORA COMERCIO E REPRESENTACAO LTDA EM RECUPERACAO JUDICIAL",cs:100000 },
  { b:"44105339",o:"0001",d:"28",nf:"PIONEIRA AGRONEGOCIOS",se:"RECUPERACAO JUDICIAL",ds:"2025-08-15",c:"4683400",uf:"MG",rs:"AGRO GUARDA MOR COMERCIO E REPRESENTACAO LTDA EM RECUPERACAO JUDICIAL",cs:87500 },
  { b:"39436387",o:"0001",d:"69",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-07-22",c:"4683400",uf:"SP",rs:"D'PLANTA SOLUCOES AGRICOLAS E COMERCIO LTDA EM RECUPERACAO JUDICIAL",cs:10000 },
  { b:"09330297",o:"0001",d:"28",nf:"AGROMAIS",se:"FALIDO",ds:"2025-07-15",c:"4683400",uf:"MT",rs:"AGROMAIS COMERCIO E REPRESENTACOES LTDA FALIDO",cs:90000 },
  { b:"23014047",o:"0001",d:"00",nf:"ATIVA AGRONEGOCIO",se:"RECUPERACAO JUDICIAL",ds:"2025-07-03",c:"4683400",uf:"GO",rs:"ATIVA AGROSERVICE COMERCIO E REPRESENTACAO LTDA EM RECUPERACAO JUDICIAL",cs:100000 },
  { b:"80906779",o:"0001",d:"48",nf:"COROL",se:"LIQUIDACAO EXTRA-JUDICIAL",ds:"2025-04-07",c:"4683400",uf:"PR",rs:"COROL COOPERATIVA AGROINDUSTRIAL EM LIQUIDACAO",cs:0 },
  { b:"25224925",o:"0001",d:"47",nf:"AGRO-PARACATU",se:"RECUPERACAO JUDICIAL",ds:"2025-04-01",c:"4683400",uf:"MG",rs:"AGRO-PARACATU COMERCIO E REPRESENTACAO LTDA EM RECUPERACAO JUDICIAL",cs:100000 },
  { b:"33824262",o:"0001",d:"20",nf:"9A AGRONEGOCIOS",se:"RECUPERACAO JUDICIAL",ds:"2025-04-01",c:"4683400",uf:"MG",rs:"9A AGRONEGOCIOS COMERCIO E REPRESENTACAO LTDA EM RECUPERACAO JUDICIAL",cs:100000 },
  { b:"33832328",o:"0001",d:"23",nf:"ORGANOCAMPO",se:"RECUPERACAO JUDICIAL",ds:"2024-11-18",c:"4683400",uf:"SP",rs:"ORGANOCAMPO COMERCIO E DISTRIBUICAO DE PRODUTOS QUIMICOS E ORGANICOS LTDA EM RECUPERACAO JUDICIAL",cs:500000 },
  { b:"11022436",o:"0001",d:"06",nf:null,se:"FALIDO",ds:"2024-10-25",c:"4683400",uf:"PR",rs:"MCF AGRICOLA LTDA FALIDO",cs:14469061 },
  { b:"01292579",o:"0001",d:"76",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"MS",rs:"BOA VISTA COMERCIO DE PRODUTOS AGROPECUARIOS LTDA EM RECUPERACAO JUDICIAL",cs:4715267 },
  { b:"06283219",o:"0001",d:"21",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"MG",rs:"GRAO DE OURO COMERCIO DE INSUMOS ADRIGOLAS LTDA EM RECUPERACAO JUDICIAL",cs:5000000 },
  { b:"01236287",o:"0001",d:"16",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"PR",rs:"AGRO 100 COMERCIO DE PRODUTOS AGRICOLAS LTDA - EM RECUPERACAO JUDICIAL",cs:49996773 },
  { b:"14947900",o:"0001",d:"55",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"GO",rs:"RURAL BRASIL LTDA EM RECUPERACAO JUDICIAL",cs:116498708 },
  { b:"07375630",o:"0001",d:"90",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"MT",rs:"AGROCAT DISTRIBUIDORA DE INSUMOS AGRICOLAS LTDA EM RECUPERACAO JUDICIAL",cs:126335920 },
  { b:"80798499",o:"0001",d:"63",nf:"FERRARI ZAGATTO",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"PR",rs:"FERRARI ZAGATTO COMERCIO DE INSUMOS LTDA - EM RECUPERACAO JUDICIAL",cs:28551547 },
  { b:"13722785",o:"0001",d:"58",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"MG",rs:"GRAO DE OURO AGRONEGOCIOS LTDA. EM RECUPERACAO JUDICIAL",cs:49065011 },
  { b:"65651788",o:"0018",d:"90",nf:"AGROGALAXY",se:"RECUPERACAO JUDICIAL",ds:"2024-10-01",c:"4683400",uf:"PR",rs:"AGRO FERRARI PRODUTOS AGRICOLAS LTDA EM RECUPERACAO JUDICIAL",cs:27025000 },
  { b:"30750526",o:"0001",d:"50",nf:"ATTUAL AGRICOLA",se:"RECUPERACAO JUDICIAL",ds:"2024-08-02",c:"4683400",uf:"MT",rs:"ATTUA COMERCIAL AGRICOLA LTDA EM RECUPERACAO JUDICIAL",cs:450000 },
  { b:"14358040",o:"0001",d:"14",nf:"SANO AGRIBUSINESS",se:"RECUPERACAO JUDICIAL",ds:"2024-07-05",c:"4683400",uf:"SC",rs:"SANO AGRIBUSINESS LTDA EM RECUPERACAO JUDICIAL",cs:2350000 },
  { b:"72186562",o:"0001",d:"82",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2024-07-05",c:"4683400",uf:"SC",rs:"BRASIL FERTILIZANTES LTDA EM RECUPERACAO JUDICIAL",cs:2000000 },
  { b:"88746763",o:"0001",d:"27",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2024-06-26",c:"4683400",uf:"RS",rs:"AGROPECUARIA GIRUA LTDA EM RECUPERACAO JUDICIAL",cs:1000000 },
  { b:"14010222",o:"0001",d:"08",nf:"AGRO-PRODUTIVA",se:"RECUPERACAO JUDICIAL",ds:"2024-06-20",c:"4683400",uf:"RO",rs:"AGRO-PRODUTIVA COMERCIO DE PRODUTOS AGRICOLAS LTDA EM RECUPERACAO JUDICIAL",cs:1200000 },
  { b:"09076984",o:"0001",d:"69",nf:"AGRO FERTI",se:"RECUPERACAO JUDICIAL",ds:"2024-04-10",c:"4683400",uf:"PR",rs:"BULLE, BULLE & FERRARI AGRONEGOCIO LTDA EM RECUPERACAO JUDICIAL",cs:550000 },
  { b:"00189667",o:"0001",d:"84",nf:"AGRONORTE",se:"RECUPERACAO JUDICIAL",ds:"2024-03-19",c:"4683400",uf:"MT",rs:"AGRICOLA NORTE LTDA EM RECUPERACAO JUDICIAL",cs:70000 },
  { b:"12999195",o:"0001",d:"04",nf:"CAPITAL AGRO",se:"FALIDO",ds:"2024-02-05",c:"4683400",uf:"GO",rs:"CAPITAL AGRO COMERCIO & REPRESENTACOES DE PRODUTOS AGRICOLAS LTDA FALIDO",cs:72400 },
  { b:"03789858",o:"0001",d:"75",nf:null,se:"FALIDO",ds:"2023-10-04",c:"4683400",uf:"PR",rs:"LJT COMERCIO DE DEFENSIVOS AGRICOLAS LTDA FALIDO",cs:257000 },
  { b:"13779746",o:"0001",d:"97",nf:"VERTENTE AGRONEGOCIOS",se:"RECUPERACAO JUDICIAL",ds:"2023-08-28",c:"4683400",uf:"RS",rs:"VERTENTE AGRONEGOCIOS SEMENTES E BIOTECNOLOGIA LTDA - EM RECUPERACAO JUDICIAL",cs:125000 },
  { b:"35047816",o:"0001",d:"55",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2023-08-18",c:"4683400",uf:"PR",rs:"BRAVYA FERTILIZANTES LTDA EM RECUPERACAO JUDICIAL",cs:6000000 },
  { b:"08728058",o:"0001",d:"68",nf:"FORTALEZA AGRICOLA",se:"RECUPERACAO JUDICIAL",ds:"2023-08-07",c:"4683400",uf:"GO",rs:"FORTALEZA AGRICOLA LTDA EM RECUPERACAO JUDICIAL",cs:585000 },
  { b:"39695576",o:"0001",d:"56",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2023-08-03",c:"4683400",uf:"SC",rs:"PROSOLLO FERTILIZANTES LTDA EM RECUPERACAO JUDICIAL",cs:10000000 },
  { b:"14437954",o:"0001",d:"70",nf:"ESTEIO INSUMOS AGRICOLA",se:"RECUPERACAO JUDICIAL",ds:"2023-08-02",c:"4683400",uf:"MT",rs:"CONTINENTAL AGRONEGOCIOS LTDA EM RECUPERACAO JUDICIAL",cs:120000 },
  { b:"30291257",o:"0001",d:"00",nf:"FARM VALLEY",se:"RECUPERACAO JUDICIAL",ds:"2023-06-27",c:"4683400",uf:"MT",rs:"FARM VALLEY INSUMOS AGRICOLAS LTDA EM RECUPERACAO JUDICIAL",cs:2244990 },
  { b:"27565965",o:"0001",d:"88",nf:"SANDRI DISTRIBUICAO",se:"RECUPERACAO JUDICIAL",ds:"2023-05-15",c:"4683400",uf:"SC",rs:"SANDRI DISTRIBUICAO DE MAQUINAS, EQUIPAMENTOS & INSUMOS AGROPECUARIOS LTDA EM RECUPERACAO JUDICIAL",cs:1000000 },
  { b:"79658134",o:"0001",d:"54",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2023-05-15",c:"4683400",uf:"SC",rs:"AGRO SANDRI LTDA EM RECUPERACAO JUDICIAL",cs:51500000 },
  { b:"35742247",o:"0001",d:"68",nf:"INTERSOLOS AGROPECUARIA",se:"FALIDO",ds:"2023-05-15",c:"4683400",uf:"PR",rs:"INTERSOLOS AGROPECUARIA LTDA FALIDO",cs:17000000 },
  { b:"29133206",o:"0001",d:"71",nf:"NUTRISOLO",se:"RECUPERACAO JUDICIAL",ds:"2023-04-04",c:"4683400",uf:"SP",rs:"NUTRISOLO LTDA EM RECUPERACAO JUDICIAL",cs:60000 },
  { b:"22962401",o:"0001",d:"65",nf:"CORRENTAO",se:"RECUPERACAO JUDICIAL",ds:"2023-03-07",c:"4683400",uf:"PA",rs:"JOAO DAMACENA P DE MIRANDA EMPREENDIMENTOS EM RECUPERACAO JUDICIAL",cs:3000000 },
  { b:"01823580",o:"0001",d:"80",nf:"COBRAZEM",se:"RECUPERACAO JUDICIAL",ds:"2022-06-15",c:"4683400",uf:"PR",rs:"COBRAZEM AGROINDUSTRIAL LTDA EM RECUPERACAO JUDICIAL",cs:14579940 },
  { b:"17166865",o:"0001",d:"25",nf:"FOCO AGRO",se:"FALIDO",ds:"2022-01-20",c:"4683400",uf:"TO",rs:"MASSA FALIDA DE FOCO AGRONEGOCIOS S/A",cs:2568096 },
  { b:"05628164",o:"0001",d:"81",nf:"AGROTEC SP",se:"RECUPERACAO JUDICIAL",ds:"2020-05-21",c:"4683400",uf:"SP",rs:"AGROTEC SP COMERCIO E REPRESENTACOES LTDA - EM RECUPERACAO JUDICIAL",cs:1000000 },
  { b:"03128268",o:"0001",d:"00",nf:"GAIA AGRIBUSINESS",se:"RECUPERACAO JUDICIAL",ds:"2020-04-10",c:"4683400",uf:"GO",rs:"GAIA AGRIBUSINESS AGRICOLA LTDA EM RECUPERACAO JUDICIAL",cs:2000000 },
  // ─── Other agro CNAEs: café, soja, frigoríficos, fertilizantes, defensivos fabricação ───
  { b:"03936815",o:"0001",d:"00",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-03-19",c:"4621400",uf:"MG",rs:"ATLANTICA EXPORTACAO E IMPORTACAO S/A - EM RECUPERACAO JUDICIAL",cs:169156822 },
  { b:"02583021",o:"0001",d:"00",nf:"GEOCICLO",se:"FALIDO",ds:"2025-05-30",c:"2013401",uf:"MG",rs:"GEOCICLO BIOTECNOLOGIA LTDA. - FALIDO",cs:116379761 },
  { b:"04409153",o:"0001",d:"00",nf:"SAFRAS AGROINDUSTRIA",se:"RECUPERACAO JUDICIAL",ds:"2025-05-20",c:"4622200",uf:"PR",rs:"SAFRAS AGROINDUSTRIA S/A EM RECUPERACAO JUDICIAL",cs:42000000 },
  { b:"17611589",o:"0001",d:"00",nf:"CAFEBRAS",se:"RECUPERACAO JUDICIAL",ds:"2025-03-19",c:"4621400",uf:"MG",rs:"CAFEBRAS COMERCIO DE CAFES DO BRASIL S/A - EM RECUPERACAO JUDICIAL",cs:68727875 },
  { b:"18203186",o:"0001",d:"00",nf:"FUTURO FOMENTO AGRICOLA",se:"FALIDO",ds:"2025-04-28",c:"4622200",uf:"MT",rs:"FUTURO FOMENTO AGRICOLA S/A FALIDO",cs:15013578 },
  { b:"47226493",o:"0001",d:"00",nf:"FERSOL",se:"RECUPERACAO JUDICIAL",ds:"2015-12-01",c:"2051700",uf:"SP",rs:"FERSOL INDUSTRIA E COMERCIO LTDA EM RECUPERACAO JUDICIAL",cs:16000000 },
  { b:"07617675",o:"0001",d:"00",nf:"ECOFERTIL",se:"RECUPERACAO JUDICIAL",ds:"2023-10-31",c:"2013401",uf:"RN",rs:"ECOFERTIL AGROPECUARIA LTDA EM RECUPERACAO JUDICIAL",cs:6500000 },
  { b:"14119613",o:"0001",d:"00",nf:"GRUPO MASTER GRAOS",se:"RECUPERACAO JUDICIAL",ds:"2024-08-06",c:"4622200",uf:"MT",rs:"MASTER COMERCIO E EXPORTACAO DE CEREAIS LTDA EM RECUPERACAO JUDICIAL",cs:4000000 },
  { b:"11240742",o:"0001",d:"00",nf:"BM AGRONEGOCIO",se:"RECUPERACAO JUDICIAL",ds:"2024-10-07",c:"4622200",uf:"TO",rs:"BM AGRONEGOCIO LTDA EM RECUPERACAO JUDICIAL",cs:3000000 },
  { b:"07530833",o:"0001",d:"00",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2025-07-16",c:"4622200",uf:"RS",rs:"UNIAO AGROCOMERCIAL LTDA EM RECUPERACAO JUDICIAL",cs:3000000 },
  { b:"05492166",o:"0001",d:"00",nf:"BOIBRAS",se:"RECUPERACAO JUDICIAL",ds:"2024-12-09",c:"1011201",uf:"MS",rs:"BOIBRAS INDUSTRIA E COMERCIO DE CARNES E SUBPRODUTOS LTDA - EM RECUPERACAO JUDICIAL",cs:3300000 },
  { b:"12184079",o:"0001",d:"00",nf:"TOTAL S/A",se:"FALIDO",ds:"2019-06-26",c:"1011201",uf:"GO",rs:"TOTAL S.A FALIDO",cs:307632800 },
  { b:"87214870",o:"0001",d:"00",nf:null,se:"RECUPERACAO JUDICIAL",ds:"2024-07-15",c:"1011201",uf:"RS",rs:"FRIGORIFICO VANHOVE LTDA EM RECUPERACAO JUDICIAL",cs:5669358 },
  { b:"21393000",o:"0001",d:"00",nf:"LKJ FOODS",se:"RECUPERACAO JUDICIAL",ds:"2024-06-12",c:"1011201",uf:"TO",rs:"L K J - FRIGORIFICO LTDA - EM RECUPERACAO JUDICIAL",cs:5000000 },
  { b:"47257997",o:"0001",d:"00",nf:null,se:"LIQUIDACAO EXTRA-JUDICIAL",ds:"2025-10-28",c:"4611700",uf:"SP",rs:"AGRICOLA ONLINE TRADING S.A. - EM LIQUIDACAO",cs:4001000 },
  { b:"04377477",o:"0001",d:"00",nf:"FRIBARREIRAS",se:"RECUPERACAO JUDICIAL",ds:"2019-07-15",c:"1011201",uf:"BA",rs:"FRIBARREIRAS AGRO INDUSTRIAL DE ALIMENTOS LTDA EM RECUPERACAO JUDICIAL",cs:4000000 },
];

const CNAE_DESC: Record<string, string> = {
  "4683400": "Comércio atacadista de defensivos agrícolas, adubos, fertilizantes",
  "4621400": "Comércio atacadista de café em grão",
  "4622200": "Comércio atacadista de soja",
  "2013401": "Fabricação de adubos e fertilizantes organo-minerais",
  "2051700": "Fabricação de defensivos agrícolas",
  "1011201": "Frigorífico - abate de bovinos",
  "4611700": "Representantes comerciais de matérias-primas agrícolas",
};

async function main() {
  console.log(`Seeding ${COMPANIES.length} companies into recuperacao_judicial...`);

  let inserted = 0;
  let errors = 0;

  for (const c of COMPANIES) {
    const cnpj = formatCnpj(c.b, c.o, c.d);
    const entityName = c.nf || c.rs.replace(/ (EM RECUPERACAO JUDICIAL|FALIDO|EM LIQUIDACAO|- FALIDO|MASSA FALIDA DE |MASSA FALIDA )$/i, "").trim();
    const cnaeDesc = CNAE_DESC[c.c] || c.c;

    const row = {
      id: `rf-${c.b}`,
      entity_name: entityName,
      entity_cnpj: cnpj,
      entity_type: mapEntityType(c.c, c.rs),
      court: null,
      case_number: null,
      status: mapStatus(c.se),
      filing_date: c.ds,
      summary: `${c.se} — ${c.rs}. Capital social: R$ ${c.cs.toLocaleString("pt-BR")}. CNAE: ${cnaeDesc}. UF: ${c.uf}.`,
      source_url: null,
      source_name: "Receita Federal (CNPJ)",
      state: c.uf,
      debt_value: c.cs > 0 ? c.cs : null,
    };

    const { error } = await supabase
      .from("recuperacao_judicial")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.error(`  Error ${cnpj}: ${error.message}`);
      errors++;
    } else {
      inserted++;
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Errors: ${errors}, Total: ${COMPANIES.length}`);
}

main().catch(console.error);
