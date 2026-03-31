"use client";

import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { MarketPulse } from "@/components/MarketPulse";
import { CampaignCenter } from "@/components/CampaignCenter";
import { ContentEngine } from "@/components/ContentEngine";
import { CompetitorRadar } from "@/components/CompetitorRadar";
import { EventTracker } from "@/components/EventTracker";
import { CRM } from "@/components/CRM";
import { CompanyResearch } from "@/components/CompanyResearch";
import { DistributionChannels } from "@/components/DistributionChannels";
import { AgroNews } from "@/components/AgroNews";
import { RetailersDirectory } from "@/components/RetailersDirectory";
import { RecuperacaoJudicial } from "@/components/RecuperacaoJudicial";
import {
  BarChart3,
  Megaphone,
  PenTool,
  Radar,
  Calendar,
  Globe,
  Shield,
  LayoutDashboard,
  LogOut,
  Users,
  SearchCheck,
  Network,
  Newspaper,
  Store,
  Scale,
  Menu,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Module = "dashboard" | "market" | "campaigns" | "content" | "competitors" | "events" | "crm" | "research" | "channels" | "news" | "retailers" | "recuperacao";

export default function Home() {
  const [lang, setLang] = useState<Lang>("pt");
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const tr = t(lang);
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const marketModules = [
    { id: "market" as Module, icon: BarChart3, label: tr.modules.marketPulse, color: "bg-emerald-500" },
    { id: "campaigns" as Module, icon: Megaphone, label: tr.modules.campaigns, color: "bg-blue-500" },
    { id: "content" as Module, icon: PenTool, label: tr.modules.content, color: "bg-purple-500" },
    { id: "competitors" as Module, icon: Radar, label: tr.modules.competitors, color: "bg-orange-500" },
    { id: "events" as Module, icon: Calendar, label: tr.modules.events, color: "bg-rose-500" },
  ];

  const salesModules = [
    { id: "crm" as Module, icon: Users, label: tr.modules.crm, color: "bg-cyan-500" },
    { id: "research" as Module, icon: SearchCheck, label: tr.modules.companyResearch, color: "bg-teal-500" },
    { id: "channels" as Module, icon: Network, label: tr.modules.channels, color: "bg-indigo-500" },
  ];

  const dataModules = [
    { id: "news" as Module, icon: Newspaper, label: tr.modules.news, color: "bg-sky-500" },
    { id: "retailers" as Module, icon: Store, label: tr.modules.retailers, color: "bg-amber-500" },
    { id: "recuperacao" as Module, icon: Scale, label: tr.modules.recuperacao, color: "bg-red-500" },
  ];

  const allModules = [...marketModules, ...salesModules, ...dataModules];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans">

      {/* --- MOBILE TOP HEADER --- */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 text-white flex items-center justify-between px-4 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-emerald-400">🌾 {tr.appName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLang(lang === "pt" ? "en" : "pt")} className="p-2 text-slate-300 hover:text-white">
            <Globe size={20} />
          </button>
          <button onClick={handleLogout} className="p-2 text-red-400 hover:text-red-300">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col fixed h-full z-40 border-r border-slate-800 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-emerald-400">🌾 {tr.appName}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-medium">{tr.tagline}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveModule("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeModule === "dashboard"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner"
                : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard size={20} className={activeModule === "dashboard" ? "text-emerald-400" : "text-slate-500"} />
            {tr.nav.dashboard}
          </button>

          {/* Market Intelligence Section */}
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest pt-4 pb-1 px-4">
            {lang === "pt" ? "Inteligência" : "Intelligence"}
          </p>
          {marketModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeModule === mod.id
                  ? "bg-slate-800 text-white shadow-md border border-slate-700/50"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <mod.icon size={18} className={activeModule === mod.id ? mod.color.replace('bg-', 'text-') : "text-slate-500"} />
              {mod.label}
            </button>
          ))}

          {/* Sales & CRM Section */}
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest pt-4 pb-1 px-4">
            {lang === "pt" ? "Vendas & CRM" : "Sales & CRM"}
          </p>
          {salesModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeModule === mod.id
                  ? "bg-slate-800 text-white shadow-md border border-slate-700/50"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <mod.icon size={18} className={activeModule === mod.id ? mod.color.replace('bg-', 'text-') : "text-slate-500"} />
              {mod.label}
            </button>
          ))}

          {/* Data & Legal Section */}
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest pt-4 pb-1 px-4">
            {lang === "pt" ? "Dados & Jurídico" : "Data & Legal"}
          </p>
          {dataModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeModule === mod.id
                  ? "bg-slate-800 text-white shadow-md border border-slate-700/50"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <mod.icon size={18} className={activeModule === mod.id ? mod.color.replace('bg-', 'text-') : "text-slate-500"} />
              {mod.label}
            </button>
          ))}
        </nav>

        {/* Privacy Badge */}
        <div className="p-5 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400/90 bg-emerald-900/20 px-4 py-3 rounded-xl border border-emerald-800/30">
            <Shield size={16} className="text-emerald-500" />
            {tr.privacy.badge}
          </div>
        </div>

        {/* Settings & Logout */}
        <div className="p-5 border-t border-slate-800 flex flex-col gap-3">
          <button
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium transition-colors"
          >
            <Globe size={18} className="text-slate-400" />
            {lang === "pt" ? "🇺🇸 EN" : "🇧🇷 PT"}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-medium transition-colors"
          >
            <LogOut size={18} />
            {lang === "pt" ? "Sair" : "Logout"}
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 md:ml-64 w-full max-w-[100vw] pt-20 pb-24 md:pt-8 md:pb-8 px-4 md:px-8 xl:px-12 mx-auto">
        <div className="max-w-7xl mx-auto">
          {activeModule === "dashboard" && (
            <DashboardOverview lang={lang} modules={allModules} setActiveModule={setActiveModule} />
          )}
          {activeModule === "market" && <MarketPulse lang={lang} />}
          {activeModule === "campaigns" && <CampaignCenter lang={lang} />}
          {activeModule === "content" && <ContentEngine lang={lang} />}
          {activeModule === "competitors" && <CompetitorRadar lang={lang} />}
          {activeModule === "events" && <EventTracker lang={lang} />}
          {activeModule === "crm" && <CRM lang={lang} />}
          {activeModule === "research" && <CompanyResearch lang={lang} />}
          {activeModule === "channels" && <DistributionChannels lang={lang} />}
          {activeModule === "news" && <AgroNews lang={lang} />}
          {activeModule === "retailers" && <RetailersDirectory lang={lang} />}
          {activeModule === "recuperacao" && <RecuperacaoJudicial lang={lang} />}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION --- */}
      <MobileBottomNav
        modules={allModules}
        activeModule={activeModule}
        setActiveModule={setActiveModule}
      />
    </div>
  );
}

function MobileBottomNav({
  modules,
  activeModule,
  setActiveModule,
}: {
  modules: { id: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; color: string }[];
  activeModule: Module;
  setActiveModule: (m: Module) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const primaryModules = modules.slice(0, 4);
  const overflowModules = modules.slice(4);
  const isOverflowActive = overflowModules.some((m) => m.id === activeModule);

  return (
    <>
      {showMore && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50 p-3 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
          <div className="grid grid-cols-4 gap-2">
            {overflowModules.map((mod) => (
              <button
                key={mod.id}
                onClick={() => { setActiveModule(mod.id as Module); setShowMore(false); }}
                className={`flex flex-col items-center justify-center py-3 rounded-xl transition-colors ${
                  activeModule === mod.id ? `${mod.color.replace("bg-", "text-")} bg-slate-50` : "text-slate-500"
                }`}
              >
                <mod.icon size={20} />
                <span className="text-[10px] font-medium mt-1 truncate max-w-[70px] px-1">{mod.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-t border-slate-200 flex items-center justify-between px-1 z-50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] pb-safe">
        <button
          onClick={() => { setActiveModule("dashboard"); setShowMore(false); }}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            activeModule === "dashboard" ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-medium">Dash</span>
        </button>

        {primaryModules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => { setActiveModule(mod.id as Module); setShowMore(false); }}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
              activeModule === mod.id ? mod.color.replace("bg-", "text-") : "text-slate-400"
            }`}
          >
            <mod.icon size={20} />
            <span className="text-[10px] font-medium truncate max-w-[50px]">{mod.label.split(" ")[0]}</span>
          </button>
        ))}

        {overflowModules.length > 0 && (
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
              isOverflowActive || showMore ? "text-teal-600" : "text-slate-400"
            }`}
          >
            <Menu size={20} />
            <span className="text-[10px] font-medium">{isOverflowActive ? "•••" : "Mais"}</span>
          </button>
        )}
      </div>
    </>
  );
}

function DashboardOverview({
  lang,
  modules,
  setActiveModule,
}: {
  lang: Lang;
  modules: { id: string; icon: React.ComponentType<{ size?: number, className?: string }>; label: string; color: string }[];
  setActiveModule: (m: Module) => void;
}) {
  const tr = t(lang);

  const stats = [
    { label: lang === "pt" ? "Commodities" : "Commodities", value: "6", color: "text-emerald-600" },
    { label: lang === "pt" ? "Campanhas" : "Campaigns", value: "4", color: "text-blue-600" },
    { label: lang === "pt" ? "Conteúdo" : "Content", value: "6", color: "text-purple-600" },
    { label: lang === "pt" ? "Concorrentes" : "Competitors", value: "5", color: "text-orange-600" },
    { label: lang === "pt" ? "Contatos CRM" : "CRM Contacts", value: "1,009", color: "text-cyan-600" },
    { label: lang === "pt" ? "Empresas CRM" : "CRM Companies", value: "11,132", color: "text-teal-600" },
    { label: lang === "pt" ? "Canais Mapeados" : "Mapped Channels", value: "23,861", color: "text-indigo-600" },
    { label: lang === "pt" ? "Revendas" : "Retailers", value: "10K+", color: "text-amber-600" },
    { label: lang === "pt" ? "Módulos Ativos" : "Active Modules", value: "11", color: "text-sky-600" },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-6 md:mb-10 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.nav.dashboard}</h2>
        <p className="text-slate-500 mt-2 text-sm md:text-base">{tr.tagline}</p>
        <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full border border-emerald-200/50 shadow-sm">
          <Shield size={14} className="text-emerald-500" />
          {tr.privacy.notice}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3 md:gap-4 mb-8 md:mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <p className={`text-2xl md:text-3xl font-extrabold tracking-tighter ${stat.color} mb-1 drop-shadow-sm`}>{stat.value}</p>
            <p className="text-[11px] md:text-xs font-medium text-slate-500 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id as Module)}
            className="group bg-white rounded-2xl p-5 md:p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 hover:border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-28 h-28 ${mod.color} opacity-[0.03] rounded-bl-full -z-0 transition-transform group-hover:scale-110`} />

            <div className={`w-11 h-11 md:w-12 md:h-12 ${mod.color} rounded-xl flex items-center justify-center mb-4 shadow-sm text-white relative z-10`}>
              <mod.icon size={22} className="drop-shadow-sm" />
            </div>

            <h3 className="font-bold text-base md:text-lg text-slate-800 mb-1.5 relative z-10 group-hover:text-slate-900">{mod.label}</h3>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium relative z-10">
              {mod.id === "market" && (lang === "pt" ? "Preços, câmbio e indicadores." : "Prices, exchange and indicators.")}
              {mod.id === "campaigns" && (lang === "pt" ? "Planejamento estruturado." : "Structured planning.")}
              {mod.id === "content" && (lang === "pt" ? "Ideias e calendário editorial." : "Ideas & editorial calendar.")}
              {mod.id === "competitors" && (lang === "pt" ? "Sinais e movimentos do mercado." : "Market movements & signals.")}
              {mod.id === "events" && (lang === "pt" ? "Conferências agro e networking." : "Agro conferences & networking.")}
              {mod.id === "crm" && (lang === "pt" ? "Contatos, empresas e funil de vendas." : "Contacts, companies and sales funnel.")}
              {mod.id === "research" && (lang === "pt" ? "Análise por CNPJ com SWOT e notícias." : "CNPJ analysis with SWOT and news.")}
              {mod.id === "channels" && (lang === "pt" ? "23.861 empresas em 27 estados." : "23,861 companies across 27 states.")}
              {mod.id === "news" && (lang === "pt" ? "Notícias do agronegócio em tempo real." : "Real-time agribusiness news.")}
              {mod.id === "retailers" && (lang === "pt" ? "Distribuidores e revendas de insumos." : "Input distributors and retailers.")}
              {mod.id === "recuperacao" && (lang === "pt" ? "Monitoramento de processos judiciais." : "Judicial recovery monitoring.")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
