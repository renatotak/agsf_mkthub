"use client";

/**
 * Phase 29 — Mailing module.
 *
 * Three tabs:
 *   • Rascunhos / Drafts   — queue of mailing_drafts; edit subject/body, click Send
 *   • Destinatários / Clients — CRUD over mailing_clients + culture multi-select
 *   • Enviados / Log       — read-only mailing_log feed
 *
 * All API calls go through /api/mailing/* (built by sister agent). The
 * component is single-file by design so the team can read the whole flow
 * in one place; if it crosses ~1200 LOC we can split out subcomponents.
 */

import { useEffect, useState, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Mail, Send, Pencil, Trash2, Plus, X, Save, Loader2, RefreshCw, Eye,
  CheckCircle2, AlertCircle, Clock, FileText, Users,
} from "lucide-react";

type Tab = "drafts" | "clients" | "log";
type Persona = "ceo" | "intel" | "marketing" | "credit";

const PERSONA_LABELS: Record<Persona, { pt: string; en: string }> = {
  ceo:       { pt: "CEO",                 en: "CEO" },
  intel:     { pt: "Head Inteligência",   en: "Head of Intelligence" },
  marketing: { pt: "Marketing",           en: "Marketing" },
  credit:    { pt: "Crédito",             en: "Credit" },
};

const PERSONAS: Persona[] = ["ceo", "intel", "marketing", "credit"];

const CULTURE_OPTIONS = [
  "soja", "milho", "cafe", "cana-de-acucar", "algodao", "boi-gordo",
  "trigo", "arroz", "feijao",
];

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
  const tr = t(lang);
  const [activeTab, setActiveTab] = useState<Tab>("drafts");

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
        {(["drafts", "clients", "log"] as Tab[]).map((tab) => (
          <button type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab === "drafts" && (lang === "pt" ? "Rascunhos" : "Drafts")}
            {tab === "clients" && (lang === "pt" ? "Destinatários" : "Recipients")}
            {tab === "log" && (lang === "pt" ? "Enviados" : "Sent")}
          </button>
        ))}
      </div>

      {activeTab === "drafts" && <DraftsTab lang={lang} />}
      {activeTab === "clients" && <ClientsTab lang={lang} />}
      {activeTab === "log" && <LogTab lang={lang} />}
    </div>
  );
}

// ─── Drafts tab ───────────────────────────────────────────────────────────────

function DraftsTab({ lang }: { lang: Lang }) {
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
          onClose={() => setEditingDraft(null)}
          onSaved={() => { setEditingDraft(null); refresh(); }}
        />
      )}

      {creating && (
        <DraftCreateModal
          lang={lang}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function DraftCard({ draft, lang, onEdit, onSent, onDelete }: {
  draft: MailingDraft; lang: Lang; onEdit: () => void; onSent: () => void; onDelete: () => void;
}) {
  const [sending, setSending] = useState(false);
  const personaLabel = PERSONA_LABELS[draft.persona][lang];

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
      ? `Enviar este rascunho para todos os destinatários ${personaLabel} com as culturas selecionadas?`
      : `Send this draft to all ${personaLabel} recipients matching the selected cultures?`)) return;
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
              {personaLabel}
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

function DraftEditor({ draft, lang, onClose, onSaved }: {
  draft: MailingDraft; lang: Lang; onClose: () => void; onSaved: () => void;
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
            {lang === "pt" ? "Editar Rascunho" : "Edit Draft"} · {PERSONA_LABELS[draft.persona][lang]}
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

function DraftCreateModal({ lang, onClose, onCreated }: {
  lang: Lang; onClose: () => void; onCreated: () => void;
}) {
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [persona, setPersona] = useState<Persona>("ceo");
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
              {PERSONAS.map((p) => (
                <button type="button"
                  key={p}
                  onClick={() => setPersona(p)}
                  className={`text-[12px] px-2 py-1.5 rounded border ${
                    persona === p
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  {PERSONA_LABELS[p][lang]}
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

function ClientsTab({ lang }: { lang: Lang }) {
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
            {PERSONAS.map((p) => <option key={p} value={p}>{PERSONA_LABELS[p][lang]}</option>)}
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
                  <td className="px-3 py-2"><span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded">{PERSONA_LABELS[c.persona][lang]}</span></td>
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
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ClientFormModal({ client, lang, onClose, onSaved }: {
  client: MailingClient | null; lang: Lang; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!client;
  const [fullName, setFullName] = useState(client?.full_name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [persona, setPersona] = useState<Persona>(client?.persona ?? "ceo");
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
              {PERSONAS.map((p) => (
                <button key={p} onClick={() => setPersona(p)}
                  className={`text-[12px] px-2 py-1.5 rounded border ${
                    persona === p
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}>
                  {PERSONA_LABELS[p][lang]}
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

function LogTab({ lang }: { lang: Lang }) {
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
                    {r.draft_persona ? PERSONA_LABELS[r.draft_persona as Persona]?.[lang] ?? r.draft_persona : "—"}
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
