// Distribution Channels data models and sample data
// Consolidated from bd_canais_parser project (23,861 classified companies)

export type ChannelCategory = "Industria" | "Distribuidor" | "Produtor" | "Cooperativa" | "Redistribuidor";

export interface DistributionChannel {
  id: string;
  cnpj?: string;
  cnpj_root?: string;
  name: string;
  trading_name?: string;
  category: ChannelCategory;
  uf: string;
  municipio: string;
  source_count: number;
  status?: string;
}

export interface ChannelStats {
  total: number;
  by_category: Record<ChannelCategory, number>;
  by_uf: Record<string, number>;
  top_states: { uf: string; count: number }[];
}

export const channelCategoryConfig: Record<ChannelCategory, { label_pt: string; label_en: string; color: string; icon: string }> = {
  Industria: { label_pt: "Indústria", label_en: "Manufacturer", color: "bg-violet-100 text-violet-700", icon: "factory" },
  Distribuidor: { label_pt: "Distribuidor", label_en: "Distributor", color: "bg-blue-100 text-blue-700", icon: "truck" },
  Produtor: { label_pt: "Produtor", label_en: "Producer", color: "bg-emerald-100 text-emerald-700", icon: "sprout" },
  Cooperativa: { label_pt: "Cooperativa", label_en: "Cooperative", color: "bg-amber-100 text-amber-700", icon: "handshake" },
  Redistribuidor: { label_pt: "Redistribuidor", label_en: "Retailer", color: "bg-rose-100 text-rose-700", icon: "store" },
};

// Sample data from bd_canais_parser classified companies
export const sampleChannels: DistributionChannel[] = [
  { id: "ch1", cnpj: "12.345.678/0001-90", name: "AGRO DISTRIBUIDORA CENTRO-OESTE LTDA", trading_name: "AgroCentro", category: "Distribuidor", uf: "MS", municipio: "Campo Grande", source_count: 3 },
  { id: "ch2", cnpj: "23.456.789/0001-01", name: "COOPERATIVA AGRICOLA DE DOURADOS", trading_name: "Coopadourados", category: "Cooperativa", uf: "MS", municipio: "Dourados", source_count: 2 },
  { id: "ch3", cnpj: "34.567.890/0001-12", name: "SYNGENTA PROTECAO DE CULTIVOS LTDA", category: "Industria", uf: "SP", municipio: "São Paulo", source_count: 5 },
  { id: "ch4", cnpj: "45.678.901/0001-23", name: "BAYER S.A.", category: "Industria", uf: "SP", municipio: "São Paulo", source_count: 5 },
  { id: "ch5", cnpj: "56.789.012/0001-34", name: "NUTRIEN SOLUCOES AGRICOLAS LTDA", trading_name: "Nutrien", category: "Distribuidor", uf: "PR", municipio: "Londrina", source_count: 4 },
  { id: "ch6", cnpj: "67.890.123/0001-45", name: "BASF S.A.", category: "Industria", uf: "SP", municipio: "São Bernardo do Campo", source_count: 5 },
  { id: "ch7", cnpj: "78.901.234/0001-56", name: "AGROGALAXY PARTICIPACOES S.A.", trading_name: "AgroGalaxy", category: "Distribuidor", uf: "GO", municipio: "Goiânia", source_count: 4 },
  { id: "ch8", cnpj: "89.012.345/0001-67", name: "COAMO AGROINDUSTRIAL COOPERATIVA", trading_name: "Coamo", category: "Cooperativa", uf: "PR", municipio: "Campo Mourão", source_count: 3 },
  { id: "ch9", name: "JOSE CARLOS FERREIRA DA SILVA", category: "Produtor", uf: "MT", municipio: "Sorriso", source_count: 1 },
  { id: "ch10", cnpj: "01.234.567/0001-78", name: "AGRO AMAZONIA PRODUTOS AGROPECUARIOS LTDA", trading_name: "Agro Amazônia", category: "Distribuidor", uf: "MT", municipio: "Cuiabá", source_count: 3 },
  { id: "ch11", cnpj: "11.222.333/0001-44", name: "FMC QUIMICA DO BRASIL LTDA", trading_name: "FMC", category: "Industria", uf: "SP", municipio: "Campinas", source_count: 5 },
  { id: "ch12", cnpj: "22.333.444/0001-55", name: "COOPERATIVA AGROINDUSTRIAL COPAGRIL", trading_name: "Copagril", category: "Cooperativa", uf: "PR", municipio: "Marechal Cândido Rondon", source_count: 2 },
  { id: "ch13", cnpj: "33.444.555/0001-66", name: "LAVORO AGRO LTDA", trading_name: "Lavoro", category: "Distribuidor", uf: "MG", municipio: "Uberlândia", source_count: 3 },
  { id: "ch14", cnpj: "44.555.666/0001-77", name: "SINAGRO PRODUTOS AGROPECUARIOS LTDA", trading_name: "Sinagro", category: "Distribuidor", uf: "MS", municipio: "Dourados", source_count: 3 },
  { id: "ch15", cnpj: "55.666.777/0001-88", name: "CASA DO ADUBO COM. IND. LTDA", trading_name: "Casa do Adubo", category: "Redistribuidor", uf: "BA", municipio: "Luís Eduardo Magalhães", source_count: 2 },
];

export const sampleStats: ChannelStats = {
  total: 23861,
  by_category: {
    Industria: 487,
    Distribuidor: 8234,
    Produtor: 9812,
    Cooperativa: 1456,
    Redistribuidor: 3872,
  },
  by_uf: {
    MT: 3940, SP: 3200, MG: 2850, PR: 2600, GO: 2100, MS: 1890,
    BA: 1500, RS: 1400, MA: 900, TO: 800, RO: 680, PA: 500,
    SC: 450, PI: 380, CE: 280, PE: 250, RJ: 220, ES: 200,
    RN: 150, PB: 130, SE: 100, AL: 90, AM: 80, AP: 60,
    RR: 50, AC: 40, DF: 20,
  },
  top_states: [
    { uf: "MT", count: 3940 },
    { uf: "SP", count: 3200 },
    { uf: "MG", count: 2850 },
    { uf: "PR", count: 2600 },
    { uf: "GO", count: 2100 },
    { uf: "MS", count: 1890 },
    { uf: "BA", count: 1500 },
    { uf: "RS", count: 1400 },
  ],
};
