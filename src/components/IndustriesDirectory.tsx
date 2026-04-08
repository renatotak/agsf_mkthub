"use client";

/**
 * Diretório de Indústrias — top-level chapter (Phase 24A).
 *
 * Until Phase 24A this lived as an inline `IndustriesList` + drill-down
 * inside `RetailersDirectory.tsx`'s "Indústrias" tab. The CRM revamp split
 * it out so retailers and industries each get their own sidebar entry and
 * their own KPI surface.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Loader2, Factory, Search } from "lucide-react";
import { IndustryProfile } from "@/components/IndustryProfile";

interface Industry {
  id: string;
  name: string;
  name_display?: string | null;
  segment?: string[] | null;
  product_count?: number;
  retailer_count?: number;
  headquarters_country?: string | null;
}

export function IndustriesDirectory({ lang }: { lang: Lang }) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industries")
      .then((r) => r.json())
      .then((d) => setIndustries(d.industries || []))
      .finally(() => setLoading(false));
  }, []);

  if (selectedId) {
    return (
      <IndustryProfile
        industryId={selectedId}
        lang={lang}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? industries.filter((i) =>
        (i.name_display || i.name || "").toLowerCase().includes(q) ||
        (i.segment || []).some((s) => s.toLowerCase().includes(q))
      )
    : industries;

  // Aggregate KPIs across the visible (filtered) set so the strip reacts
  // to the search input and gives a useful overview while loading.
  const totalIndustries = industries.length;
  const totalProducts = industries.reduce((s, i) => s + (i.product_count || 0), 0);
  const totalLinkedRetailers = industries.reduce((s, i) => s + (i.retailer_count || 0), 0);
  const distinctSegments = new Set(industries.flatMap((i) => i.segment || [])).size;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900 flex items-center gap-2">
            <Factory size={22} className="text-brand-primary" />
            {lang === "pt" ? "Diretório de Indústrias" : "Industries Directory"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${totalIndustries} indústrias catalogadas no AGROFIT`
              : `${totalIndustries} industries catalogued in AGROFIT`}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label={lang === "pt" ? "Indústrias" : "Industries"}
          value={totalIndustries.toLocaleString()}
        />
        <KpiTile
          label={lang === "pt" ? "Produtos" : "Products"}
          value={totalProducts.toLocaleString()}
        />
        <KpiTile
          label={lang === "pt" ? "Revendas vinculadas" : "Linked Retailers"}
          value={totalLinkedRetailers.toLocaleString()}
        />
        <KpiTile
          label={lang === "pt" ? "Segmentos" : "Segments"}
          value={distinctSegments.toString()}
        />
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              lang === "pt"
                ? "Buscar por nome ou segmento..."
                : "Search by name or segment..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          {lang === "pt" ? "Carregando indústrias..." : "Loading industries..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-neutral-400 text-sm">
          {lang === "pt" ? "Nenhum resultado" : "No results"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ind) => (
            <button
              key={ind.id}
              onClick={() => setSelectedId(ind.id)}
              className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4 text-left hover:border-brand-primary hover:shadow-md transition-all"
            >
              <h3 className="text-[14px] font-bold text-neutral-900">
                {ind.name_display || ind.name}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {(ind.segment || []).slice(0, 3).map((s) => (
                  <span
                    key={s}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-neutral-500">
                <span>
                  {ind.product_count || 0} {lang === "pt" ? "produtos" : "products"}
                </span>
                <span>
                  {ind.retailer_count || 0} {lang === "pt" ? "revendas" : "retailers"}
                </span>
                {ind.headquarters_country && <span>{ind.headquarters_country}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold text-neutral-500 uppercase">{label}</p>
      <p className="text-[24px] font-bold text-neutral-900 mt-1">{value}</p>
    </div>
  );
}
