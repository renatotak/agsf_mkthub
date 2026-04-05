"use client";

import { useState, useEffect, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { mockRegulatoryNorms } from "@/data/mock";
import { Badge } from "@/components/ui/Badge";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  ExternalLink, AlertTriangle, Calendar, BookOpen,
  ChevronDown, ChevronUp, Search, Clock, BarChart3, Filter,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── Constants ───

const BODY_STYLES: Record<string, { color: string; full: string; chartColor: string }> = {
  CMN: { color: "bg-[#1565C0] text-white", full: "Conselho Monetário Nacional", chartColor: "#1565C0" },
  BCB: { color: "bg-[#005CA9] text-white", full: "Banco Central do Brasil", chartColor: "#005CA9" },
  CVM: { color: "bg-[#2E7D32] text-white", full: "Comissão de Valores Mobiliários", chartColor: "#2E7D32" },
  MAPA: { color: "bg-[#E65100] text-white", full: "Ministério da Agricultura", chartColor: "#E65100" },
};

const IMPACT_BADGE: Record<string, { variant: "error" | "warning" | "default"; pt: string; en: string }> = {
  high: { variant: "error", pt: "Alto Impacto", en: "High Impact" },
  medium: { variant: "warning", pt: "Médio", en: "Medium" },
  low: { variant: "default", pt: "Baixo", en: "Low" },
};

const NORM_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  resolucao: { pt: "Resolução", en: "Resolution" },
  circular: { pt: "Circular", en: "Circular" },
  instrucao_normativa: { pt: "Instrução Normativa", en: "Normative Instruction" },
  decreto: { pt: "Decreto", en: "Decree" },
  medida_provisoria: { pt: "Medida Provisória", en: "Provisional Measure" },
  portaria: { pt: "Portaria", en: "Ordinance" },
  outros: { pt: "Outros", en: "Other" },
};

const AREA_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  credito_rural: { pt: "Crédito Rural", en: "Rural Credit", color: "#1565C0" },
  cpr: { pt: "CPR", en: "CPR", color: "#005CA9" },
  cooperativas: { pt: "Cooperativas", en: "Cooperatives", color: "#2E7D32" },
  registro: { pt: "Registro", en: "Registry", color: "#00796B" },
  cra: { pt: "CRA", en: "CRA", color: "#4A148C" },
  lca: { pt: "LCA", en: "LCA", color: "#6A1B9A" },
  mercado_capitais: { pt: "Mercado de Capitais", en: "Capital Markets", color: "#283593" },
  revendas: { pt: "Revendas", en: "Resellers", color: "#E65100" },
  defensivos: { pt: "Defensivos", en: "Crop Protection", color: "#BF360C" },
  rastreabilidade: { pt: "Rastreabilidade", en: "Traceability", color: "#00695C" },
  seguro_rural: { pt: "Seguro Rural", en: "Rural Insurance", color: "#F57F17" },
  proagro: { pt: "PROAGRO", en: "PROAGRO", color: "#FF8F00" },
  provisionamento: { pt: "Provisionamento", en: "Provisioning", color: "#5D4037" },
  risco: { pt: "Risco", en: "Risk", color: "#C62828" },
  fiagro: { pt: "Fiagro", en: "Fiagro", color: "#1B5E20" },
  esg: { pt: "ESG", en: "ESG", color: "#2E7D32" },
  fundos: { pt: "Fundos", en: "Funds", color: "#4527A0" },
  sementes: { pt: "Sementes", en: "Seeds", color: "#558B2F" },
  financiamento: { pt: "Financiamento", en: "Financing", color: "#0277BD" },
  geral: { pt: "Geral", en: "General", color: "#616161" },
};

// ─── Component ───

export function RegulatoryFramework({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [norms, setNorms] = useState<any[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [bodyFilter, setBodyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [impactFilter, setImpactFilter] = useState("");

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(true);

  useEffect(() => {
    supabase.from("regulatory_norms").select("*").order("published_at", { ascending: false }).limit(100)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setNorms(data);
          setIsMock(false);
        } else {
          setNorms(mockRegulatoryNorms);
          setIsMock(true);
        }
        setLoading(false);
      });
  }, []);

  // ─── Computed Data ───

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return norms.filter((n) => {
      if (bodyFilter && n.body !== bodyFilter) return false;
      if (typeFilter && n.norm_type !== typeFilter) return false;
      if (impactFilter && n.impact_level !== impactFilter) return false;
      if (q) {
        const haystack = `${n.title} ${n.summary || ""} ${n.body} ${n.norm_number || ""} ${(n.affected_areas || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [norms, bodyFilter, typeFilter, impactFilter, search]);

  const highImpact = useMemo(() => norms.filter((n) => n.impact_level === "high"), [norms]);

  const upcomingEffective = useMemo(() => {
    const now = new Date();
    return norms
      .filter((n) => n.effective_at && new Date(n.effective_at) >= now)
      .sort((a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime())
      .slice(0, 5);
  }, [norms]);

  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    norms.forEach((n) => (n.affected_areas || []).forEach((a: string) => set.add(a)));
    return set.size;
  }, [norms]);

  // Chart data
  const bodyChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    norms.forEach((n) => { counts[n.body] = (counts[n.body] || 0) + 1; });
    return Object.entries(counts)
      .map(([body, count]) => ({ body, count, fill: BODY_STYLES[body]?.chartColor || "#6b7280" }))
      .sort((a, b) => b.count - a.count);
  }, [norms]);

  const areaChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    norms.forEach((n) => (n.affected_areas || []).forEach((a: string) => {
      counts[a] = (counts[a] || 0) + 1;
    }));
    return Object.entries(counts)
      .map(([area, count]) => ({
        area: AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area,
        count,
        fill: AREA_LABELS[area]?.color || "#6b7280",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [norms, lang]);

  // ─── Helpers ───

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">{tr.regulatory.title}</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.regulatory.subtitle}</p>
          </div>
          {isMock && <MockBadge />}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.totalNorms}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{norms.length}</p>
        </div>
        <div className="bg-error-light/30 rounded-lg border border-error-light/50 p-4">
          <p className="text-[10px] font-semibold text-error/70 uppercase">{tr.regulatory.highImpactCount}</p>
          <p className="text-[24px] font-bold text-error-dark mt-1">{highImpact.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-neutral-400" />
            <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.pendingEffective}</p>
          </div>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{upcomingEffective.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.areasAffected}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{uniqueAreas}</p>
        </div>
      </div>

      {/* Impact Alerts */}
      {highImpact.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-error" />
            {tr.regulatory.impactAlerts}
          </h3>
          <div className="space-y-2">
            {highImpact.slice(0, 3).map((norm) => (
              <div key={norm.id} className="bg-error-light border border-[#FFCDD2] rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                    <span className="text-[11px] text-neutral-500">{NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-error-dark">{norm.title}</p>
                  {norm.effective_at && (
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {tr.regulatory.effectiveAt}: {formatDate(norm.effective_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Effective Dates Timeline */}
      {upcomingEffective.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-4 flex items-center gap-1.5">
            <Calendar size={14} className="text-brand-primary" />
            {tr.regulatory.upcomingEffective}
          </h3>
          <div className="space-y-3">
            {upcomingEffective.map((norm) => {
              const days = daysUntil(norm.effective_at);
              const urgency = days <= 30 ? "text-error font-bold" : days <= 90 ? "text-amber-600 font-semibold" : "text-neutral-600";
              return (
                <div key={norm.id} className="flex items-center gap-4">
                  <div className="w-20 shrink-0 text-right">
                    <span className={`text-[13px] ${urgency}`}>
                      {days <= 0 ? tr.regulatory.overdue : `${days} ${tr.regulatory.daysLeft}`}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-neutral-200" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                      <span className="text-[12px] font-medium text-neutral-500">{norm.norm_number}</span>
                    </div>
                    <p className="text-[12px] text-neutral-700 truncate mt-0.5">{norm.title}</p>
                  </div>
                  <time className="text-[11px] text-neutral-400 shrink-0">{formatDate(norm.effective_at)}</time>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      <div className="mb-6">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 hover:text-neutral-700"
        >
          <BarChart3 size={14} className="text-brand-primary" />
          {tr.regulatory.analytics}
          {showCharts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Norms by Body */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.regulatory.normsByBody}</h4>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={bodyChartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="body" width={48} tick={{ fontSize: 12, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                    formatter={(value) => [value, lang === "pt" ? "Normas" : "Norms"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {bodyChartData.map((entry) => (
                      <Cell key={entry.body} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Norms by Area */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.regulatory.normsByArea}</h4>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={areaChartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="area" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                    formatter={(value) => [value, lang === "pt" ? "Normas" : "Norms"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {areaChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Quick Reference — Body Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(BODY_STYLES).map(([body, info]) => {
          const count = norms.filter((n) => n.body === body).length;
          return (
            <button key={body} onClick={() => setBodyFilter(bodyFilter === body ? "" : body)}
              className={`rounded-lg p-4 border text-left transition-all ${bodyFilter === body ? "border-brand-primary bg-brand-surface/50 shadow-[0_0_0_2px_rgba(91,122,47,0.15)]" : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${info.color}`}>{body}</span>
                <span className="text-[18px] font-bold text-neutral-900">{count}</span>
              </div>
              <p className="text-[11px] text-neutral-500 truncate">{info.full}</p>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr.regulatory.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
          <option value="">{tr.regulatory.allTypes}</option>
          {Object.entries(NORM_TYPE_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
          <option value="">{tr.regulatory.allImpacts}</option>
          <option value="high">{tr.regulatory.high}</option>
          <option value="medium">{tr.regulatory.medium}</option>
          <option value="low">{tr.regulatory.low}</option>
        </select>
        {bodyFilter && (
          <button onClick={() => setBodyFilter("")} className="px-3 py-2 rounded-md text-[12px] font-semibold bg-brand-primary text-white hover:bg-brand-dark transition-colors">
            {bodyFilter} &times;
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-[11px] text-neutral-400 mb-3">
        {filtered.length} {lang === "pt" ? "normas" : "norms"}
        {(search || bodyFilter || typeFilter || impactFilter) && ` (${lang === "pt" ? "filtrado" : "filtered"})`}
      </p>

      {/* Norms Feed */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-[14px] font-medium text-neutral-500">{tr.regulatory.noResults}</p>
          <p className="text-[12px] text-neutral-400 mt-1">{tr.regulatory.noResultsHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((norm) => {
            const impactInfo = IMPACT_BADGE[norm.impact_level] || IMPACT_BADGE.medium;
            const isExpanded = expandedId === norm.id;
            return (
              <div key={norm.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                      <span className="text-[12px] text-neutral-500 font-medium">
                        {NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}
                      </span>
                      <Badge variant={impactInfo.variant}>{lang === "pt" ? impactInfo.pt : impactInfo.en}</Badge>
                    </div>
                    <time className="text-[11px] text-neutral-400 whitespace-nowrap">
                      {formatDate(norm.published_at)}
                    </time>
                  </div>

                  <h3 className="font-semibold text-neutral-900 text-[14px] leading-snug mb-2">{norm.title}</h3>

                  {norm.summary && (
                    <p className={`text-[12px] text-neutral-600 leading-relaxed mb-3 ${!isExpanded ? "line-clamp-2" : ""}`}>
                      {norm.summary}
                    </p>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(norm.affected_areas || []).map((area: string) => (
                        <span key={area} className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-medium">
                          {AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 shrink-0">
                      {norm.effective_at && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {tr.regulatory.effectiveAt}: {formatDate(norm.effective_at)}
                        </span>
                      )}
                      {norm.source_url && (
                        <a href={norm.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-primary hover:text-brand-dark font-medium">
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {norm.summary && norm.summary.length > 120 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : norm.id)}
                          className="flex items-center gap-1 text-brand-primary hover:text-brand-dark font-medium"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {tr.regulatory.readMore}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
