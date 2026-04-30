"use client";

import { useState, useEffect } from "react";
import { translations, Lang } from "@/lib/i18n";
import {
  FileText, TrendingUp, TrendingDown, Scale, AlertTriangle,
  Calendar, Activity, ChevronDown, ChevronUp, Loader2, RefreshCw,
} from "lucide-react";

interface Briefing {
  briefing_date: string;
  generated_at: string;
  executive_summary: string | null;
  theme: string | null;
  market_moves: { commodity: string; price: number; change_pct: number; unit: string }[];
  top_news: { title: string; summary: string; category: string; source: string; url?: string }[];
  regulatory_updates: { title: string; body: string; impact: string; areas: string[] }[];
  rj_alerts: { company: string; cnpj: string }[];
  upcoming_events: { name: string; date: string; location: string }[];
  price_ruptures: { commodity: string; price: number; change_pct: number; sigma: number; stddev: number; unit: string }[];
  source_health: { total: number; healthy: number; error: number };
}

interface PersonaBriefing {
  briefing_date: string;
  persona: string;
  generated_at: string;
  summary: string | null;
  highlights: { title: string; body: string; priority: string }[];
  model_used: string | null;
  cached?: boolean;
}

type PersonaId = "ceo" | "head_comercial" | "head_credito" | "marketing";

const PERSONA_TABS: { id: PersonaId; labelKey: "ceo" | "comercial" | "credito" | "marketing" }[] = [
  { id: "ceo",            labelKey: "ceo" },
  { id: "head_comercial", labelKey: "comercial" },
  { id: "head_credito",   labelKey: "credito" },
  { id: "marketing",      labelKey: "marketing" },
];

const THEME_LABELS: Record<string, { pt: string; en: string }> = {
  commodities:           { pt: "Commodities",                en: "Commodities" },
  regulatory:            { pt: "Regulatório",                en: "Regulatory" },
  competitors:           { pt: "Concorrentes",               en: "Competitors" },
  content_opportunities: { pt: "Oport. Conteúdo",            en: "Content Opps" },
  weekly_recap:          { pt: "Recap Semanal",               en: "Weekly Recap" },
  market_outlook:        { pt: "Perspectiva Mercado",         en: "Market Outlook" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-50 border-red-200 text-red-700",
  medium: "bg-amber-50 border-amber-200 text-amber-700",
  low:    "bg-neutral-50 border-neutral-200 text-neutral-600",
};

export function ExecutiveBriefingWidget({ lang }: { lang: Lang }) {
  const t = translations[lang];
  const tp = t.personaBriefing;

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Persona tab state
  const [activeTab, setActiveTab] = useState<"general" | PersonaId>("general");
  const [personaCache, setPersonaCache] = useState<Partial<Record<PersonaId, PersonaBriefing | null>>>({});
  const [personaLoading, setPersonaLoading] = useState<PersonaId | null>(null);

  const fetchBriefing = () => {
    setLoading(true);
    fetch("/api/executive-briefing")
      .then((r) => r.json())
      .then((json) => {
        if (json.briefing) setBriefing(json.briefing);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(fetchBriefing, []);

  const fetchPersonaBriefing = (persona: PersonaId) => {
    if (personaCache[persona] !== undefined) return; // already fetched or attempted
    const date = briefing?.briefing_date || new Date().toISOString().slice(0, 10);
    setPersonaLoading(persona);
    fetch(`/api/persona-briefing?date=${date}&persona=${persona}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setPersonaCache((prev) => ({ ...prev, [persona]: null }));
        } else {
          setPersonaCache((prev) => ({ ...prev, [persona]: json as PersonaBriefing }));
        }
      })
      .catch(() => {
        setPersonaCache((prev) => ({ ...prev, [persona]: null }));
      })
      .finally(() => setPersonaLoading(null));
  };

  const handleTabClick = (tab: "general" | PersonaId) => {
    setActiveTab(tab);
    if (tab !== "general" && personaCache[tab] === undefined) {
      fetchPersonaBriefing(tab);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!briefing) return null;

  const dateLabel = new Date(briefing.briefing_date + "T12:00:00").toLocaleDateString(
    lang === "pt" ? "pt-BR" : "en-US",
    { weekday: "long", day: "numeric", month: "long" },
  );

  const generatedTime = new Date(briefing.generated_at).toLocaleTimeString(
    lang === "pt" ? "pt-BR" : "en-US",
    { hour: "2-digit", minute: "2-digit" },
  );

  const hasMoves    = briefing.market_moves?.length > 0;
  const hasNews     = briefing.top_news?.length > 0;
  const hasRegs     = briefing.regulatory_updates?.length > 0;
  const hasRJ       = briefing.rj_alerts?.length > 0;
  const hasEvents   = briefing.upcoming_events?.length > 0;
  const hasRuptures = briefing.price_ruptures?.length > 0;

  // Active persona data
  const activePersona     = activeTab !== "general" ? activeTab : null;
  const activePersonaData = activePersona ? personaCache[activePersona] : undefined;
  const isPersonaLoading  = activePersona && personaLoading === activePersona;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
            <FileText size={16} className="text-brand-primary" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2 flex-wrap">
              {lang === "pt" ? "Briefing Executivo" : "Executive Briefing"}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase">
                {dateLabel}
              </span>
              {briefing.theme && THEME_LABELS[briefing.theme] && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                  {lang === "pt" ? THEME_LABELS[briefing.theme].pt : THEME_LABELS[briefing.theme].en}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-neutral-400">
              {lang === "pt" ? `Gerado às ${generatedTime}` : `Generated at ${generatedTime}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBriefing}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title={lang === "pt" ? "Atualizar" : "Refresh"}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Persona Tabs */}
      <div className="px-5 pt-3 pb-0 flex items-center gap-1 flex-wrap">
        {/* General tab */}
        <button
          onClick={() => handleTabClick("general")}
          className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
            activeTab === "general"
              ? "bg-brand-primary text-white border-brand-primary"
              : "bg-white text-neutral-500 border-neutral-200 hover:border-brand-primary hover:text-brand-primary"
          }`}
        >
          {tp.general}
        </button>
        {PERSONA_TABS.map(({ id, labelKey }) => (
          <button
            key={id}
            onClick={() => handleTabClick(id)}
            className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
              activeTab === id
                ? "bg-brand-primary text-white border-brand-primary"
                : "bg-white text-neutral-500 border-neutral-200 hover:border-brand-primary hover:text-brand-primary"
            }`}
          >
            {tp[labelKey]}
          </button>
        ))}
      </div>

      {/* ── GENERAL TAB ── */}
      {activeTab === "general" && (
        <>
          {/* Executive Summary — always visible */}
          {briefing.executive_summary && (
            <div className="px-5 py-4">
              <p className="text-[12px] text-neutral-700 leading-relaxed whitespace-pre-line">
                {expanded
                  ? briefing.executive_summary
                  : briefing.executive_summary.slice(0, 300) + (briefing.executive_summary.length > 300 ? "…" : "")}
              </p>
            </div>
          )}

          {/* Quick Stats Strip */}
          <div className="px-5 pb-3 flex flex-wrap gap-3">
            {hasMoves && briefing.market_moves.slice(0, 3).map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                {m.change_pct >= 0
                  ? <TrendingUp size={12} className="text-success-dark" />
                  : <TrendingDown size={12} className="text-error" />}
                <span className="font-semibold text-neutral-700">{m.commodity}</span>
                <span className={m.change_pct >= 0 ? "text-success-dark font-bold" : "text-error font-bold"}>
                  {m.change_pct > 0 ? "+" : ""}{m.change_pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {hasRuptures && (
              <div className="flex items-center gap-1.5 text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Activity size={12} className="text-amber-600" />
                <span className="text-amber-700 font-bold">
                  {briefing.price_ruptures.length} {lang === "pt" ? "anomalia(s)" : "anomaly(ies)"}
                </span>
              </div>
            )}
            {hasRegs && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Scale size={12} className="text-blue-600" />
                <span className="text-neutral-600">
                  {briefing.regulatory_updates.length} {lang === "pt" ? "norma(s)" : "norm(s)"}
                </span>
              </div>
            )}
            {hasRJ && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <AlertTriangle size={12} className="text-error" />
                <span className="text-neutral-600">
                  {briefing.rj_alerts.length} {lang === "pt" ? "novo(s) RJ" : "new RJ"}
                </span>
              </div>
            )}
            {hasEvents && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Calendar size={12} className="text-amber-600" />
                <span className="text-neutral-600">
                  {briefing.upcoming_events.length} {lang === "pt" ? "evento(s)" : "event(s)"}
                </span>
              </div>
            )}
            {briefing.source_health && (
              <div className="flex items-center gap-1.5 text-[11px] ml-auto">
                <Activity size={12} className={briefing.source_health.error > 0 ? "text-error" : "text-success-dark"} />
                <span className="text-neutral-400">
                  {briefing.source_health.healthy}/{briefing.source_health.total} {lang === "pt" ? "fontes OK" : "sources OK"}
                </span>
              </div>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="px-5 pb-5 space-y-4 border-t border-neutral-100 pt-4">
              {/* Price Anomalies */}
              {hasRuptures && (
                <div>
                  <h4 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Activity size={12} />
                    {lang === "pt" ? "Anomalias de Preço" : "Price Anomalies"}
                  </h4>
                  <div className="space-y-1.5">
                    {briefing.price_ruptures.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] bg-amber-50/50 border border-amber-100 rounded px-2.5 py-1.5">
                        <span className="font-bold text-amber-700">{r.sigma}σ</span>
                        <span className="font-semibold text-neutral-800">{r.commodity}</span>
                        <span className={r.change_pct >= 0 ? "text-success-dark font-bold" : "text-error font-bold"}>
                          {r.change_pct > 0 ? "+" : ""}{r.change_pct.toFixed(1)}%
                        </span>
                        <span className="text-neutral-400">
                          (avg: {r.stddev.toFixed(1)}% stddev)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top News */}
              {hasNews && (
                <div>
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Principais Notícias" : "Top News"}
                  </h4>
                  <div className="space-y-2">
                    {briefing.top_news.slice(0, 5).map((n, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[9px] font-bold text-neutral-400 mt-0.5 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-neutral-800 truncate">
                            {n.url
                              ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary">{n.title}</a>
                              : n.title}
                          </p>
                          {n.category && <span className="text-[9px] text-neutral-400 uppercase">{n.category}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regulatory Updates */}
              {hasRegs && (
                <div>
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Atualizações Regulatórias" : "Regulatory Updates"}
                  </h4>
                  <div className="space-y-1.5">
                    {briefing.regulatory_updates.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.impact === "high" ? "bg-error-light text-error-dark" : "bg-neutral-100 text-neutral-600"}`}>
                          {r.body}
                        </span>
                        <span className="text-neutral-700 truncate">{r.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Events */}
              {hasEvents && (
                <div>
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Eventos Próximos" : "Upcoming Events"}
                  </h4>
                  <div className="space-y-1.5">
                    {briefing.upcoming_events.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[9px] font-semibold text-amber-600 shrink-0">{e.date}</span>
                        <span className="text-neutral-700 truncate">{e.name}</span>
                        {e.location && <span className="text-neutral-400 shrink-0">· {e.location}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RJ Alerts */}
              {hasRJ && (
                <div>
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Alertas RJ" : "RJ Alerts"}
                  </h4>
                  <div className="space-y-1">
                    {briefing.rj_alerts.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <AlertTriangle size={11} className="text-error shrink-0" />
                        <span className="text-neutral-700">{r.company}</span>
                        {r.cnpj && <span className="text-neutral-400 text-[10px]">{r.cnpj}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── PERSONA TABS ── */}
      {activeTab !== "general" && (
        <div className="px-5 py-4">
          {/* Loading skeleton */}
          {isPersonaLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-3 bg-neutral-100 rounded w-full" />
              <div className="h-3 bg-neutral-100 rounded w-5/6" />
              <div className="h-3 bg-neutral-100 rounded w-4/6" />
              <div className="mt-4 space-y-2">
                <div className="h-3 bg-neutral-100 rounded w-full" />
                <div className="h-3 bg-neutral-100 rounded w-3/4" />
              </div>
            </div>
          )}

          {/* No data / error state */}
          {!isPersonaLoading && activePersonaData === null && (
            <p className="text-[12px] text-neutral-400 italic">{tp.noData}</p>
          )}

          {/* Waiting for first fetch (undefined = not yet requested) */}
          {!isPersonaLoading && activePersonaData === undefined && (
            <div className="flex items-center gap-2 text-[12px] text-neutral-400">
              <Loader2 size={14} className="animate-spin" />
              {tp.generating}
            </div>
          )}

          {/* Rendered persona content */}
          {!isPersonaLoading && activePersonaData && (
            <div className="space-y-4">
              {/* Summary prose */}
              {activePersonaData.summary && (
                <p className="text-[12px] text-neutral-700 leading-relaxed whitespace-pre-line">
                  {activePersonaData.summary}
                </p>
              )}

              {/* Highlights list */}
              {activePersonaData.highlights && activePersonaData.highlights.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Destaques" : "Highlights"}
                  </h4>
                  <div className="space-y-2">
                    {activePersonaData.highlights.map((h, i) => (
                      <div
                        key={i}
                        className={`border rounded px-3 py-2 text-[11px] ${PRIORITY_COLORS[h.priority] || PRIORITY_COLORS.low}`}
                      >
                        <p className="font-semibold mb-0.5">{h.title}</p>
                        <p className="leading-relaxed opacity-90">{h.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer: model + cached indicator */}
              <p className="text-[10px] text-neutral-300 text-right">
                {activePersonaData.model_used}
                {activePersonaData.cached && " · cached"}
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
