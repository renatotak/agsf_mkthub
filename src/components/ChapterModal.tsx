"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { Module } from "@/components/Sidebar";
import {
  X, ChevronRight, BarChart3, Newspaper, Calendar,
  Scale, Store, Database, PenTool, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Loader2, ExternalLink, ShieldAlert
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// Phase 23-followup: widen chapter type so the Painel can also open a
// modal for "riskSignals" (the cross-vertical Diretório × RJ view).
// "riskSignals" is a pseudo-module that exists only for the modal —
// it's NOT in the Sidebar so the Module type from Sidebar.tsx stays
// untouched. The CTA "Ver Módulo Completo" maps it to "retailers".
export type ChapterTarget = Module | "riskSignals";

interface ChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: ChapterTarget | null;
  lang: Lang;
  // The CTA accepts a real Module (where the user navigates). The caller
  // is responsible for mapping pseudo-modules like "riskSignals" → real
  // chapter targets like "retailers" before calling.
  onCTA: (m: Module) => void;
}

export function ChapterModal({ isOpen, onClose, chapter, lang, onCTA }: ChapterModalProps) {
  const tr = t(lang);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chapter) {
      fetchChapterInsights(chapter);
    } else {
      setData([]);
    }
  }, [isOpen, chapter]);

  // Phase 23-followup: close on Esc key for keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const fetchChapterInsights = async (mod: ChapterTarget) => {
    setLoading(true);
    try {
      if (mod === "market") {
        const res = await fetch("/api/prices-na");
        const json = await res.json();
        if (json.success && json.data) {
          const allItems: any[] = [];
          json.data.forEach((c: any) => {
            (c.items || []).forEach((it: any) => {
              if (it.variation) {
                allItems.push({
                  name: `${c.commodity} (${it.label})`,
                  price: it.price,
                  change: parseFloat(it.variation.replace(",", ".").replace("%", "")),
                });
              }
            });
          });
          setData(allItems.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5));
        }
      } else if (mod === "news") {
        const { data: news } = await supabase
          .from("agro_news")
          .select("title, source_name, published_at, category")
          .order("published_at", { ascending: false })
          .limit(5);
        setData(news || []);
      } else if (mod === "events") {
        // Phase 23-followup: was using /api/events-na (live AgroAgenda
        // proxy that returns the AgroEvent shape) AND rendering it.titulo
        // / it.localidade which DON'T EXIST in that shape — every card
        // showed an empty title and today's date. Now uses /api/events-db
        // (the unified Supabase events table from Phase 23A).
        const res = await fetch("/api/events-db");
        const json = await res.json();
        if (json.success && json.data) {
          const today = new Date().toISOString().slice(0, 10);
          setData(
            (json.data as any[])
              .filter((e) => e.dataInicio && e.dataInicio >= today)
              .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
              .slice(0, 5),
          );
        }
      } else if (mod === "recuperacao") {
        // Phase 23-followup: column names were wrong (company_name +
        // debt_amount) — Supabase JS returned an error and the modal
        // showed "Nenhum destaque". The actual columns are entity_name
        // + debt_value (verified via Supabase MCP).
        const { data: rj } = await supabase
          .from("recuperacao_judicial")
          .select("entity_name, state, debt_value, filing_date")
          .order("filing_date", { ascending: false })
          .limit(5);
        setData(rj || []);
      } else if (mod === "riskSignals") {
        // Phase 23-followup: NEW pseudo-module that renders the cross-
        // vertical Diretório × RJ view via the v_retailers_in_rj view
        // (created in mig 015 / 017). Top 5 distressed retailers by
        // debt — the same surface RiskSignals.tsx already shows on the
        // dashboard, but in modal form when the user clicks the
        // dashboard KPI card.
        const { data: rj } = await supabase
          .from("v_retailers_in_rj")
          .select("nome_fantasia, razao_social, rj_state, rj_debt_value, rj_filing_date, rj_status, classificacao")
          .order("rj_debt_value", { ascending: false })
          .limit(5);
        setData(rj || []);
      } else if (mod === "retailers") {
        // Show count by top 5 states
        const { data: stats } = await supabase
          .from("retailers")
          .select("state");
        if (stats) {
          const counts: Record<string, number> = {};
          stats.forEach(s => { if (s.state) counts[s.state] = (counts[s.state] || 0) + 1; });
          const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([state, count]) => ({ state, count }));
          setData(sorted);
        }
      } else if (mod === "dataSources") {
        const { data: logs } = await supabase
          .from("sync_logs")
          .select("source, status, started_at")
          .order("started_at", { ascending: false })
          .limit(100);
        if (logs) {
          const latest = new Map<string, any>();
          logs.forEach(l => { if (!latest.has(l.source)) latest.set(l.source, l); });
          setData([...latest.values()].filter(l => l.status === "error").slice(0, 5));
        }
      } else if (mod === "contentHub") {
        const { data: articles } = await supabase
          .from("content_articles")
          .select("title, status, published_at, channel")
          .order("published_at", { ascending: false })
          .limit(3);
        setData(articles || []);
      }
    } catch (err) {
      console.error("Error fetching chapter insights:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !chapter) return null;

  const getChapterTitle = () => {
    if (chapter === "dashboard") return lang === "pt" ? "Painel Executivo" : "Executive Dashboard";
    if (chapter === "settings") return lang === "pt" ? "Configurações" : "Settings";
    if (chapter === "riskSignals") return lang === "pt" ? "Sinais de Risco" : "Risk Signals";

    // Map existing translations
    const keysMap: Record<string, keyof typeof tr.modules> = {
      market: "marketPulse",
      news: "news",
      events: "events",
      recuperacao: "recuperacao",
      retailers: "retailers",
      dataSources: "dataSources",
      contentHub: "contentHub",
    };
    const key = keysMap[chapter as string];
    return key ? tr.modules[key] : chapter;
  };

  const getChapterIcon = () => {
    switch(chapter) {
      case "market": return <BarChart3 className="text-brand-primary" size={24} />;
      case "news": return <Newspaper className="text-brand-primary" size={24} />;
      case "events": return <Calendar className="text-brand-primary" size={24} />;
      case "recuperacao": return <Scale className="text-error" size={24} />;
      case "retailers": return <Store className="text-brand-primary" size={24} />;
      case "dataSources": return <Database className="text-neutral-900" size={24} />;
      case "contentHub": return <PenTool className="text-brand-primary" size={24} />;
      case "riskSignals": return <ShieldAlert className="text-error" size={24} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-sm">
              {getChapterIcon()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 leading-tight">{getChapterTitle()}</h2>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                {lang === "pt" ? "Destaques do Capítulo" : "Chapter Highlights"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200/50 rounded-full text-neutral-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <h3 className="text-[14px] font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-primary" />
            {lang === "pt" ? "O que é importante agora:" : "What's important now:"}
          </h3>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-neutral-400">
              <Loader2 size={24} className="animate-spin text-brand-primary" />
              <span className="text-[12px] font-medium">{lang === "pt" ? "Sincronizando destaques..." : "Syncing highlights..."}</span>
            </div>
          ) : data.length > 0 ? (
            <div className="space-y-3">
              {chapter === "market" && data.map((it, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 bg-neutral-50/30">
                  <span className="text-[13px] font-semibold text-neutral-800">{it.name}</span>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-neutral-900">{it.price}</p>
                    <p className={`text-[11px] font-bold ${it.change >= 0 ? "text-success-dark" : "text-error"}`}>
                      {it.change > 0 ? "+" : ""}{it.change.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}

              {chapter === "news" && data.map((it, i) => (
                <div key={i} className="p-3 rounded-xl border border-neutral-100 bg-neutral-50/30">
                  <p className="text-[13px] font-semibold text-neutral-900 leading-snug line-clamp-2">{it.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-2">
                    <span className="font-bold text-brand-primary uppercase">{it.category}</span>
                    <span>•</span>
                    <span>{it.source_name}</span>
                  </p>
                </div>
              ))}

              {chapter === "events" && data.map((it, i) => {
                // Phase 23-followup: render the correct AgroEvent shape
                // (was using it.titulo / it.localidade — fields that don't
                // exist in the API response, hence the empty cards bug).
                const d = new Date(it.dataInicio + "T12:00:00");
                const valid = !Number.isNaN(d.getTime());
                const location = [it.cidade, it.estado].filter(Boolean).join(", ");
                return (
                  <div key={i} className="p-3 rounded-xl border border-neutral-100 bg-neutral-50/30 flex gap-4">
                    <div className="w-12 h-12 bg-white rounded-lg border border-neutral-200 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-error uppercase leading-none">
                        {valid ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") : "—"}
                      </span>
                      <span className="text-[18px] font-black text-neutral-900 leading-none mt-0.5">
                        {valid ? d.getDate() : "—"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-neutral-900 leading-tight line-clamp-2">{it.nome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {location && <p className="text-[11px] text-neutral-500">{location}</p>}
                        {it.source_name && (
                          <span className="text-[9px] font-bold px-1 py-0 rounded bg-neutral-100 text-neutral-600 uppercase">
                            {it.source_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {chapter === "recuperacao" && data.map((it, i) => (
                <div key={i} className="p-3 rounded-xl border border-neutral-100 bg-neutral-50/30">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <span className="text-[13px] font-bold text-neutral-900 line-clamp-1 flex-1">{it.entity_name}</span>
                    <span className="text-[10px] font-bold bg-error/10 text-error px-1.5 py-0.5 rounded uppercase shrink-0">{it.state || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-neutral-600">
                    <span>
                      {lang === "pt" ? "Dívida:" : "Debt:"}{" "}
                      <span className="font-mono font-bold text-neutral-900">
                        {it.debt_value
                          ? new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(it.debt_value))
                          : "—"}
                      </span>
                    </span>
                    {it.filing_date && (
                      <span className="text-[10px] text-neutral-400">
                        {new Date(it.filing_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {chapter === "riskSignals" && data.map((it, i) => (
                <div key={i} className="p-3 rounded-xl border border-error/20 bg-error/5">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <span className="text-[13px] font-bold text-neutral-900 line-clamp-1 flex-1">
                      {it.nome_fantasia || it.razao_social}
                    </span>
                    <span className="text-[10px] font-bold bg-error/10 text-error px-1.5 py-0.5 rounded uppercase shrink-0">
                      {it.rj_state || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-neutral-600">
                    <span>
                      {lang === "pt" ? "Exposição:" : "Exposure:"}{" "}
                      <span className="font-mono font-bold text-neutral-900">
                        {it.rj_debt_value
                          ? new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(it.rj_debt_value))
                          : "—"}
                      </span>
                    </span>
                    {it.classificacao && it.classificacao !== "0" && (
                      <span className="text-[10px] font-bold px-1.5 py-0 rounded bg-neutral-200 text-neutral-700 uppercase">
                        {lang === "pt" ? "Classe" : "Class"} {it.classificacao}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {chapter === "retailers" && data.map((it, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 bg-neutral-50/30">
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] font-black text-brand-primary w-6">{it.state}</span>
                    <span className="text-[13px] font-semibold text-neutral-800">{lang === "pt" ? "Revendas & Canais" : "Retailers & Channels"}</span>
                  </div>
                  <span className="text-[13px] font-bold text-neutral-900">{it.count}</span>
                </div>
              ))}

              {chapter === "dataSources" && data.length > 0 && data.map((it, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-error/10 bg-error/5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className="text-error" />
                    <span className="text-[13px] font-semibold text-neutral-900">{it.source}</span>
                  </div>
                  <span className="text-[11px] font-bold text-error uppercase">{lang === "pt" ? "Erro na Sincronização" : "Sync Error"}</span>
                </div>
              ))}
              {chapter === "dataSources" && data.length === 0 && (
                 <div className="flex flex-col items-center justify-center py-6 text-center">
                    <CheckCircle2 size={32} className="text-success mb-2" />
                    <p className="text-[13px] font-semibold text-neutral-900">{lang === "pt" ? "Todas as fontes operacionais" : "All sources operational"}</p>
                    <p className="text-[11px] text-neutral-500 mt-1">{lang === "pt" ? "Nenhum erro de sincronização detectado" : "No sync errors detected"}</p>
                 </div>
              )}

              {chapter === "contentHub" && data.map((it, i) => (
                <div key={i} className="p-3 rounded-xl border border-neutral-100 bg-neutral-50/30">
                  <p className="text-[13px] font-semibold text-neutral-900 line-clamp-1">{it.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-2">
                    <span className="font-bold text-brand-primary">{it.channel}</span>
                    <span>•</span>
                    <span className="capitalize">{it.status}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-[13px] text-neutral-400">{lang === "pt" ? "Nenhum destaque disponível para este capítulo." : "No highlights available for this chapter."}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-neutral-100 bg-neutral-50/30 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            {lang === "pt" ? "Fechar" : "Close"}
          </button>
          <button
            onClick={() => onCTA(chapter === "riskSignals" ? "retailers" : (chapter as Module))}
            className="flex-[2] px-4 py-2.5 rounded-xl bg-brand-primary text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20"
          >
            {lang === "pt" ? "Ver Módulo Completo" : "View Full Module"}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
