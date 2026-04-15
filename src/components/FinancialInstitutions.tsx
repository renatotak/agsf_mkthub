"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Landmark, Search, Filter, X, ExternalLink, Loader2, MapPin,
  Building2, ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialInstitution {
  id: string;
  entity_uid: string | null;
  name: string;
  short_name: string | null;
  institution_type: string;
  cnpj: string | null;
  bcb_code: string | null;
  headquarters_uf: string | null;
  headquarters_city: string | null;
  active_rural_credit: boolean;
  rural_credit_volume_brl: number | null;
  specialties: string[] | null;
  website: string | null;
  notes: string | null;
}

// ─── Seed data (shown when table is empty) ────────────────────────────────────

const SEED_DATA: FinancialInstitution[] = [
  { id: "seed-bb", entity_uid: null, name: "Banco do Brasil", short_name: "BB", institution_type: "bank", cnpj: "00000000000191", bcb_code: "001", headquarters_uf: "DF", headquarters_city: "Brasília", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["custeio", "investimento", "cpr"], website: "https://www.bb.com.br", notes: null },
  { id: "seed-bndes", entity_uid: null, name: "Banco Nacional de Desenvolvimento Econômico e Social", short_name: "BNDES", institution_type: "development_bank", cnpj: "33657248000189", bcb_code: "007", headquarters_uf: "RJ", headquarters_city: "Rio de Janeiro", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["investimento", "fiagro"], website: "https://www.bndes.gov.br", notes: null },
  { id: "seed-sicredi", entity_uid: null, name: "Sicredi", short_name: "Sicredi", institution_type: "cooperative_bank", cnpj: null, bcb_code: null, headquarters_uf: "RS", headquarters_city: "Porto Alegre", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["custeio", "investimento", "cpr"], website: "https://www.sicredi.com.br", notes: null },
  { id: "seed-sicoob", entity_uid: null, name: "Sicoob", short_name: "Sicoob", institution_type: "cooperative_bank", cnpj: null, bcb_code: null, headquarters_uf: "DF", headquarters_city: "Brasília", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["custeio", "investimento"], website: "https://www.sicoob.com.br", notes: null },
  { id: "seed-ailos", entity_uid: null, name: "Ailos", short_name: "Ailos", institution_type: "cooperative_bank", cnpj: null, bcb_code: null, headquarters_uf: "SC", headquarters_city: "Blumenau", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["custeio"], website: "https://www.ailos.coop.br", notes: null },
  { id: "seed-cresol", entity_uid: null, name: "Cresol", short_name: "Cresol", institution_type: "cooperative_bank", cnpj: null, bcb_code: null, headquarters_uf: "PR", headquarters_city: "Francisco Beltrão", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["custeio", "investimento"], website: "https://www.cresol.com.br", notes: null },
  { id: "seed-rabobank", entity_uid: null, name: "Rabobank", short_name: "Rabobank", institution_type: "bank", cnpj: null, bcb_code: null, headquarters_uf: "SP", headquarters_city: "São Paulo", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["cpr", "fiagro", "investimento"], website: "https://www.rabobank.com.br", notes: null },
  { id: "seed-btg", entity_uid: null, name: "BTG Pactual", short_name: "BTG", institution_type: "bank", cnpj: null, bcb_code: null, headquarters_uf: "SP", headquarters_city: "São Paulo", active_rural_credit: true, rural_credit_volume_brl: null, specialties: ["cpr", "fiagro", "cra"], website: "https://www.btgpactual.com", notes: null },
];

// ─── Type badge colors ────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  bank:             { bg: "#E8F0FE", text: "#1A73E8" },
  cooperative_bank: { bg: "#E6F4EA", text: "#137333" },
  fidc:             { bg: "#FEF7E0", text: "#B06000" },
  fiagro:           { bg: "#F0E8FE", text: "#7627BB" },
  development_bank: { bg: "#E0F2F1", text: "#00695C" },
  fintech:          { bg: "#FCE4EC", text: "#C2185B" },
  cra_issuer:       { bg: "#FFF3E0", text: "#E65100" },
};

// ─── UF list ──────────────────────────────────────────────────────────────────

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FinancialInstitutions({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const fi = (tr as any).financialInstitutions || {} as Record<string, any>;

  const [institutions, setInstitutions] = useState<FinancialInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingSeed, setUsingSeed] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ufFilter, setUfFilter] = useState("");

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("*")
        .order("name");

      if (error) throw error;

      if (!data || data.length === 0) {
        setInstitutions(SEED_DATA);
        setUsingSeed(true);
      } else {
        setInstitutions(data);
        setUsingSeed(false);
      }
    } catch {
      setInstitutions(SEED_DATA);
      setUsingSeed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered data
  const filtered = useMemo(() => {
    let result = institutions;
    if (typeFilter) result = result.filter((i) => i.institution_type === typeFilter);
    if (ufFilter) result = result.filter((i) => i.headquarters_uf === ufFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.short_name && i.short_name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [institutions, typeFilter, ufFilter, searchQuery]);

  // KPI counts
  const kpis = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const i of institutions) {
      byType[i.institution_type] = (byType[i.institution_type] || 0) + 1;
    }
    return {
      total: institutions.length,
      banks: (byType.bank || 0) + (byType.development_bank || 0),
      cooperatives: byType.cooperative_bank || 0,
      fidcs: byType.fidc || 0,
      fiagros: byType.fiagro || 0,
    };
  }, [institutions]);

  const typeBadgeLabel = (type: string): string => {
    return fi.typeBadge?.[type] || type;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("");
    setUfFilter("");
  };

  const hasFilters = searchQuery || typeFilter || ufFilter;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Landmark size={24} className="text-[#5B7A2F]" />
          <h2 className="text-[22px] font-bold text-neutral-900">
            {fi.title || "Instituições Financeiras"}
          </h2>
        </div>
        <p className="text-[13px] text-neutral-500 ml-[36px]">
          {fi.subtitle || "Bancos, cooperativas, FIDCs e FIAGROs ativos no crédito rural"}
        </p>
      </div>

      {/* Seed disclaimer */}
      {usingSeed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-[12px] text-amber-800">
          {fi.seedDisclaimer || "Dados de exemplo — a tabela ainda não foi populada."}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Total", value: kpis.total },
          { label: fi.typeBadge?.bank || "Bancos", value: kpis.banks },
          { label: fi.typeBadge?.cooperative_bank || "Cooperativas", value: kpis.cooperatives },
          { label: "FIDCs", value: kpis.fidcs },
          { label: "FIAGROs", value: kpis.fiagros },
        ].map((kpi, i) => (
          <div key={i} className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left">
            <p className="text-[9px] font-semibold text-neutral-400 uppercase">{kpi.label}</p>
            <p className="text-[20px] font-bold text-neutral-900 leading-tight mt-0.5">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={fi.searchPlaceholder || "Buscar instituição..."}
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] focus:border-[#5B7A2F]"
          />
        </div>

        {/* Type dropdown */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] cursor-pointer"
          >
            <option value="">{fi.filterByType || "Tipo"}</option>
            {["bank", "cooperative_bank", "fidc", "fiagro", "development_bank", "fintech", "cra_issuer"].map((tp) => (
              <option key={tp} value={tp}>{typeBadgeLabel(tp)}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>

        {/* UF dropdown */}
        <div className="relative">
          <select
            value={ufFilter}
            onChange={(e) => setUfFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] cursor-pointer"
          >
            <option value="">{fi.filterByUf || "UF"}</option>
            {UF_LIST.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-neutral-500 hover:text-neutral-800 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X size={14} />
            Limpar
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-[12px] text-neutral-400">
        {filtered.length} {lang === "pt" ? "resultado(s)" : "result(s)"}
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-neutral-400" />
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center">
          <p className="text-[14px] text-neutral-500">
            {fi.noResults || "Nenhuma instituição encontrada."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((inst) => {
            const colors = TYPE_COLORS[inst.institution_type] || { bg: "#F3F4F6", text: "#6B7280" };
            return (
              <div
                key={inst.id}
                className="bg-white rounded-lg border border-neutral-200 p-4 hover:border-[#5B7A2F]/40 transition-colors"
              >
                {/* Name + badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-[14px] font-bold text-neutral-900 leading-snug line-clamp-2">
                    {inst.short_name || inst.name}
                  </h3>
                  <span
                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {typeBadgeLabel(inst.institution_type)}
                  </span>
                </div>

                {/* Full name if short_name differs */}
                {inst.short_name && inst.short_name !== inst.name && (
                  <p className="text-[11px] text-neutral-500 mb-2 line-clamp-1">{inst.name}</p>
                )}

                {/* HQ location */}
                {(inst.headquarters_city || inst.headquarters_uf) && (
                  <div className="flex items-center gap-1 text-[12px] text-neutral-500 mb-2">
                    <MapPin size={12} className="text-neutral-400 shrink-0" />
                    <span>
                      {[inst.headquarters_city, inst.headquarters_uf].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}

                {/* Specialties */}
                {inst.specialties && inst.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {inst.specialties.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#5B7A2F]/10 text-[#5B7A2F]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Website */}
                {inst.website && (
                  <a
                    href={inst.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5B7A2F] hover:underline"
                  >
                    <ExternalLink size={11} />
                    {lang === "pt" ? "Acessar site" : "Visit website"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
