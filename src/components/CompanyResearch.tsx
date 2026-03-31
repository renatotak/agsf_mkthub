"use client";

import { useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Search, Loader2, Globe, Linkedin, Instagram, Building2,
  Users, TrendingUp, TrendingDown, Newspaper, Shield,
  ChevronDown, ChevronUp, ExternalLink, AlertTriangle,
  CheckCircle2, XCircle, ArrowUpRight,
} from "lucide-react";
import { type CompanyAnalysis, type SWOTAnalysis, sampleAnalysis } from "@/data/company-research";

export function CompanyResearch({ lang }: { lang: Lang }) {
  const [cnpjInput, setCnpjInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cadastro: true, digital: true, persons: true, economic: true, channel: true, news: true, swot: true,
  });

  const labels = {
    pt: {
      title: "Pesquisa de Empresas",
      subtitle: "Análise inteligente por CNPJ ou nome da empresa (SDR Agent)",
      placeholder: "Digite CNPJ (ex: 12.345.678/0001-90) ou nome da empresa",
      analyze: "Analisar",
      analyzing: "Analisando...",
      tryDemo: "Ou veja um exemplo",
      cadastro: "Dados Cadastrais",
      digitalPresence: "Presença Digital",
      keyPersons: "Pessoas-Chave",
      economicData: "Dados Econômicos",
      channelAnalysis: "Análise de Canal",
      recentNews: "Notícias Recentes",
      swotAnalysis: "Análise SWOT",
      strengths: "Forças",
      weaknesses: "Fraquezas",
      opportunities: "Oportunidades",
      threats: "Ameaças",
      partner: "Sócio",
      employee: "Colaborador",
      embandeirado: "Embandeirado",
      independent: "Independente",
      brand: "Marca principal",
      segments: "Segmentos",
      regions: "Regiões",
      analyzedAt: "Analisado em",
      noRestrictions: "Sem restrições creditícias",
      judicialRecovery: "Em recuperação judicial",
      notInRecovery: "Sem recuperação judicial",
    },
    en: {
      title: "Company Research",
      subtitle: "Intelligent analysis by CNPJ or company name (SDR Agent)",
      placeholder: "Enter CNPJ (e.g. 12.345.678/0001-90) or company name",
      analyze: "Analyze",
      analyzing: "Analyzing...",
      tryDemo: "Or see an example",
      cadastro: "Company Registration",
      digitalPresence: "Digital Presence",
      keyPersons: "Key Persons",
      economicData: "Economic Data",
      channelAnalysis: "Channel Analysis",
      recentNews: "Recent News",
      swotAnalysis: "SWOT Analysis",
      strengths: "Strengths",
      weaknesses: "Weaknesses",
      opportunities: "Opportunities",
      threats: "Threats",
      partner: "Partner",
      employee: "Employee",
      embandeirado: "Brand-Affiliated",
      independent: "Independent",
      brand: "Primary brand",
      segments: "Segments",
      regions: "Regions",
      analyzedAt: "Analyzed at",
      noRestrictions: "No credit restrictions",
      judicialRecovery: "In judicial recovery",
      notInRecovery: "Not in judicial recovery",
    },
  };
  const lb = labels[lang];

  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleAnalyze = () => {
    setAnalyzing(true);
    // Simulate analysis delay — in production this calls the SDR agent API
    setTimeout(() => {
      setAnalysis(sampleAnalysis);
      setAnalyzing(false);
    }, 2000);
  };

  const SectionHeader = ({ id, title, icon: Icon }: { id: string; title: string; icon: React.ComponentType<{ size?: number; className?: string }> }) => (
    <button onClick={() => toggleSection(id)} className="w-full flex items-center justify-between px-6 py-4 bg-slate-50/50 border-b border-gray-100/80 hover:bg-slate-50 transition-colors">
      <h3 className="font-bold text-slate-900 flex items-center gap-2"><Icon size={18} className="text-slate-500" /> {title}</h3>
      {expandedSections[id] ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
    </button>
  );

  const SWOTQuadrant = ({ title, items, color, icon: Icon }: { title: string; items: string[]; color: string; icon: React.ComponentType<{ size?: number; className?: string }> }) => (
    <div className={`rounded-xl border p-4 ${color}`}>
      <h4 className="font-bold text-sm mb-3 flex items-center gap-1.5"><Icon size={16} /> {title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-snug flex gap-2">
            <span className="text-xs mt-0.5 opacity-60">&#x25CF;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{lb.title}</h2>
        <p className="text-slate-500 mt-1 text-sm md:text-base">{lb.subtitle}</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-5 md:p-6 mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={cnpjInput}
              onChange={(e) => setCnpjInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder={lb.placeholder}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all font-medium"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-bold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed min-w-[140px]"
          >
            {analyzing ? <><Loader2 size={18} className="animate-spin" /> {lb.analyzing}</> : <><Search size={18} /> {lb.analyze}</>}
          </button>
        </div>
        {!analysis && !analyzing && (
          <button onClick={() => { setCnpjInput("12.345.678/0001-90"); handleAnalyze(); }} className="mt-3 text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors">
            {lb.tryDemo} &rarr;
          </button>
        )}
      </div>

      {/* Loading State */}
      {analyzing && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={40} className="animate-spin text-teal-500" />
          <p className="text-sm font-medium text-slate-500">{lang === "pt" ? "Consultando fontes de dados públicos..." : "Querying public data sources..."}</p>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !analyzing && (
        <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Company Header Card */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">{analysis.nome_fantasia || analysis.razao_social}</h2>
                {analysis.nome_fantasia && <p className="text-sm text-slate-500 mt-1">{analysis.razao_social}</p>}
              </div>
              <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-lg ${analysis.situacao_cadastral === "ATIVA" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {analysis.situacao_cadastral}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">CNPJ</p><p className="text-sm font-mono font-semibold text-slate-800">{analysis.cnpj}</p></div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">UF</p><p className="text-sm font-semibold text-slate-800">{analysis.municipio}, {analysis.uf}</p></div>
              {analysis.porte_empresa && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{lang === "pt" ? "Porte" : "Size"}</p><p className="text-sm font-semibold text-slate-800">{analysis.porte_empresa}</p></div>}
              {analysis.data_abertura && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{lang === "pt" ? "Abertura" : "Founded"}</p><p className="text-sm font-semibold text-slate-800">{new Date(analysis.data_abertura).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p></div>}
            </div>
            <p className="text-xs text-slate-400 mt-4 font-medium">{lb.analyzedAt}: {new Date(analysis.analyzed_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}</p>
          </div>

          {/* Digital Presence */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="digital" title={lb.digitalPresence} icon={Globe} />
            {expandedSections.digital && (
              <div className="p-6 flex flex-wrap gap-3">
                {analysis.digital_presence.website && (
                  <a href={`https://${analysis.digital_presence.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50 transition-all">
                    <Globe size={16} className="text-teal-500" /> {analysis.digital_presence.website} <ExternalLink size={14} className="text-slate-400" />
                  </a>
                )}
                {analysis.digital_presence.linkedin && (
                  <a href={`https://${analysis.digital_presence.linkedin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-all">
                    <Linkedin size={16} className="text-blue-600" /> LinkedIn <ExternalLink size={14} className="text-slate-400" />
                  </a>
                )}
                {analysis.digital_presence.instagram && (
                  <span className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">
                    <Instagram size={16} className="text-pink-500" /> {analysis.digital_presence.instagram}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Key Persons */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="persons" title={lb.keyPersons} icon={Users} />
            {expandedSections.persons && (
              <div className="p-6 space-y-3">
                {analysis.key_persons.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-sm text-slate-500">{p.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.participacao && <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">{p.participacao}</span>}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${p.is_partner ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.is_partner ? lb.partner : lb.employee}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Economic Data */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="economic" title={lb.economicData} icon={TrendingUp} />
            {expandedSections.economic && (
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  {analysis.economic_data.capital_social && <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Capital Social</p><p className="text-lg font-extrabold text-slate-900">{analysis.economic_data.capital_social}</p></div>}
                  {analysis.economic_data.faturamento_estimado && <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{lang === "pt" ? "Faturamento Estimado" : "Est. Revenue"}</p><p className="text-lg font-extrabold text-slate-900">{analysis.economic_data.faturamento_estimado}</p></div>}
                  {analysis.economic_data.porte_empresa && <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{lang === "pt" ? "Porte" : "Size"}</p><p className="text-lg font-extrabold text-slate-900">{analysis.economic_data.porte_empresa}</p></div>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${analysis.economic_data.recuperacao_judicial ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {analysis.economic_data.recuperacao_judicial ? <><AlertTriangle size={14} /> {lb.judicialRecovery}</> : <><CheckCircle2 size={14} /> {lb.notInRecovery}</>}
                  </span>
                  {analysis.economic_data.restricoes_crediticias.length === 0 && (
                    <span className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                      <Shield size={14} /> {lb.noRestrictions}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Channel Analysis */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="channel" title={lb.channelAnalysis} icon={Building2} />
            {expandedSections.channel && (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${analysis.channel_analysis.is_embandeirado ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {analysis.channel_analysis.is_embandeirado ? lb.embandeirado : lb.independent}
                  </span>
                  {analysis.channel_analysis.marca_predominante && (
                    <span className="text-sm font-medium text-slate-600">{lb.brand}: <strong>{analysis.channel_analysis.marca_predominante}</strong></span>
                  )}
                </div>
                {analysis.channel_analysis.marcas_secundarias.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {analysis.channel_analysis.marcas_secundarias.map((m) => (
                      <span key={m} className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">{m}</span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{lb.segments}</p>
                    <div className="flex flex-wrap gap-2">{analysis.channel_analysis.segmento_atuacao.map((s) => <span key={s} className="text-xs font-semibold bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-700">{s}</span>)}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{lb.regions}</p>
                    <div className="flex flex-wrap gap-2">{analysis.channel_analysis.regiao_atuacao.map((r) => <span key={r} className="text-xs font-semibold bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-700">{r}</span>)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent News */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="news" title={lb.recentNews} icon={Newspaper} />
            {expandedSections.news && (
              <div className="p-6 space-y-3">
                {analysis.news.map((n, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-start gap-3">
                    <span className={`self-start text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${n.sentiment === "positive" ? "bg-emerald-100 text-emerald-700" : n.sentiment === "negative" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                      {n.sentiment === "positive" ? (lang === "pt" ? "Positiva" : "Positive") : n.sentiment === "negative" ? (lang === "pt" ? "Negativa" : "Negative") : "Neutral"}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 text-sm">{n.title}</p>
                      <p className="text-sm text-slate-500 mt-1">{n.summary}</p>
                      <p className="text-xs text-slate-400 mt-2 font-medium">{n.source} &middot; {new Date(n.date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SWOT */}
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <SectionHeader id="swot" title={lb.swotAnalysis} icon={Shield} />
            {expandedSections.swot && (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <SWOTQuadrant title={lb.strengths} items={analysis.swot.strengths} color="bg-emerald-50 border-emerald-200 text-emerald-900" icon={TrendingUp} />
                <SWOTQuadrant title={lb.weaknesses} items={analysis.swot.weaknesses} color="bg-red-50 border-red-200 text-red-900" icon={TrendingDown} />
                <SWOTQuadrant title={lb.opportunities} items={analysis.swot.opportunities} color="bg-blue-50 border-blue-200 text-blue-900" icon={ArrowUpRight} />
                <SWOTQuadrant title={lb.threats} items={analysis.swot.threats} color="bg-amber-50 border-amber-200 text-amber-900" icon={AlertTriangle} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
