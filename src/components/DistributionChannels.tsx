"use client";

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Search, Loader2, MapPin, Filter, Database, ChevronLeft,
  ChevronRight, Building2, Factory, Sprout, Handshake, Store,
} from "lucide-react";
import {
  type DistributionChannel, type ChannelCategory, type ChannelStats,
  channelCategoryConfig, sampleChannels, sampleStats,
} from "@/data/channels";

const categoryIcons: Record<ChannelCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  Industria: Factory,
  Distribuidor: Building2,
  Produtor: Sprout,
  Cooperativa: Handshake,
  Redistribuidor: Store,
};

const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

export function DistributionChannels({ lang }: { lang: Lang }) {
  const [channels, setChannels] = useState<DistributionChannel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ChannelCategory | "all">("all");
  const [ufFilter, setUfFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const labels = {
    pt: {
      title: "Canais de Distribuição",
      subtitle: "Base de dados de 23.861 empresas classificadas em 27 estados brasileiros",
      search: "Buscar por nome, CNPJ ou município...",
      allCategories: "Todas categorias",
      allStates: "Todos UFs",
      company: "Empresa",
      category: "Categoria",
      state: "UF",
      municipality: "Município",
      sources: "Fontes",
      showing: "Mostrando",
      of: "de",
      results: "resultados",
      topStates: "Top Estados",
      byCategory: "Por Categoria",
      totalCompanies: "Total de Empresas",
      noResults: "Nenhum resultado encontrado",
    },
    en: {
      title: "Distribution Channels",
      subtitle: "Database of 23,861 classified companies across all 27 Brazilian states",
      search: "Search by name, CNPJ or municipality...",
      allCategories: "All categories",
      allStates: "All states",
      company: "Company",
      category: "Category",
      state: "State",
      municipality: "Municipality",
      sources: "Sources",
      showing: "Showing",
      of: "of",
      results: "results",
      topStates: "Top States",
      byCategory: "By Category",
      totalCompanies: "Total Companies",
      noResults: "No results found",
    },
  };
  const lb = labels[lang];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data } = await supabase.from("distribution_channels").select("*").order("name").limit(500);
      setChannels(data?.length ? data : sampleChannels);
      setStats(sampleStats); // Stats always from pre-computed aggregates
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = channels.filter((ch) => {
    const matchesSearch = search === "" || [ch.name, ch.trading_name, ch.cnpj, ch.municipio].some((f) => f?.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || ch.category === categoryFilter;
    const matchesUf = ufFilter === "all" || ch.uf === ufFilter;
    return matchesSearch && matchesCategory && matchesUf;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, categoryFilter, ufFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{lb.title}</h2>
        <p className="text-slate-500 mt-1 text-sm md:text-base">{lb.subtitle}</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
          {/* Total */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 text-center">
            <Database size={28} className="mx-auto mb-3 text-indigo-500" />
            <p className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tighter">{stats.total.toLocaleString()}</p>
            <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{lb.totalCompanies}</p>
          </div>

          {/* By Category */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{lb.byCategory}</p>
            <div className="space-y-2.5">
              {(Object.entries(stats.by_category) as [ChannelCategory, number][]).map(([cat, count]) => {
                const Icon = categoryIcons[cat];
                const config = channelCategoryConfig[cat];
                const pct = (count / stats.total) * 100;
                return (
                  <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)} className="w-full flex items-center gap-3 group">
                    <Icon size={14} className={`shrink-0 ${categoryFilter === cat ? "text-indigo-600" : "text-slate-400"}`} />
                    <span className={`text-xs font-bold w-24 text-left ${categoryFilter === cat ? "text-indigo-600" : "text-slate-600"}`}>
                      {lang === "pt" ? config.label_pt : config.label_en}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${config.color.split(" ")[0]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-14 text-right">{count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top States */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{lb.topStates}</p>
            <div className="space-y-2.5">
              {stats.top_states.slice(0, 6).map((s) => {
                const pct = (s.count / stats.top_states[0].count) * 100;
                return (
                  <button key={s.uf} onClick={() => setUfFilter(s.uf === ufFilter ? "all" : s.uf)} className="w-full flex items-center gap-3 group">
                    <MapPin size={14} className={`shrink-0 ${ufFilter === s.uf ? "text-indigo-600" : "text-slate-400"}`} />
                    <span className={`text-xs font-bold w-8 ${ufFilter === s.uf ? "text-indigo-600" : "text-slate-600"}`}>{s.uf}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-14 text-right">{s.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lb.search}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ChannelCategory | "all")}
          className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 cursor-pointer"
        >
          <option value="all">{lb.allCategories}</option>
          {Object.entries(channelCategoryConfig).map(([cat, config]) => (
            <option key={cat} value={cat}>{lang === "pt" ? config.label_pt : config.label_en}</option>
          ))}
        </select>
        <select
          value={ufFilter}
          onChange={(e) => setUfFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 cursor-pointer w-24"
        >
          <option value="all">{lb.allStates}</option>
          {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-4 text-left">{lb.company}</th>
                <th className="px-5 py-4 text-left hidden md:table-cell">CNPJ</th>
                <th className="px-5 py-4 text-center">{lb.category}</th>
                <th className="px-5 py-4 text-left hidden sm:table-cell">{lb.state}</th>
                <th className="px-5 py-4 text-left hidden lg:table-cell">{lb.municipality}</th>
                <th className="px-5 py-4 text-center hidden sm:table-cell">{lb.sources}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((ch) => {
                const catConfig = channelCategoryConfig[ch.category];
                return (
                  <tr key={ch.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900 text-sm">{ch.trading_name || ch.name}</p>
                      {ch.trading_name && <p className="text-xs text-slate-400 truncate max-w-[250px]">{ch.name}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs hidden md:table-cell">{ch.cnpj || "—"}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${catConfig.color}`}>
                        {lang === "pt" ? catConfig.label_pt : catConfig.label_en}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-semibold hidden sm:table-cell">{ch.uf}</td>
                    <td className="px-5 py-4 text-slate-500 hidden lg:table-cell">{ch.municipio}</td>
                    <td className="px-5 py-4 text-center text-slate-500 hidden sm:table-cell">{ch.source_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paginated.length === 0 && (
          <div className="py-12 text-center text-slate-400 font-medium">{lb.noResults}</div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">
              {lb.showing} {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} {lb.of} {filtered.length} {lb.results}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-slate-600 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
