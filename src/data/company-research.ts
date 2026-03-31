// Company Research data models
// Consolidated from sdr_agent multi-agent research system

export interface CompanyAnalysis {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  data_abertura?: string;
  situacao_cadastral: string;
  natureza_juridica?: string;
  atividade_principal?: string;
  uf: string;
  municipio: string;
  endereco?: string;
  capital_social?: number;
  porte_empresa?: string;
  digital_presence: DigitalPresence;
  key_persons: KeyPerson[];
  economic_data: EconomicData;
  channel_analysis: ChannelAnalysis;
  news: NewsItem[];
  swot: SWOTAnalysis;
  analyzed_at: string;
}

export interface DigitalPresence {
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
}

export interface KeyPerson {
  name: string;
  role: string;
  linkedin?: string;
  is_partner: boolean;
  participacao?: string;
}

export interface EconomicData {
  capital_social?: string;
  faturamento_estimado?: string;
  porte_empresa?: string;
  recuperacao_judicial: boolean;
  restricoes_crediticias: string[];
}

export interface ChannelAnalysis {
  is_embandeirado: boolean;
  marca_predominante?: string;
  marcas_secundarias: string[];
  segmento_atuacao: string[];
  regiao_atuacao: string[];
}

export interface NewsItem {
  title: string;
  summary: string;
  url?: string;
  date: string;
  source: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface SWOTAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

// Sample analysis result for demo/preview
export const sampleAnalysis: CompanyAnalysis = {
  id: "demo-1",
  cnpj: "12.345.678/0001-90",
  razao_social: "Agro Distribuidora Centro-Oeste Ltda",
  nome_fantasia: "AgroCentro",
  data_abertura: "2010-05-15",
  situacao_cadastral: "ATIVA",
  natureza_juridica: "206-2 - Sociedade Empresária Limitada",
  atividade_principal: "46.83-4-00 - Comércio atacadista de defensivos agrícolas",
  uf: "MS",
  municipio: "Campo Grande",
  endereco: "Av. Afonso Pena, 3200 - Centro",
  capital_social: 5000000,
  porte_empresa: "Médio",
  digital_presence: {
    website: "www.agrocentro.com.br",
    linkedin: "linkedin.com/company/agrocentro",
    instagram: "@agrocentro_ms",
  },
  key_persons: [
    { name: "Carlos Eduardo Mendes", role: "Sócio-Administrador", is_partner: true, participacao: "60%" },
    { name: "Ricardo Mendes Filho", role: "Sócio", is_partner: true, participacao: "40%" },
    { name: "Marina Oliveira", role: "Gerente Comercial", is_partner: false },
  ],
  economic_data: {
    capital_social: "R$ 5.000.000,00",
    faturamento_estimado: "R$ 120-180 milhões/ano",
    porte_empresa: "Médio",
    recuperacao_judicial: false,
    restricoes_crediticias: [],
  },
  channel_analysis: {
    is_embandeirado: true,
    marca_predominante: "Syngenta",
    marcas_secundarias: ["BASF", "FMC"],
    segmento_atuacao: ["Defensivos", "Sementes", "Fertilizantes"],
    regiao_atuacao: ["MS", "MT", "GO"],
  },
  news: [
    { title: "AgroCentro expande operação para Mato Grosso", summary: "Distribuidora abre nova filial em Rondonópolis para atender produtores da região.", date: "2026-02-28", source: "Canal Rural", sentiment: "positive" },
    { title: "Crédito rural cresce 12% em MS no primeiro trimestre", summary: "Distribuidoras de MS registram alta na demanda por insumos financiados.", date: "2026-03-10", source: "Valor Econômico", sentiment: "positive" },
  ],
  swot: {
    strengths: [
      "Forte presença no Centro-Oeste brasileiro",
      "Parceria exclusiva com Syngenta na região",
      "Equipe comercial experiente com 15+ anos no setor",
      "Capital social sólido para operações de crédito",
    ],
    weaknesses: [
      "Dependência de uma marca predominante (Syngenta)",
      "Presença digital limitada (sem YouTube/Facebook ativo)",
      "Concentração geográfica em 3 estados",
    ],
    opportunities: [
      "Expansão para MT com nova filial em Rondonópolis",
      "Crescimento do crédito rural no Plano Safra 25/26",
      "Demanda crescente por agricultura de precisão",
    ],
    threats: [
      "Concorrência de grandes distribuidores nacionais (AgroGalaxy, Nutrien)",
      "Risco de inadimplência de produtores na safra corrente",
      "Instabilidade cambial impactando preços de insumos importados",
    ],
  },
  analyzed_at: "2026-03-25T14:30:00Z",
};
