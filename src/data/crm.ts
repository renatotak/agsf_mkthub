// CRM data models and seed data
// Consolidated from crm_clientes project

export type LeadStage = "lead" | "contacted" | "prospect" | "negotiation" | "client" | "lost" | "inactive" | "recuperacao_judicial";

export interface Contact {
  id: string;
  company_id: string | null;
  company_name?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
  email: string;
  email_2?: string;
  phone?: string;
  mobile?: string;
  linkedin?: string;
  responsible_rep?: string;
  lead_stage: LeadStage;
  notes?: string;
  approach_status?: string;
  last_contact_date?: string;
  created_at: string;
}

export interface Company {
  id: string;
  company_name: string;
  trading_name?: string;
  cnpj?: string;
  cnpj_root?: string;
  sector?: string;
  uf?: string;
  city?: string;
  status: "active" | "inactive" | "recuperacao_judicial";
  contact_count?: number;
  debt_value?: number;
  created_at: string;
}

export interface Interaction {
  id: string;
  contact_id: string;
  company_id?: string;
  interaction_date: string;
  interaction_type: string;
  notes: string;
  value_amount?: number;
  status?: string;
}

export const leadStageConfig: Record<LeadStage, { label_pt: string; label_en: string; color: string; sort: number }> = {
  lead: { label_pt: "Lead", label_en: "Lead", color: "bg-slate-100 text-slate-700", sort: 1 },
  contacted: { label_pt: "Contatado", label_en: "Contacted", color: "bg-sky-100 text-sky-700", sort: 2 },
  prospect: { label_pt: "Prospecto", label_en: "Prospect", color: "bg-blue-100 text-blue-700", sort: 3 },
  negotiation: { label_pt: "Negociação", label_en: "Negotiation", color: "bg-amber-100 text-amber-700", sort: 4 },
  client: { label_pt: "Cliente", label_en: "Client", color: "bg-emerald-100 text-emerald-700", sort: 5 },
  lost: { label_pt: "Perdido", label_en: "Lost", color: "bg-red-100 text-red-700", sort: 6 },
  inactive: { label_pt: "Inativo", label_en: "Inactive", color: "bg-gray-100 text-gray-500", sort: 7 },
  recuperacao_judicial: { label_pt: "Rec. Judicial", label_en: "Judicial Recovery", color: "bg-rose-100 text-rose-700", sort: 8 },
};

// Sample data seeded from crm_clientes real records
export const sampleContacts: Contact[] = [
  { id: "ct1", company_id: "co1", company_name: "Agro Distribuidora Centro-Oeste Ltda", first_name: "Carlos", last_name: "Mendes", display_name: "Carlos Mendes", role: "Diretor Comercial", email: "carlos@agrocentro.com.br", phone: "(67) 3321-4400", lead_stage: "client", responsible_rep: "Bruno S.", last_contact_date: "2026-03-15", created_at: "2025-08-10" },
  { id: "ct2", company_id: "co2", company_name: "Cooperativa Agrícola de Dourados", first_name: "Marina", last_name: "Oliveira", display_name: "Marina Oliveira", role: "Gerente de Crédito", email: "marina.oliveira@coopadourados.coop.br", mobile: "(67) 99812-3344", lead_stage: "negotiation", responsible_rep: "Bruno S.", last_contact_date: "2026-03-22", created_at: "2025-11-05" },
  { id: "ct3", company_id: "co3", company_name: "Revendas Agrícolas Mato Grosso S/A", first_name: "João", last_name: "Ferreira", display_name: "João Ferreira", role: "CEO", email: "joao.ferreira@revendasmt.com.br", linkedin: "linkedin.com/in/joaoferreira", lead_stage: "prospect", responsible_rep: "Lucas R.", last_contact_date: "2026-03-10", created_at: "2026-01-14" },
  { id: "ct4", company_id: "co4", company_name: "Bayer CropScience Brasil", first_name: "Ana Paula", last_name: "Santos", display_name: "Ana Paula Santos", role: "Head de Parcerias", email: "ana.santos@bayer.com", phone: "(11) 5694-2000", lead_stage: "contacted", responsible_rep: "Lucas R.", last_contact_date: "2026-03-20", created_at: "2026-02-01" },
  { id: "ct5", company_id: "co5", company_name: "Fazenda Santa Helena Agropecuária", first_name: "Roberto", last_name: "Almeida", display_name: "Roberto Almeida", role: "Proprietário", email: "roberto@fazendash.com.br", mobile: "(65) 99734-5500", lead_stage: "lead", created_at: "2026-03-01" },
  { id: "ct6", company_id: "co6", company_name: "Grupo Terra Forte Agronegócios", first_name: "Fernanda", last_name: "Costa", display_name: "Fernanda Costa", role: "CFO", email: "fernanda.costa@terraforte.agr.br", lead_stage: "client", responsible_rep: "Bruno S.", last_contact_date: "2026-03-18", created_at: "2025-06-20" },
  { id: "ct7", company_id: null, first_name: "Pedro", last_name: "Nascimento", display_name: "Pedro Nascimento", role: "Consultor Independente", email: "pedro.n@outlook.com", lead_stage: "lost", notes: "Não tem interesse no momento", created_at: "2025-09-15" },
  { id: "ct8", company_id: "co7", company_name: "Nutrien Soluções Agrícolas", first_name: "Lucia", last_name: "Yamamoto", display_name: "Lucia Yamamoto", role: "Diretora Regional Sul", email: "lucia.y@nutrien.com.br", phone: "(41) 3333-8800", lead_stage: "negotiation", responsible_rep: "Lucas R.", last_contact_date: "2026-03-25", created_at: "2026-01-28" },
];

export const sampleCompanies: Company[] = [
  { id: "co1", company_name: "Agro Distribuidora Centro-Oeste Ltda", trading_name: "AgroCentro", cnpj: "12.345.678/0001-90", sector: "Distribuidor", uf: "MS", city: "Campo Grande", status: "active", contact_count: 3, created_at: "2025-06-01" },
  { id: "co2", company_name: "Cooperativa Agrícola de Dourados", trading_name: "Coopadourados", cnpj: "23.456.789/0001-01", sector: "Cooperativa", uf: "MS", city: "Dourados", status: "active", contact_count: 2, created_at: "2025-07-10" },
  { id: "co3", company_name: "Revendas Agrícolas Mato Grosso S/A", trading_name: "Revendas MT", cnpj: "34.567.890/0001-12", sector: "Redistribuidor", uf: "MT", city: "Rondonópolis", status: "active", contact_count: 4, created_at: "2025-08-20" },
  { id: "co4", company_name: "Bayer CropScience Brasil", trading_name: "Bayer Agro", cnpj: "45.678.901/0001-23", sector: "Indústria", uf: "SP", city: "São Paulo", status: "active", contact_count: 1, created_at: "2025-05-01" },
  { id: "co5", company_name: "Fazenda Santa Helena Agropecuária", trading_name: "Faz. Santa Helena", cnpj: "56.789.012/0001-34", sector: "Produtor", uf: "MT", city: "Sorriso", status: "active", contact_count: 1, created_at: "2026-02-15" },
  { id: "co6", company_name: "Grupo Terra Forte Agronegócios", trading_name: "Terra Forte", cnpj: "67.890.123/0001-45", sector: "Distribuidor", uf: "GO", city: "Rio Verde", status: "active", contact_count: 2, debt_value: 0, created_at: "2025-04-01" },
  { id: "co7", company_name: "Nutrien Soluções Agrícolas", trading_name: "Nutrien", cnpj: "78.901.234/0001-56", sector: "Distribuidor", uf: "PR", city: "Londrina", status: "active", contact_count: 1, created_at: "2025-10-01" },
  { id: "co8", company_name: "AgroGalaxy Participações S/A", trading_name: "AgroGalaxy", cnpj: "89.012.345/0001-67", sector: "Distribuidor", uf: "GO", city: "Goiânia", status: "recuperacao_judicial", contact_count: 0, debt_value: 4200000000, created_at: "2024-12-01" },
];
