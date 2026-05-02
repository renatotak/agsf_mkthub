"use client";

/**
 * Phase 29 / 30 — Mailing module.
 *
 * Four tabs:
 *   • Rascunhos / Drafts       — queue of mailing_drafts; edit subject/body, click Send
 *   • Destinatários / Clients  — CRUD over mailing_clients + culture multi-select
 *   • Personas                 — Phase 30: CRUD over mailing_personas + per-persona AI prompts
 *   • Enviados / Log           — read-only mailing_log feed
 *
 * Phase 30 turned personas from a hardcoded enum into a table-driven set
 * (mig 084). Adding a new role (Comercial, Vendas Campo, etc.) is now a
 * UI action; iterating the AI prompt is also a UI action.
 *
 * All API calls go through /api/mailing/*. Personas are fetched once at
 * the top-level Mailing component and passed down via props so dropdowns
 * never go stale.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Mail, Send, Pencil, Trash2, Plus, X, Save, Loader2, RefreshCw, Eye,
  CheckCircle2, AlertCircle, Clock, FileText, Users, UserCog, Lock,
} from "lucide-react";

type Tab = "drafts" | "clients" | "personas" | "log";
// Persona slug — table-driven now (mig 084), so any string is valid.
type Persona = string;

interface MailingPersona {
  id: string;
  slug: string;
  name_pt: string;
  name_en: string;
  description_pt: string | null;
  description_en: string | null;
  system_prompt_pt: string | null;
  system_prompt_en: string | null;
  content_focus: string[];
  default_culture_filter: string[];
  position: number;
  active: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

const CULTURE_OPTIONS = [
  "soja", "milho", "cafe", "cana-de-acucar", "algodao", "boi-gordo",
  "trigo", "arroz", "feijao",
];

const CONTENT_FOCUS_OPTIONS = [
  "news", "events", "regulatory", "market_prices", "rj_recovery",
  "content_opportunities", "agtech_radar", "agro_inputs", "price_anomalies", "briefings",
];

// Helper: lookup display name for a persona slug from the loaded list.
function personaLabel(slug: string, personas: MailingPersona[], lang: Lang): string {
  const p = personas.find((x) => x.slug === slug);
  if (!p) return slug;
  return lang === "pt" ? p.name_pt : p.name_en;
}

interface MailingClient {
  id: string;
  full_name: string;
  email: string;
  persona: Persona;
  phone: string | null;
  notes: string | null;
  active: boolean;
  cultures: string[];
  entity_uid: string | null;
}

interface MailingDraft {
  id: string;
  briefing_id: string;
  template_id: string;
  persona: Persona;
  culture_filter: string[];
  status: "draft" | "reviewing" | "approved" | "sent" | "archived" | "failed";
  subject_pt: string;
  body_html_pt: string;
  recipient_count: number | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MailingLogRow {
  id: string;
  draft_id: string;
  client_id: string | null;
  recipient_address: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  client_name?: string | null;
  draft_subject?: string | null;
  draft_persona?: string | null;
}

interface BriefingPayload {
  id: string;
  date: string;
  summary: string | null;
  theme?: string | null;
}

// ─── Top-level component ──────────────────────────────────────────────────────

export function Mailing({ lang }: { lang: Lang }) {
  const [activeTab, setActiveTab] = useState<Tab>("drafts");
  const [personas, setPersonas] = useState<MailingPersona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);

  const refreshPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try {
      const res = await fetch("/api/mailing/personas");
      const json = await res.json();
      if (json.success) setPersonas(json.data ?? []);
    } catch (err) {
      console.error("[mailing/personas] fetch:", err);
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  useEffect(() => { refreshPersonas(); }, [refreshPersonas]);

  // Active personas only — used to populate dropdowns in Drafts/Clients tabs.
  const activePersonas = useMemo(() => personas.filter((p) => p.active), [personas]);

  const tabLabel = (tab: Tab): string => {
    if (tab === "drafts") return lang === "pt" ? "Rascunhos" : "Drafts";
    if (tab === "clients") return lang === "pt" ? "Destinatários" : "Recipients";
    if (tab === "personas") return lang === "pt" ? "Personas" : "Personas";
    return lang === "pt" ? "Enviados" : "Sent";
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[20px] font-bold text-neutral-900 flex items-center gap-2">
          <Mail size={20} className="text-brand-primary" />
          {lang === "pt" ? "Mailings" : "Mailings"}
        </h1>
        <p className="text-[13px] text-neutral-500 mt-1">
          {lang === "pt"
            ? "Briefing executivo personalizado por persona — rascunhos automáticos, revisão humana, envio via Resend."
            : "Persona-targeted executive briefing — auto drafts, human review, sent via Resend."}
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-200">
        {(["drafts", "clients", "personas", "log"] as Tab[]).map((tab) => (
          <button type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {activeTab === "drafts" && <DraftsTab lang={lang} personas={activePersonas} />}
      {activeTab === "clients" && <ClientsTab lang={lang} personas={activePersonas} />}
      {activeTab === "personas" && (
        <PersonasTab lang={lang} personas={personas} loading={personasLoading} onRefresh={refreshPersonas} />
      )}
      {activeTab === "log" && <LogTab lang={lang} personas={personas} />}
    </div>
  );
}

// ─── Drafts tab ───────────────────────────────────────────────────────────────

function DraftsTab({ lang, personas }: { lang: Lang; personas: MailingPersona[] }) {
  const [drafts, setDrafts] = useState<MailingDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingDraft, setEditingDraft] = useState<MailingDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter === "all"
        ? "/api/mailing/drafts?limit=50"
        : `/api/mailing/drafts?status=${statusFilter}&limit=50`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setDrafts(json.data ?? []);
    } catch (err) {
      console.error("[mailing/drafts] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[12px] border border-neutral-300 rounded px-2 py-1.5"
          >
            <option value="all">{lang === "pt" ? "Todos" : "All"}</option>
            <option value="draft">{lang === "pt" ? "Rascunho" : "Draft"}</option>
            <option value="reviewing">{lang === "pt" ? "Em revisão" : "Reviewing"}</option>
            <option value="approved">{lang === "pt" ? "Aprovado" : "Approved"}</option>
            <option value="sent">{lang === "pt" ? "Enviado" : "Sent"}</option>
            <option value="failed">{lang === "pt" ? "Falhou" : "Failed"}</option>
          </select>
          <button type="button"
            onClick={refresh}
            className="flex items-center gap-1 text-[12px] text-neutral-600 hover:text-neutral-900 px-2 py-1.5"
          >
            <RefreshCw size={13} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
        </div>
        <button type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90"
        >
          <Plus size={14} />
          {lang === "pt" ? "Novo Rascunho" : "New Draft"}
        </button>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12px] px-3 py-2 rounded-md flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 size={18} className="animate-spin mr-2" />
          {lang === "pt" ? "Carregando…" : "Loading…"}
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-[13px]">
          {lang === "pt" ? "Nenhum rascunho ainda. Crie um a partir do briefing executivo do dia." : "No drafts yet. Create one from today's executive briefing."}
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              lang={lang}
              personas={personas}
              onEdit={() => setEditingDraft(d)}
              onSent={() => { refresh(); setFeedback(lang === "pt" ? "Mailing enviado com sucesso" : "Mailing sent successfully"); }}
              onDelete={() => refresh()}
            />
          ))}
        </div>
      )}

      {editingDraft && (
        <DraftEditor
          draft={editingDraft}
          lang={lang}
          personas={personas}
          onClose={() => setEditingDraft(null)}
          onSaved={() => { setEditingDraft(null); refresh(); }}
        />
      )}

      {creating && (
        <DraftCreateModal
          lang={lang}
          personas={personas}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function DraftCard({ draft, lang, personas, onEdit, onSent, onDelete }: {
  draft: MailingDraft; lang: Lang; personas: MailingPersona[];
  onEdit: () => void; onSent: () => void; onDelete: () => void;
}) {
  const [sending, setSending] = useState(false);
  const personaName = personaLabel(draft.persona, personas, lang);

  const statusColor: Record<string, string> = {
    draft:     "bg-neutral-100 text-neutral-600",
    reviewing: "bg-amber-100 text-amber-800",
    approved:  "bg-blue-100 text-blue-800",
    sent:      "bg-emerald-100 text-emerald-800",
    failed:    "bg-red-100 text-red-800",
    archived:  "bg-neutral-100 text-neutral-400",
  };

  const handleSend = async () => {
    if (!confirm(lang === "pt"
      ? `Enviar este rascunho para todos os destinatários ${personaName} com as culturas selecionadas?`
      : `Send this draft to all ${personaName} recipients matching the selected cultures?`)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/mailing/drafts/${draft.id}/send`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        alert(lang === "pt"
          ? `Enviado para ${json.recipients_sent} de ${json.recipients_total} destinatários`
          : `Sent to ${json.recipients_sent} of ${json.recipients_total} recipients`);
        onSent();
      } else {
        alert(json.error || (lang === "pt" ? "Falha ao enviar" : "Send failed"));
      }
    } catch (err) {
      console.error(err);
      alert(lang === "pt" ? "Erro ao enviar" : "Send error");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(lang === "pt" ? "Excluir este rascunho?" : "Delete this draft?")) return;
    const res = await fetch(`/api/mailing/drafts/${draft.id}`, { method: "DELETE" });
    if (res.ok) onDelete();
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusColor[draft.status]}`}>
              {draft.status}
            </span>
            <span className="text-[10px] font-medium text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded">
              {personaName}
            </span>
            {draft.culture_filter.length > 0 && (
              <span className="text-[10px] text-neutral-500">
                {draft.culture_filter.join(" · ")}
              </span>
            )}
            {draft.recipient_count !== null && (
              <span className="text-[10px] text-neutral-500">
                {draft.recipient_count} {lang === "pt" ? "destinatários" : "recipients"}
              </span>
            )}
          </div>
          <p className="text-[13px] font-semibold text-neutral-900 truncate">
            {draft.subject_pt || (lang === "pt" ? "(sem assunto)" : "(no subject)")}
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {new Date(draft.updated_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button"
            onClick={onEdit}
            className="p-1.5 text-neutral-500 hover:text-brand-primary hover:bg-neutral-100 rounded"
            title={lang === "pt" ? "Editar" : "Edit"}
          >
            <Pencil size={14} />
          </button>
          {draft.status !== "sent" && (
            <button type="button"
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-1 bg-brand-primary text-white text-[11px] font-medium px-2.5 py-1 rounded-md hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {lang === "pt" ? "Enviar" : "Send"}
            </button>
          )}
          <button type="button"
            onClick={handleDelete}
            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded"
            title={lang === "pt" ? "Excluir" : "Delete"}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftEditor({ draft, lang, personas, onClose, onSaved }: {
  draft: MailingDraft; lang: Lang; personas: MailingPersona[];
  onClose: () => void; onSaved: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject_pt);
  const [body, setBody] = useState(draft.body_html_pt);
  const [cultureFilter, setCultureFilter] = useState<string[]>(draft.culture_filter);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const toggleCulture = (slug: string) => {
    setCultureFilter((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/mailing/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_pt: subject, body_html_pt: body, culture_filter: cultureFilter }),
      });
      const json = await res.json();
      if (json.success) onSaved();
      else alert(json.error || "Save error");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      // Save first so preview reflects current edits
      await fetch(`/api/mailing/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_pt: subject, body_html_pt: body, culture_filter: cultureFilter }),
      });
      const res = await fetch("/api/mailing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id }),
      });
      const json = await res.json();
      if (json.success) setPreviewHtml(json.html);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-[15px] font-bold">
            {lang === "pt" ? "Editar Rascunho" : "Edit Draft"} · {personaLabel(draft.persona, personas, lang)}
          </h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Assunto" : "Subject"}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Filtro de Culturas" : "Culture Filter"}
              <span className="text-neutral-400 font-normal"> · {lang === "pt" ? "vazio = todas" : "empty = all"}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CULTURE_OPTIONS.map((c) => (
                <button type="button"
                  key={c}
                  onClick={() => toggleCulture(c)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    cultureFilter.includes(c)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Corpo (HTML)" : "Body (HTML)"}
              <span className="text-neutral-400 font-normal"> · {`{{recipient_name}}`} {`{{date_pt}}`}</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px] font-mono"
            />
          </div>

          {previewHtml && (
            <div className="border border-neutral-300 rounded p-3 bg-neutral-50">
              <p className="text-[10px] font-bold text-neutral-500 uppercase mb-2">
                {lang === "pt" ? "Pré-visualização" : "Preview"}
              </p>
              <div className="bg-white border border-neutral-200 rounded p-3" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-neutral-200">
          <button type="button"
            onClick={handlePreview}
            className="flex items-center gap-1.5 text-[12px] text-neutral-700 hover:text-neutral-900 px-3 py-1.5"
          >
            <Eye size={14} />
            {lang === "pt" ? "Pré-visualizar" : "Preview"}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-[12px] text-neutral-600 hover:text-neutral-900 px-3 py-1.5">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftCreateModal({ lang, personas, onClose, onCreated }: {
  lang: Lang; personas: MailingPersona[];
  onClose: () => void; onCreated: () => void;
}) {
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [persona, setPersona] = useState<Persona>(personas[0]?.slug ?? "");
  const [cultureFilter, setCultureFilter] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/executive-briefing")
      .then((r) => r.json())
      .then((json) => {
        const b = json?.briefing ?? json;
        if (b && b.id) {
          setBriefing({
            id: b.id,
            date: b.briefing_date ?? b.date ?? "",
            summary: b.executive_summary ?? b.summary ?? null,
            theme: b.theme ?? null,
          });
        }
      })
      .catch((err) => console.error("[mailing] briefing fetch error:", err));
  }, []);

  const toggleCulture = (slug: string) => {
    setCultureFilter((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };

  const handleCreate = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!briefing) {
      setError(lang === "pt" ? "Nenhum briefing executivo encontrado para hoje" : "No executive briefing found for today");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mailing/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing_id: briefing.id,
          persona,
          culture_filter: cultureFilter,
        }),
      });
      let json: { success?: boolean; error?: string } | null = null;
      try { json = await res.json(); } catch { /* non-JSON */ }
      if (res.ok && json?.success) {
        onCreated();
      } else {
        const msg = json?.error || `HTTP ${res.status} ${res.statusText}`;
        console.error("[mailing/draft] create failed:", msg, json);
        setError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[mailing/draft] create threw:", err);
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-[15px] font-bold">{lang === "pt" ? "Novo Rascunho" : "New Draft"}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-neutral-50 border border-neutral-200 rounded p-3">
            <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">
              {lang === "pt" ? "Briefing de origem" : "Source briefing"}
            </p>
            {briefing ? (
              <p className="text-[12px] text-neutral-800">
                {briefing.date} · {briefing.theme || (lang === "pt" ? "Briefing geral" : "General briefing")}
              </p>
            ) : (
              <p className="text-[12px] text-neutral-400">
                {lang === "pt" ? "Carregando…" : "Loading…"}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Persona" : "Persona"}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {personas.map((p) => (
                <button type="button"
                  key={p.slug}
                  onClick={() => setPersona(p.slug)}
                  className={`text-[12px] px-2 py-1.5 rounded border ${
                    persona === p.slug
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  {lang === "pt" ? p.name_pt : p.name_en}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Culturas" : "Cultures"}
              <span className="text-neutral-400 font-normal"> · {lang === "pt" ? "vazio = todas" : "empty = all"}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CULTURE_OPTIONS.map((c) => (
                <button type="button"
                  key={c}
                  onClick={() => toggleCulture(c)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    cultureFilter.includes(c)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-[12px] px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-200">
          <button type="button" onClick={onClose} className="text-[12px] text-neutral-600 hover:text-neutral-900 px-3 py-1.5">
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </button>
          <button type="button"
            onClick={handleCreate}
            disabled={creating || !briefing}
            className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {lang === "pt" ? "Criar Rascunho" : "Create Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clients tab ──────────────────────────────────────────────────────────────

function ClientsTab({ lang, personas }: { lang: Lang; personas: MailingPersona[] }) {
  const [clients, setClients] = useState<MailingClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MailingClient | null>(null);
  const [creating, setCreating] = useState(false);
  const [personaFilter, setPersonaFilter] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = personaFilter === "all"
        ? "/api/mailing/clients"
        : `/api/mailing/clients?persona=${personaFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setClients(json.data ?? []);
    } catch (err) {
      console.error("[mailing/clients] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [personaFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={personaFilter}
            onChange={(e) => setPersonaFilter(e.target.value)}
            className="text-[12px] border border-neutral-300 rounded px-2 py-1.5"
          >
            <option value="all">{lang === "pt" ? "Todas as personas" : "All personas"}</option>
            {personas.map((p) => (
              <option key={p.slug} value={p.slug}>{lang === "pt" ? p.name_pt : p.name_en}</option>
            ))}
          </select>
          <span className="text-[11px] text-neutral-500">
            {clients.length} {lang === "pt" ? "destinatários" : "recipients"}
          </span>
        </div>
        <button type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90"
        >
          <Plus size={14} />
          {lang === "pt" ? "Novo Destinatário" : "New Recipient"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 size={18} className="animate-spin mr-2" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-[13px]">
          {lang === "pt" ? "Nenhum destinatário cadastrado." : "No recipients yet."}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Nome" : "Name"}</th>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Persona" : "Persona"}</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Culturas" : "Cultures"}</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Ativo" : "Active"}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-3 py-2 font-medium text-neutral-900">{c.full_name}</td>
                  <td className="px-3 py-2 text-neutral-700">{c.email}</td>
                  <td className="px-3 py-2"><span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded">{personaLabel(c.persona, personas, lang)}</span></td>
                  <td className="px-3 py-2 text-[11px] text-neutral-600">{c.cultures.join(" · ") || "—"}</td>
                  <td className="px-3 py-2">{c.active ? <CheckCircle2 size={14} className="text-emerald-600" /> : <X size={14} className="text-neutral-400" />}</td>
                  <td className="px-3 py-2">
                    <button type="button"
                      onClick={() => setEditing(c)}
                      className="p-1 text-neutral-500 hover:text-brand-primary"
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ClientFormModal
          client={editing}
          lang={lang}
          personas={personas}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ClientFormModal({ client, lang, personas, onClose, onSaved }: {
  client: MailingClient | null; lang: Lang; personas: MailingPersona[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!client;
  const [fullName, setFullName] = useState(client?.full_name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [persona, setPersona] = useState<Persona>(client?.persona ?? personas[0]?.slug ?? "");
  const [cultures, setCultures] = useState<string[]>(client?.cultures ?? []);
  const [active, setActive] = useState(client?.active ?? true);
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCulture = (slug: string) => {
    setCultures((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };

  const handleSubmit = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!fullName.trim() || !email.trim()) {
      setError(lang === "pt" ? "Nome e email são obrigatórios" : "Name and email are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        persona,
        cultures,
        active,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      };
      const url = isEdit ? `/api/mailing/clients?id=${client!.id}` : "/api/mailing/clients";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: { success?: boolean; error?: string } | null = null;
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (res.ok && json?.success) {
        onSaved();
      } else {
        const msg = json?.error || `HTTP ${res.status} ${res.statusText}`;
        console.error("[mailing/client] save failed:", msg, json);
        setError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[mailing/client] save threw:", err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!client) return;
    if (!confirm(lang === "pt" ? "Desativar este destinatário?" : "Deactivate this recipient?")) return;
    setSaving(true);
    const res = await fetch(`/api/mailing/clients?id=${client.id}`, { method: "DELETE" });
    if (res.ok) onSaved();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-[15px] font-bold">
            {isEdit
              ? (lang === "pt" ? "Editar Destinatário" : "Edit Recipient")
              : (lang === "pt" ? "Novo Destinatário" : "New Recipient")}
          </h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Nome completo *" : "Full name *"}
            </label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Persona *" : "Persona *"}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {personas.map((p) => (
                <button type="button" key={p.slug} onClick={() => setPersona(p.slug)}
                  className={`text-[12px] px-2 py-1.5 rounded border ${
                    persona === p.slug
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}>
                  {lang === "pt" ? p.name_pt : p.name_en}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Culturas de interesse" : "Cultures of interest"}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CULTURE_OPTIONS.map((c) => (
                <button key={c} onClick={() => toggleCulture(c)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    cultures.includes(c)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Telefone" : "Phone"}
              </label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[12px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                {lang === "pt" ? "Ativo" : "Active"}
              </label>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Observações" : "Notes"}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px]" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-[12px] px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-neutral-200">
          {isEdit ? (
            <button type="button" onClick={handleDelete}
              className="flex items-center gap-1.5 text-red-600 text-[12px] hover:bg-red-50 px-3 py-1.5 rounded">
              <Trash2 size={13} />
              {lang === "pt" ? "Desativar" : "Deactivate"}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-[12px] text-neutral-600 hover:text-neutral-900 px-3 py-1.5">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Log tab ──────────────────────────────────────────────────────────────────

function LogTab({ lang, personas }: { lang: Lang; personas: MailingPersona[] }) {
  const [rows, setRows] = useState<MailingLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter === "all"
        ? "/api/mailing/log?limit=200"
        : `/api/mailing/log?status=${statusFilter}&limit=200`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setRows(json.data ?? []);
    } catch (err) {
      console.error("[mailing/log] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const statusIcon = (status: string) => {
    if (status === "sent" || status === "delivered") return <CheckCircle2 size={13} className="text-emerald-600" />;
    if (status === "opened" || status === "clicked") return <CheckCircle2 size={13} className="text-blue-600" />;
    if (status === "failed" || status === "bounced") return <AlertCircle size={13} className="text-red-600" />;
    return <Clock size={13} className="text-neutral-400" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[12px] border border-neutral-300 rounded px-2 py-1.5">
            <option value="all">{lang === "pt" ? "Todos" : "All"}</option>
            <option value="sent">{lang === "pt" ? "Enviado" : "Sent"}</option>
            <option value="delivered">{lang === "pt" ? "Entregue" : "Delivered"}</option>
            <option value="opened">{lang === "pt" ? "Aberto" : "Opened"}</option>
            <option value="clicked">{lang === "pt" ? "Clicado" : "Clicked"}</option>
            <option value="failed">{lang === "pt" ? "Falhou" : "Failed"}</option>
          </select>
          <button type="button" onClick={refresh} className="flex items-center gap-1 text-[12px] text-neutral-600 hover:text-neutral-900 px-2 py-1.5">
            <RefreshCw size={13} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
        </div>
        <span className="text-[11px] text-neutral-500">
          {rows.length} {lang === "pt" ? "registros" : "records"}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 size={18} className="animate-spin mr-2" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-[13px]">
          {lang === "pt" ? "Nenhum envio registrado ainda." : "No sends recorded yet."}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-8"></th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Quando" : "When"}</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Destinatário" : "Recipient"}</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Assunto" : "Subject"}</th>
                <th className="text-left px-3 py-2 font-medium">{lang === "pt" ? "Persona" : "Persona"}</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-3 py-2">{statusIcon(r.status)}</td>
                  <td className="px-3 py-2 text-neutral-600 text-[11px]">
                    {new Date(r.sent_at || r.created_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{r.client_name || r.recipient_address}</div>
                    {r.client_name && <div className="text-[10px] text-neutral-500">{r.recipient_address}</div>}
                  </td>
                  <td className="px-3 py-2 text-neutral-700 truncate max-w-[300px]">{r.draft_subject || "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-neutral-600">
                    {r.draft_persona ? personaLabel(r.draft_persona, personas, lang) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    <span className={`uppercase font-medium ${
                      r.status === "sent" || r.status === "delivered" ? "text-emerald-700"
                      : r.status === "failed" || r.status === "bounced" ? "text-red-700"
                      : "text-neutral-600"
                    }`}>
                      {r.status}
                    </span>
                    {r.error_message && (
                      <div className="text-[10px] text-red-600 mt-0.5 truncate max-w-[200px]" title={r.error_message}>
                        {r.error_message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Personas tab (Phase 30) ──────────────────────────────────────────────────

function PersonasTab({ lang, personas, loading, onRefresh }: {
  lang: Lang; personas: MailingPersona[]; loading: boolean; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<MailingPersona | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] text-neutral-500 leading-relaxed max-w-2xl">
          {lang === "pt"
            ? "Cada persona tem um prompt de IA editável que define o tom, foco e estrutura do briefing enviado para destinatários daquele cargo. Refine os prompts ao longo dos próximos dias com base no feedback dos usuários — quanto mais específico o prompt, mais útil o conteúdo."
            : "Each persona carries an editable AI prompt that defines the tone, focus, and structure of the briefing sent to recipients of that role. Refine the prompts over the coming days based on user feedback — the more specific the prompt, the more useful the content."}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-[12px] text-neutral-600 hover:text-neutral-900 px-2 py-1.5"
          >
            <RefreshCw size={13} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
          <button type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90"
          >
            <Plus size={14} />
            {lang === "pt" ? "Nova Persona" : "New Persona"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 size={18} className="animate-spin mr-2" />
        </div>
      ) : personas.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-[13px]">
          {lang === "pt" ? "Nenhuma persona cadastrada." : "No personas yet."}
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
          {personas.map((p) => (
            <PersonaCard key={p.id} persona={p} lang={lang} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <PersonaFormModal
          persona={editing}
          lang={lang}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function PersonaCard({ persona, lang, onEdit }: {
  persona: MailingPersona; lang: Lang; onEdit: () => void;
}) {
  const desc = lang === "pt" ? persona.description_pt : persona.description_en;
  const promptPreview = ((lang === "pt" ? persona.system_prompt_pt : persona.system_prompt_en) ?? "")
    .slice(0, 180);
  return (
    <div
      className={`bg-white border rounded-lg p-4 transition-colors ${
        persona.active ? "border-neutral-200 hover:border-neutral-300" : "border-dashed border-neutral-300 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[14px] font-bold text-neutral-900 truncate">
              {lang === "pt" ? persona.name_pt : persona.name_en}
            </p>
            {persona.is_builtin && (
              <span className="text-[9px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Lock size={9} />
                {lang === "pt" ? "padrão" : "built-in"}
              </span>
            )}
            {!persona.active && (
              <span className="text-[9px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                {lang === "pt" ? "inativa" : "inactive"}
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-neutral-400">{persona.slug}</p>
        </div>
        <button type="button"
          onClick={onEdit}
          className="p-1.5 text-neutral-500 hover:text-brand-primary hover:bg-neutral-100 rounded shrink-0"
          title={lang === "pt" ? "Editar" : "Edit"}
        >
          <Pencil size={14} />
        </button>
      </div>

      {desc && <p className="text-[11px] text-neutral-600 mb-2 leading-relaxed">{desc}</p>}

      {persona.content_focus.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {persona.content_focus.map((c) => (
            <span key={c} className="text-[9px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}

      {promptPreview && (
        <div className="mt-2 pt-2 border-t border-neutral-100">
          <p className="text-[9px] uppercase font-bold text-neutral-400 mb-1">
            {lang === "pt" ? "Prompt (preview)" : "Prompt (preview)"}
          </p>
          <p className="text-[10px] text-neutral-500 leading-relaxed line-clamp-3 font-mono">
            {promptPreview}{promptPreview.length >= 180 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function PersonaFormModal({ persona, lang, onClose, onSaved }: {
  persona: MailingPersona | null; lang: Lang; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!persona;
  const [slug, setSlug] = useState(persona?.slug ?? "");
  const [namePt, setNamePt] = useState(persona?.name_pt ?? "");
  const [nameEn, setNameEn] = useState(persona?.name_en ?? "");
  const [descPt, setDescPt] = useState(persona?.description_pt ?? "");
  const [descEn, setDescEn] = useState(persona?.description_en ?? "");
  const [promptPt, setPromptPt] = useState(persona?.system_prompt_pt ?? "");
  const [promptEn, setPromptEn] = useState(persona?.system_prompt_en ?? "");
  const [contentFocus, setContentFocus] = useState<string[]>(persona?.content_focus ?? []);
  const [defaultCultures, setDefaultCultures] = useState<string[]>(persona?.default_culture_filter ?? []);
  const [position, setPosition] = useState<number>(persona?.position ?? 100);
  const [active, setActive] = useState(persona?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLangTab, setActiveLangTab] = useState<"pt" | "en">("pt");

  const toggleFocus = (c: string) =>
    setContentFocus((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const toggleCulture = (c: string) =>
    setDefaultCultures((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const handleSubmit = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!isEdit && !slug.trim()) {
      setError(lang === "pt" ? "Slug é obrigatório" : "Slug is required");
      return;
    }
    if (!namePt.trim() || !nameEn.trim()) {
      setError(lang === "pt" ? "Nomes em PT e EN são obrigatórios" : "Names in PT and EN are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name_pt: namePt.trim(),
        name_en: nameEn.trim(),
        description_pt: descPt.trim() || null,
        description_en: descEn.trim() || null,
        system_prompt_pt: promptPt || null,
        system_prompt_en: promptEn || null,
        content_focus: contentFocus,
        default_culture_filter: defaultCultures,
        position,
        active,
      };
      if (!isEdit) payload.slug = slug.trim().toLowerCase();

      const url = isEdit
        ? `/api/mailing/personas?id=${persona!.id}`
        : "/api/mailing/personas";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: { success?: boolean; error?: string } | null = null;
      try { json = await res.json(); } catch { /* non-JSON */ }
      if (res.ok && json?.success) {
        onSaved();
      } else {
        const msg = json?.error || `HTTP ${res.status} ${res.statusText}`;
        console.error("[mailing/persona] save failed:", msg, json);
        setError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[mailing/persona] save threw:", err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!persona) return;
    if (!confirm(lang === "pt"
      ? "Desativar esta persona? Destinatários existentes ficam intactos, mas a persona não aparece mais nos dropdowns."
      : "Deactivate this persona? Existing recipients are kept, but it stops appearing in dropdowns.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mailing/personas?id=${persona.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) onSaved();
      else setError(json?.error || `HTTP ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-brand-primary" />
            <h2 className="text-[15px] font-bold">
              {isEdit
                ? (lang === "pt" ? "Editar Persona" : "Edit Persona")
                : (lang === "pt" ? "Nova Persona" : "New Persona")}
            </h2>
            {isEdit && persona!.is_builtin && (
              <span className="text-[10px] font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded inline-flex items-center gap-1">
                <Lock size={10} />
                {lang === "pt" ? "padrão" : "built-in"}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Slug + position + active */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                Slug *
                <span className="text-neutral-400 font-normal"> · {isEdit ? (lang === "pt" ? "imutável" : "immutable") : "ascii_snake_case"}</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={isEdit}
                placeholder="ex: marketing"
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px] font-mono disabled:bg-neutral-50 disabled:text-neutral-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Posição (ordem)" : "Position (order)"}
              </label>
              <input
                type="number"
                value={position}
                onChange={(e) => setPosition(parseInt(e.target.value) || 0)}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px]"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[12px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                {lang === "pt" ? "Ativa" : "Active"}
              </label>
            </div>
          </div>

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Nome (PT) *" : "Name (PT) *"}
              </label>
              <input
                type="text"
                value={namePt}
                onChange={(e) => setNamePt(e.target.value)}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Nome (EN) *" : "Name (EN) *"}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[13px]"
              />
            </div>
          </div>

          {/* Descriptions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Descrição (PT)" : "Description (PT)"}
              </label>
              <textarea
                value={descPt}
                onChange={(e) => setDescPt(e.target.value)}
                rows={2}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                {lang === "pt" ? "Descrição (EN)" : "Description (EN)"}
              </label>
              <textarea
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                rows={2}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px]"
              />
            </div>
          </div>

          {/* AI Prompt — large editor with PT/EN toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-neutral-700 block">
                {lang === "pt" ? "Prompt de IA (system prompt)" : "AI Prompt (system prompt)"}
                <span className="text-neutral-400 font-normal"> · {lang === "pt" ? "usado pelo cron de briefing" : "used by the briefing cron"}</span>
              </label>
              <div className="flex items-center gap-1">
                <button type="button"
                  onClick={() => setActiveLangTab("pt")}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    activeLangTab === "pt" ? "bg-brand-primary text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >PT</button>
                <button type="button"
                  onClick={() => setActiveLangTab("en")}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    activeLangTab === "en" ? "bg-brand-primary text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >EN</button>
              </div>
            </div>
            {activeLangTab === "pt" ? (
              <textarea
                value={promptPt}
                onChange={(e) => setPromptPt(e.target.value)}
                rows={12}
                placeholder={lang === "pt"
                  ? "Você está escrevendo um briefing para [persona]. Foco principal: ..."
                  : "You are writing a briefing for [persona]. Main focus: ..."}
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px] font-mono leading-relaxed"
              />
            ) : (
              <textarea
                value={promptEn}
                onChange={(e) => setPromptEn(e.target.value)}
                rows={12}
                placeholder="You are writing a briefing for [persona]. Main focus: ..."
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-[12px] font-mono leading-relaxed"
              />
            )}
          </div>

          {/* Content focus */}
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Foco de conteúdo" : "Content focus"}
              <span className="text-neutral-400 font-normal"> · {lang === "pt" ? "categorias que esta persona prioriza" : "categories this persona prioritises"}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_FOCUS_OPTIONS.map((c) => (
                <button type="button" key={c} onClick={() => toggleFocus(c)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    contentFocus.includes(c)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Default culture filter */}
          <div>
            <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
              {lang === "pt" ? "Filtro padrão de culturas" : "Default culture filter"}
              <span className="text-neutral-400 font-normal"> · {lang === "pt" ? "sugestão para novos destinatários" : "suggestion for new recipients"}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CULTURE_OPTIONS.map((c) => (
                <button type="button" key={c} onClick={() => toggleCulture(c)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    defaultCultures.includes(c)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-[12px] px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-neutral-200">
          {isEdit && persona!.active ? (
            <button type="button" onClick={handleDelete}
              className="flex items-center gap-1.5 text-red-600 text-[12px] hover:bg-red-50 px-3 py-1.5 rounded">
              <Trash2 size={13} />
              {lang === "pt" ? "Desativar" : "Deactivate"}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-[12px] text-neutral-600 hover:text-neutral-900 px-3 py-1.5">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 bg-brand-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-primary/90 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
