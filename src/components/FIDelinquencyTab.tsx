"use client";

/**
 * Inadimplência tab for Instituições Financeiras.
 *
 * Renders 5 BCB SGS series:
 *   - 21082 inadimplencia_total       (system-wide benchmark)
 *   - 21084 inadimplencia_pf_total    (all-PF benchmark)
 *   - 21085 inadimplencia_pj_total    (all-PJ benchmark)
 *   - 21136 inadimplencia_rural_pj
 *   - 21148 inadimplencia_rural_pf
 *
 * Pure UI — pulls from `/api/fi/delinquency`. Algorithmic only, no LLM.
 */

import { useEffect, useMemo, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from "recharts";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Indicator =
  | "inadimplencia_total"
  | "inadimplencia_pf_total"
  | "inadimplencia_pj_total"
  | "inadimplencia_rural_pj"
  | "inadimplencia_rural_pf";

interface SeriesPoint { period: string; value: number; }
interface SeriesResponse {
  indicator: Indicator;
  bcb_sgs_code: number | null;
  label: string;
  points: SeriesPoint[];
  latest: { period: string; value: number } | null;
  yearAgo: { period: string; value: number } | null;
}

interface ApiResponse {
  success: boolean;
  series: SeriesResponse[];
  last_success_at: string | null;
}

type Period = "12" | "24" | "36" | "all";

// ─── Series styling — distinct colors, AgriSafe palette + Recharts categoricals ───

const SERIES_STYLE: Record<Indicator, { color: string; dashed: boolean; strokeWidth: number }> = {
  inadimplencia_rural_pj:  { color: "#5B7A2F", dashed: false, strokeWidth: 2.5 }, // primary green
  inadimplencia_rural_pf:  { color: "#7FA02B", dashed: false, strokeWidth: 2.5 }, // secondary green
  inadimplencia_total:     { color: "#3D382F", dashed: true,  strokeWidth: 1.5 }, // text-dark, benchmark
  inadimplencia_pj_total:  { color: "#1A73E8", dashed: true,  strokeWidth: 1.5 }, // blue benchmark PJ
  inadimplencia_pf_total:  { color: "#E8722A", dashed: true,  strokeWidth: 1.5 }, // warning, benchmark PF
};

// ─── Bilingual label resolver — pulls from i18n.financialInstitutions.* ──────

function getSeriesLabel(ind: Indicator, lang: Lang): string {
  const fi = ((t(lang) as unknown) as { financialInstitutions?: Record<string, string> }).financialInstitutions || {};
  switch (ind) {
    case "inadimplencia_total":     return fi.delinquencySeriesTotal    || "System-wide total";
    case "inadimplencia_pf_total":  return fi.delinquencySeriesPfTotal  || "PF total (system)";
    case "inadimplencia_pj_total":  return fi.delinquencySeriesPjTotal  || "PJ total (system)";
    case "inadimplencia_rural_pj":  return fi.delinquencySeriesRuralPj  || "Rural PJ";
    case "inadimplencia_rural_pf":  return fi.delinquencySeriesRuralPf  || "Rural PF";
  }
}

// ─── Period selector chip ────────────────────────────────────────────────────

function PeriodChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
        active
          ? "bg-[#5B7A2F] text-white"
          : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

// ─── KPI card per series ─────────────────────────────────────────────────────

function DelinquencyKpiCard({
  series, lang,
}: { series: SeriesResponse; lang: Lang }) {
  const latest = series.latest;
  const yearAgo = series.yearAgo;
  const delta = latest && yearAgo ? latest.value - yearAgo.value : null;

  const deltaIcon = delta == null ? <Minus size={12} />
    : delta > 0 ? <TrendingUp size={12} />
    : delta < 0 ? <TrendingDown size={12} />
    : <Minus size={12} />;

  const deltaColor = delta == null ? "text-neutral-400"
    : delta > 0.05 ? "text-red-600"        // delinquency rising = bad
    : delta < -0.05 ? "text-green-700"     // delinquency falling = good
    : "text-neutral-500";

  const style = SERIES_STYLE[series.indicator];
  const label = getSeriesLabel(series.indicator, lang);

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: style.color }}
          aria-hidden
        />
        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-bold text-neutral-900">
          {latest ? `${latest.value.toFixed(2)}%` : "—"}
        </span>
        {delta != null && (
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${deltaColor}`}>
            {deltaIcon}
            {delta > 0 ? "+" : ""}{delta.toFixed(2)} pp
          </span>
        )}
      </div>
      <div className="text-[10px] text-neutral-400 mt-1 flex items-center justify-between">
        <span>{latest?.period ?? "—"}</span>
        <span className="font-mono">SGS {series.bcb_sgs_code}</span>
      </div>
    </div>
  );
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  color?: string;
  name?: string;
}

function ChartTooltip({
  active, payload, label, lang,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  lang: Lang;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-neutral-200 rounded-md shadow-md px-3 py-2 text-[11px]">
      <div className="font-semibold text-neutral-900 mb-1">{label}</div>
      <div className="space-y-0.5">
        {payload
          .filter((p) => typeof p.value === "number")
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((p, i) => {
            const ind = p.dataKey as Indicator;
            const knownIndicators: Indicator[] = [
              "inadimplencia_total",
              "inadimplencia_pf_total",
              "inadimplencia_pj_total",
              "inadimplencia_rural_pj",
              "inadimplencia_rural_pf",
            ];
            const seriesLabel = knownIndicators.includes(ind)
              ? getSeriesLabel(ind, lang)
              : String(p.name ?? ind);
            return (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                />
                <span className="text-neutral-600">{seriesLabel}:</span>
                <span className="font-semibold text-neutral-900 ml-auto">
                  {(p.value as number).toFixed(2)}%
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── Main tab component ──────────────────────────────────────────────────────

export function FIDelinquencyTab({ lang }: { lang: Lang }) {
  const fi = ((t(lang) as unknown) as { financialInstitutions?: Record<string, string> }).financialInstitutions || {};
  const [period, setPeriod] = useState<Period>("24");
  const [series, setSeries] = useState<SeriesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<Indicator>>(new Set());
  const [lastSync, setLastSync] = useState<string | null>(null);

  const errMsg = fi.delinquencyError || "Failed to load series.";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/fi/delinquency?months=${period}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setSeries(json.series ?? []);
          setLastSync(json.last_success_at ?? null);
        } else {
          setError(errMsg);
        }
      })
      .catch(() => {
        if (!cancelled) setError(errMsg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, errMsg]);

  // Reshape: { period: "2024-01", inadimplencia_rural_pj: 4.2, ... }
  const chartData = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number | string>>();
    for (const s of series) {
      for (const pt of s.points) {
        const row = byPeriod.get(pt.period) ?? { period: pt.period };
        row[s.indicator] = pt.value;
        byPeriod.set(pt.period, row);
      }
    }
    return [...byPeriod.values()].sort((a, b) =>
      String(a.period).localeCompare(String(b.period))
    );
  }, [series]);

  const toggleSeries = (ind: Indicator) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  };

  const formatXTick = (val: string): string => {
    if (!val || typeof val !== "string") return val;
    const [year, month] = val.split("-");
    if (!year || !month) return val;
    const monthLabel = lang === "pt"
      ? ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][parseInt(month, 10) - 1]
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(month, 10) - 1];
    return `${monthLabel}/${year.slice(2)}`;
  };

  const periodLabel = (p: Period): string => {
    if (p === "all") return fi.delinquencyPeriodAll || (lang === "pt" ? "Tudo" : "All");
    return `${p}m`;
  };

  return (
    <div className="space-y-5">
      {/* Period selector + caption */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold text-neutral-900">
            {fi.delinquencyTitle || "Rural Credit Delinquency — BCB SGS"}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {fi.delinquencySubtitle || "% of portfolio more than 90 days overdue. 5 series from the Central Bank."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(["12", "24", "36", "all"] as Period[]).map((p) => (
            <PeriodChip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {periodLabel(p)}
            </PeriodChip>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-neutral-400" />
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center text-[13px] text-neutral-500">{error}</div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="py-16 text-center text-[13px] text-neutral-500">
            {fi.delinquencyEmpty || "No data for the selected period."}
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <>
            {/* Legend chips — toggleable */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {series.map((s) => {
                const style = SERIES_STYLE[s.indicator];
                const isHidden = hidden.has(s.indicator);
                return (
                  <button
                    key={s.indicator}
                    onClick={() => toggleSeries(s.indicator)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                      isHidden
                        ? "bg-neutral-50 border-neutral-200 text-neutral-400"
                        : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300"
                    }`}
                    title={`BCB SGS ${s.bcb_sgs_code}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: isHidden ? "#D1D5DB" : style.color,
                        border: style.dashed ? "1.5px dashed currentColor" : undefined,
                      }}
                      aria-hidden
                    />
                    {getSeriesLabel(s.indicator, lang)}
                  </button>
                );
              })}
            </div>

            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={formatXTick}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={{ stroke: "#E5E7EB" }}
                    tickLine={{ stroke: "#E5E7EB" }}
                    minTickGap={20}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={{ stroke: "#E5E7EB" }}
                    tickLine={{ stroke: "#E5E7EB" }}
                    width={48}
                  />
                  <Tooltip
                    content={(props: unknown) => {
                      const p = props as {
                        active?: boolean;
                        payload?: TooltipPayloadItem[];
                        label?: string;
                      };
                      return <ChartTooltip {...p} lang={lang} />;
                    }}
                    cursor={{ stroke: "#9CA3AF", strokeDasharray: "3 3" }}
                  />
                  {series
                    .filter((s) => !hidden.has(s.indicator))
                    .map((s) => {
                      const style = SERIES_STYLE[s.indicator];
                      return (
                        <Line
                          key={s.indicator}
                          type="monotone"
                          dataKey={s.indicator}
                          stroke={style.color}
                          strokeWidth={style.strokeWidth}
                          strokeDasharray={style.dashed ? "5 4" : undefined}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                          connectNulls
                        />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {lastSync && (
              <p className="text-[10px] text-neutral-400 mt-2 text-right">
                {(fi.delinquencyLastSync || "Last sync") + ": "}
                {new Date(lastSync).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
              </p>
            )}
          </>
        )}
      </div>

      {/* KPI cards row — latest + 12mo delta per series */}
      {!loading && series.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {series.map((s) => (
            <DelinquencyKpiCard key={s.indicator} series={s} lang={lang} />
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-neutral-400 leading-relaxed">
        {fi.delinquencySource || "Source: Central Bank of Brazil — Time Series Management System (SGS). Codes: 21082, 21084, 21085, 21136, 21148."}
      </p>
    </div>
  );
}
