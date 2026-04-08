"use client";

/**
 * Phase 24A — CRM-focused indicator row for the Diretório de Canais.
 *
 * Replaces the old static row of (Total / Distribuidores / Cooperativas /
 * Estados) with four CRM-relevant cards:
 *
 *   1. Total Channels + horizontal mini-bar by `grupo_acesso`
 *   2. Cities with channels + top 5 by share
 *   3. In Recuperação Judicial → click opens RJ detail modal (uses the
 *      existing RiskSignals component in expanded mode)
 *   4. Mentioned in news → click opens NewsMentionsModal
 *
 * Data comes from /api/retailers/kpi-summary in a single fetch.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Store, MapPin, AlertTriangle, Newspaper, X, ChevronRight, Loader2, ExternalLink } from "lucide-react";
import { RiskSignals } from "@/components/RiskSignals";

interface KpiSummary {
  total: number;
  byGroupCount: Record<string, number>;
  cityCount: number;
  topCities: { municipio: string; uf: string; count: number }[];
  inRjCount: number;
  inRjExposure: number;
  mentionedInNewsCount: number;
  recentMentionsPreview: {
    entity_uid: string;
    news_id: string;
    news_title: string | null;
    source_name: string | null;
    published_at: string | null;
    retailer_name: string | null;
  }[];
}

const GROUP_COLORS: Record<string, string> = {
  DISTRIBUIDOR: "#5B7A2F",
  COOPERATIVA: "#1565C0",
  "CANAL RD": "#E8722A",
  PLATAFORMA: "#9E9E9E",
  INDUSTRIA: "#7B5EA0",
};

function fmtBRL(value: number): string {
  if (value >= 1e9) return `R$ ${(value / 1e9).toFixed(1)} bi`;
  if (value >= 1e6) return `R$ ${(value / 1e6).toFixed(1)} mi`;
  if (value >= 1e3) return `R$ ${(value / 1e3).toFixed(0)} mil`;
  return `R$ ${value.toFixed(0)}`;
}

export function RetailerKpiRow({ lang }: { lang: Lang }) {
  const [data, setData] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<"rj" | "news" | null>(null);

  useEffect(() => {
    fetch("/api/retailers/kpi-summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-neutral-200 h-[112px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6 text-[12px] text-neutral-500">
        {lang === "pt" ? "Não foi possível carregar os indicadores." : "Failed to load indicators."}
      </div>
    );
  }

  // Sort grupo entries by count desc for the mini-bar
  const groupEntries = Object.entries(data.byGroupCount)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n > 0);
  const groupTotal = groupEntries.reduce((s, [, n]) => s + n, 0) || 1;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* CARD 1 — Total Channels + bar by grupo_acesso */}
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? "Total Canais" : "Total Channels"}
              </p>
              <p className="text-[24px] font-bold text-neutral-900 mt-1 leading-none">
                {data.total.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-brand-surface text-brand-primary flex items-center justify-center shrink-0">
              <Store size={18} />
            </div>
          </div>
          {/* Mini horizontal bar by grupo */}
          <div className="mt-3">
            <div className="flex w-full h-2 rounded-full overflow-hidden bg-neutral-100">
              {groupEntries.map(([grupo, n]) => (
                <div
                  key={grupo}
                  className="h-full"
                  style={{
                    width: `${(n / groupTotal) * 100}%`,
                    backgroundColor: GROUP_COLORS[grupo] || "#9E9E9E",
                  }}
                  title={`${grupo}: ${n.toLocaleString()}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-neutral-500">
              {groupEntries.slice(0, 3).map(([grupo, n]) => (
                <span key={grupo} className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: GROUP_COLORS[grupo] || "#9E9E9E" }}
                  />
                  {grupo} {((n / groupTotal) * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CARD 2 — Cities */}
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? "Cidades" : "Cities"}
              </p>
              <p className="text-[24px] font-bold text-neutral-900 mt-1 leading-none">
                {data.cityCount.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-info-light text-info-dark flex items-center justify-center shrink-0">
              <MapPin size={18} />
            </div>
          </div>
          <p className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider mt-3 mb-1">
            {lang === "pt" ? "Top concentração" : "Top concentration"}
          </p>
          <div className="space-y-0.5">
            {data.topCities.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-700 truncate">
                  {c.municipio}/{c.uf}
                </span>
                <span className="text-neutral-500 font-semibold tabular-nums shrink-0 ml-2">
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CARD 3 — In Recuperação Judicial */}
        <button
          type="button"
          onClick={() => setOpenModal("rj")}
          className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-error-light hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? "Em Recuperação Judicial" : "In Judicial Recovery"}
              </p>
              <p className="text-[24px] font-bold text-error mt-1 leading-none">
                {data.inRjCount}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-error-light text-error flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
          </div>
          <p className="text-[11px] text-neutral-600 mt-3">
            {lang === "pt" ? "Exposição total" : "Total exposure"}{" "}
            <span className="font-bold text-error">{fmtBRL(data.inRjExposure)}</span>
          </p>
          <p className="flex items-center gap-1 text-[10px] text-brand-primary uppercase font-semibold tracking-wider mt-1 group-hover:gap-2 transition-all">
            {lang === "pt" ? "Ver detalhes" : "View details"} <ChevronRight size={12} />
          </p>
        </button>

        {/* CARD 4 — Mentioned in news */}
        <button
          type="button"
          onClick={() => setOpenModal("news")}
          className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? "Mencionados em Notícias" : "Mentioned in News"}
              </p>
              <p className="text-[24px] font-bold text-neutral-900 mt-1 leading-none">
                {data.mentionedInNewsCount}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-warning-light text-warning-dark flex items-center justify-center shrink-0">
              <Newspaper size={18} />
            </div>
          </div>
          <p className="text-[11px] text-neutral-600 mt-3">
            {data.recentMentionsPreview.length > 0
              ? lang === "pt"
                ? `${data.recentMentionsPreview.length} menções recentes`
                : `${data.recentMentionsPreview.length} recent mentions`
              : lang === "pt"
                ? "Sem menções recentes"
                : "No recent mentions"}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-brand-primary uppercase font-semibold tracking-wider mt-1 group-hover:gap-2 transition-all">
            {lang === "pt" ? "Ver detalhes" : "View details"} <ChevronRight size={12} />
          </p>
        </button>
      </div>

      {/* RJ modal — full RiskSignals expanded view */}
      {openModal === "rj" && (
        <KpiModal
          title={lang === "pt" ? "Canais em Recuperação Judicial" : "Channels in Judicial Recovery"}
          onClose={() => setOpenModal(null)}
        >
          <RiskSignals lang={lang} />
        </KpiModal>
      )}

      {/* News mentions modal */}
      {openModal === "news" && (
        <KpiModal
          title={lang === "pt" ? "Canais Mencionados em Notícias" : "Channels Mentioned in News"}
          onClose={() => setOpenModal(null)}
        >
          <NewsMentionsList lang={lang} mentions={data.recentMentionsPreview} />
        </KpiModal>
      )}
    </>
  );
}

// ─── Modal shell (matches the ChapterModal aesthetic) ────────────────────────

function KpiModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h3 className="text-[15px] font-bold text-neutral-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── News mentions list ──────────────────────────────────────────────────────

function NewsMentionsList({
  lang,
  mentions,
}: {
  lang: Lang;
  mentions: KpiSummary["recentMentionsPreview"];
}) {
  if (mentions.length === 0) {
    return (
      <p className="text-center py-12 text-neutral-400 text-sm">
        {lang === "pt"
          ? "Nenhuma menção encontrada ainda. Aguarde a próxima execução do matcher."
          : "No mentions found yet. Wait for the next matcher run."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {mentions.map((m, i) => (
        <div
          key={`${m.news_id}-${i}`}
          className="border border-neutral-200 rounded-md p-3 hover:border-brand-primary/40 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {m.retailer_name && (
                <p className="text-[11px] font-semibold text-brand-primary uppercase tracking-wider mb-0.5">
                  {m.retailer_name}
                </p>
              )}
              <p className="text-[13px] font-semibold text-neutral-900 leading-snug">
                {m.news_title || (lang === "pt" ? "(sem título)" : "(no title)")}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-500">
                {m.source_name && <span>{m.source_name}</span>}
                {m.published_at && (
                  <span>
                    {new Date(m.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
