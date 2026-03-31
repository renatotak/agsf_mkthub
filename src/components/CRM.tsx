"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Search, Plus, ChevronRight, Users, Building2, Filter,
  Mail, Phone, Linkedin, Loader2, ArrowLeft, Calendar,
} from "lucide-react";
import { type Contact, type Company, type LeadStage, leadStageConfig, sampleContacts, sampleCompanies } from "@/data/crm";

type CRMView = "contacts" | "companies";

export function CRM({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [view, setView] = useState<CRMView>("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [{ data: contactData }, { data: companyData }] = await Promise.all([
        supabase.from("crm_contacts").select("*").order("display_name"),
        supabase.from("crm_companies").select("*").order("company_name"),
      ]);
      setContacts(contactData?.length ? contactData : sampleContacts);
      setCompanies(companyData?.length ? companyData : sampleCompanies);
      setLoading(false);
    }
    fetchData();
  }, []);

  const crmLabels = {
    pt: {
      title: "CRM & Gestão de Clientes",
      subtitle: "Contatos, empresas e funil de vendas consolidados",
      contacts: "Contatos",
      companies: "Empresas",
      search: "Buscar por nome, email ou empresa...",
      searchCompany: "Buscar por nome, CNPJ ou cidade...",
      allStages: "Todos os estágios",
      newContact: "Novo Contato",
      newCompany: "Nova Empresa",
      role: "Cargo",
      stage: "Estágio",
      rep: "Responsável",
      lastContact: "Último contato",
      details: "Detalhes",
      back: "Voltar",
      sector: "Setor",
      city: "Cidade",
      linkedContacts: "contatos vinculados",
      funnel: "Funil de Vendas",
      noResults: "Nenhum resultado encontrado",
    },
    en: {
      title: "CRM & Client Management",
      subtitle: "Consolidated contacts, companies and sales funnel",
      contacts: "Contacts",
      companies: "Companies",
      search: "Search by name, email or company...",
      searchCompany: "Search by name, CNPJ or city...",
      allStages: "All stages",
      newContact: "New Contact",
      newCompany: "New Company",
      role: "Role",
      stage: "Stage",
      rep: "Rep",
      lastContact: "Last contact",
      details: "Details",
      back: "Back",
      sector: "Sector",
      city: "City",
      linkedContacts: "linked contacts",
      funnel: "Sales Funnel",
      noResults: "No results found",
    },
  };
  const cl = crmLabels[lang];

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch = search === "" || [c.display_name, c.email, c.company_name, c.role].some((f) => f?.toLowerCase().includes(search.toLowerCase()));
    const matchesStage = stageFilter === "all" || c.lead_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const filteredCompanies = companies.filter((c) => {
    return search === "" || [c.company_name, c.trading_name, c.cnpj, c.city].some((f) => f?.toLowerCase().includes(search.toLowerCase()));
  });

  // Funnel stats
  const funnelData = Object.entries(leadStageConfig)
    .map(([stage, config]) => ({
      stage: stage as LeadStage,
      label: lang === "pt" ? config.label_pt : config.label_en,
      color: config.color,
      count: contacts.filter((c) => c.lead_stage === stage).length,
    }))
    .sort((a, b) => leadStageConfig[a.stage].sort - leadStageConfig[b.stage].sort);
  const maxFunnel = Math.max(...funnelData.map((f) => f.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  // Contact detail view
  if (selectedContact) {
    const c = selectedContact;
    return (
      <div className="animate-in fade-in duration-300 pb-8">
        <button onClick={() => setSelectedContact(null)} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft size={16} /> {cl.back}
        </button>
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">{c.display_name}</h2>
              <p className="text-slate-500 mt-1">{c.role} {c.company_name ? `@ ${c.company_name}` : ""}</p>
            </div>
            <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-lg ${leadStageConfig[c.lead_stage].color}`}>
              {lang === "pt" ? leadStageConfig[c.lead_stage].label_pt : leadStageConfig[c.lead_stage].label_en}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm"><Mail size={16} className="text-slate-400" /><span className="text-slate-700">{c.email}</span></div>
              {c.phone && <div className="flex items-center gap-3 text-sm"><Phone size={16} className="text-slate-400" /><span className="text-slate-700">{c.phone}</span></div>}
              {c.mobile && <div className="flex items-center gap-3 text-sm"><Phone size={16} className="text-slate-400" /><span className="text-slate-700">{c.mobile}</span></div>}
              {c.linkedin && <div className="flex items-center gap-3 text-sm"><Linkedin size={16} className="text-slate-400" /><span className="text-slate-700">{c.linkedin}</span></div>}
            </div>
            <div className="space-y-4">
              {c.responsible_rep && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{cl.rep}</p>
                  <p className="text-sm font-semibold text-slate-800">{c.responsible_rep}</p>
                </div>
              )}
              {c.last_contact_date && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{cl.lastContact}</p>
                  <p className="text-sm font-semibold text-slate-800">{new Date(c.last_contact_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p>
                </div>
              )}
              {c.notes && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-amber-900">{c.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Company detail view
  if (selectedCompany) {
    const co = selectedCompany;
    const linkedContacts = contacts.filter((c) => c.company_id === co.id);
    return (
      <div className="animate-in fade-in duration-300 pb-8">
        <button onClick={() => setSelectedCompany(null)} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft size={16} /> {cl.back}
        </button>
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">{co.company_name}</h2>
              {co.trading_name && <p className="text-slate-500 mt-1">{co.trading_name}</p>}
            </div>
            <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-lg ${co.status === "active" ? "bg-emerald-100 text-emerald-700" : co.status === "recuperacao_judicial" ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
              {co.status === "active" ? (lang === "pt" ? "Ativa" : "Active") : co.status === "recuperacao_judicial" ? "Rec. Judicial" : (lang === "pt" ? "Inativa" : "Inactive")}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {co.cnpj && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">CNPJ</p><p className="text-sm font-mono font-semibold text-slate-800">{co.cnpj}</p></div>}
            {co.sector && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{cl.sector}</p><p className="text-sm font-semibold text-slate-800">{co.sector}</p></div>}
            {co.uf && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">UF</p><p className="text-sm font-semibold text-slate-800">{co.uf}</p></div>}
            {co.city && <div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{cl.city}</p><p className="text-sm font-semibold text-slate-800">{co.city}</p></div>}
          </div>
        </div>
        {linkedContacts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100/80 bg-slate-50/50">
              <h3 className="font-bold text-slate-900">{cl.contacts} ({linkedContacts.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {linkedContacts.map((c) => (
                <button key={c.id} onClick={() => { setSelectedCompany(null); setSelectedContact(c); }} className="w-full px-6 py-4 text-left hover:bg-slate-50/80 transition-colors flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{c.display_name}</p>
                    <p className="text-sm text-slate-500">{c.role} &middot; {c.email}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${leadStageConfig[c.lead_stage].color}`}>
                    {lang === "pt" ? leadStageConfig[c.lead_stage].label_pt : leadStageConfig[c.lead_stage].label_en}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{cl.title}</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">{cl.subtitle}</p>
        </div>
        <button className="flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 font-medium text-sm transition-all shadow-sm active:scale-95">
          <Plus size={18} />
          {view === "contacts" ? cl.newContact : cl.newCompany}
        </button>
      </div>

      {/* Funnel Overview */}
      <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-5 md:p-6 mb-6 md:mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{cl.funnel}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {funnelData.map((f) => (
            <button key={f.stage} onClick={() => { setView("contacts"); setStageFilter(f.stage === stageFilter ? "all" : f.stage); }} className="text-center group">
              <p className="text-2xl font-extrabold text-slate-900 mb-1">{f.count}</p>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all duration-700 ${f.color.split(" ")[0]}`} style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${stageFilter === f.stage ? "text-cyan-600" : "text-slate-400 group-hover:text-slate-600"}`}>{f.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => { setView("contacts"); setSearch(""); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${view === "contacts" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}>
          <Users size={16} /> {cl.contacts} <span className="text-xs opacity-70">({contacts.length})</span>
        </button>
        <button onClick={() => { setView("companies"); setSearch(""); setStageFilter("all"); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${view === "companies" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}>
          <Building2 size={16} /> {cl.companies} <span className="text-xs opacity-70">({companies.length})</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "contacts" ? cl.search : cl.searchCompany}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
          />
        </div>
        {view === "contacts" && (
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as LeadStage | "all")}
            className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 cursor-pointer"
          >
            <option value="all">{cl.allStages}</option>
            {Object.entries(leadStageConfig).map(([stage, config]) => (
              <option key={stage} value={stage}>{lang === "pt" ? config.label_pt : config.label_en}</option>
            ))}
          </select>
        )}
      </div>

      {/* Contacts List */}
      {view === "contacts" && (
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-4 text-left">{lang === "pt" ? "Nome" : "Name"}</th>
                  <th className="px-5 py-4 text-left hidden md:table-cell">{cl.role}</th>
                  <th className="px-5 py-4 text-left hidden lg:table-cell">{lang === "pt" ? "Empresa" : "Company"}</th>
                  <th className="px-5 py-4 text-center">{cl.stage}</th>
                  <th className="px-5 py-4 text-right hidden sm:table-cell">{cl.lastContact}</th>
                  <th className="px-5 py-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredContacts.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedContact(c)} className="hover:bg-slate-50/80 cursor-pointer transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{c.display_name}</p>
                      <p className="text-xs text-slate-400 md:hidden">{c.role}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600 hidden md:table-cell">{c.role}</td>
                    <td className="px-5 py-4 text-slate-500 hidden lg:table-cell">{c.company_name || "—"}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${leadStageConfig[c.lead_stage].color}`}>
                        {lang === "pt" ? leadStageConfig[c.lead_stage].label_pt : leadStageConfig[c.lead_stage].label_en}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-slate-400 hidden sm:table-cell">
                      {c.last_contact_date ? new Date(c.last_contact_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="px-3 py-4"><ChevronRight size={16} className="text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredContacts.length === 0 && (
            <div className="py-12 text-center text-slate-400 font-medium">{cl.noResults}</div>
          )}
        </div>
      )}

      {/* Companies List */}
      {view === "companies" && (
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-4 text-left">{lang === "pt" ? "Empresa" : "Company"}</th>
                  <th className="px-5 py-4 text-left hidden md:table-cell">CNPJ</th>
                  <th className="px-5 py-4 text-left hidden lg:table-cell">{cl.sector}</th>
                  <th className="px-5 py-4 text-left hidden sm:table-cell">UF</th>
                  <th className="px-5 py-4 text-center">{cl.contacts}</th>
                  <th className="px-5 py-4 text-center">Status</th>
                  <th className="px-5 py-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCompanies.map((co) => (
                  <tr key={co.id} onClick={() => setSelectedCompany(co)} className="hover:bg-slate-50/80 cursor-pointer transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{co.trading_name || co.company_name}</p>
                      {co.trading_name && <p className="text-xs text-slate-400">{co.company_name}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs hidden md:table-cell">{co.cnpj || "—"}</td>
                    <td className="px-5 py-4 text-slate-500 hidden lg:table-cell">{co.sector || "—"}</td>
                    <td className="px-5 py-4 text-slate-500 hidden sm:table-cell">{co.uf} {co.city ? `- ${co.city}` : ""}</td>
                    <td className="px-5 py-4 text-center font-semibold text-slate-700">{co.contact_count ?? 0}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${co.status === "active" ? "bg-emerald-100 text-emerald-700" : co.status === "recuperacao_judicial" ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
                        {co.status === "active" ? (lang === "pt" ? "Ativa" : "Active") : co.status === "recuperacao_judicial" ? "RJ" : (lang === "pt" ? "Inativa" : "Inactive")}
                      </span>
                    </td>
                    <td className="px-3 py-4"><ChevronRight size={16} className="text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredCompanies.length === 0 && (
            <div className="py-12 text-center text-slate-400 font-medium">{cl.noResults}</div>
          )}
        </div>
      )}
    </div>
  );
}
