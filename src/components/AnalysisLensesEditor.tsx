"use client";

/**
 * AnalysisLensesEditor — Settings → Editable Prompts panel (Phase 24B).
 *
 * Lists every analysis lens (rows in `analysis_lenses`), lets the user
 * edit the search-query template + OpenAI system prompt + sampling
 * params, and offers an "Add lens" form for new lenses. Builtins
 * (retailer / industry / generic) can be edited but not deleted; the UI
 * greys out delete and the API enforces the same rule server-side.
 *
 * Lifecycle: lens edits take effect on the very next /api/company-research
 * call — that route does a fresh DB lookup per request, so there's no
 * cache to invalidate.
 */

import { useEffect, useMemo, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Loader2, Save, Plus, Trash2, Sparkles, AlertCircle, Check, User } from "lucide-react";

type LensKind = "task" | "viewer";

interface Lens {
  id: string;
  label_pt: string;
  label_en: string | null;
  description: string | null;
  search_template: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
  is_builtin: boolean;
  kind?: LensKind;   // mig 068 — task (UI action prompts) / viewer (persona viewpoints)
  updated_at?: string;
}

export function AnalysisLensesEditor({ lang }: { lang: Lang }) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<LensKind>("task");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis-lenses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setLenses(data.lenses || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const { counts: tabCounts, visible: visibleLenses } = useTabData(lenses, activeTab);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center gap-2 text-[13px] text-neutral-500">
        <Loader2 size={16} className="animate-spin" />
        {lang === "pt" ? "Carregando lentes..." : "Loading lenses..."}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-purple-100 flex items-center justify-center">
            <Sparkles size={18} className="text-purple-600" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-neutral-900">
              {lang === "pt" ? "Lentes de Análise" : "Analysis Lenses"}
            </h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {lang === "pt"
                ? "Tarefas: prompts dos botões \"Pesquisar na Web\" e \"Análise IA\". Personas: pontos de vista seedados do repo agents/ para uso em briefings e chats."
                : "Tasks: prompts for Web Search / AI Analysis buttons. Personas: viewpoints seeded from the agents/ repo for briefings and chat."}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold border border-brand-primary/30 bg-brand-surface text-brand-primary hover:bg-brand-primary/10 transition-all shrink-0"
        >
          <Plus size={13} />
          {lang === "pt" ? "Nova lente" : "New lens"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-700 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
          {error.includes("relation") && (
            <span className="text-red-500">
              {lang === "pt"
                ? " — aplique a migration 036_analysis_lenses.sql"
                : " — apply migration 036_analysis_lenses.sql"}
            </span>
          )}
        </div>
      )}

      {/* Tab switcher — task (UI action prompts) vs viewer (personas) */}
      <TabSwitcher active={activeTab} onChange={setActiveTab} counts={tabCounts} lang={lang} />

      {showAddForm && (
        <NewLensForm
          lang={lang}
          defaultKind={activeTab}
          onCancel={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}

      <div className="space-y-2">
        {visibleLenses.map((l) => (
          <LensRow
            key={l.id}
            lens={l}
            open={openId === l.id}
            onToggle={() => setOpenId((prev) => (prev === l.id ? null : l.id))}
            onSaved={load}
            onDeleted={load}
            lang={lang}
          />
        ))}
        {visibleLenses.length === 0 && !error && (
          <p className="text-[12px] text-neutral-400 italic py-3">
            {activeTab === "viewer"
              ? lang === "pt"
                ? "Nenhuma persona seedada. Rode src/scripts/seed-viewer-lenses.ts."
                : "No personas seeded. Run src/scripts/seed-viewer-lenses.ts."
              : lang === "pt"
                ? "Nenhuma lente cadastrada."
                : "No lenses registered."}
          </p>
        )}
      </div>
    </div>
  );
}

// Counts + filter computed from the full lens list. Extracted via
// useMemo so re-renders don't repeat work on every keystroke inside
// an open LensRow.
function useTabData(lenses: Lens[], activeTab: LensKind) {
  return useMemo(() => {
    const task = lenses.filter((l) => (l.kind ?? "task") === "task");
    const viewer = lenses.filter((l) => l.kind === "viewer");
    const counts = { task: task.length, viewer: viewer.length };
    const visible = activeTab === "viewer" ? viewer : task;
    return { counts, visible };
  }, [lenses, activeTab]);
}

function TabSwitcher({
  active,
  onChange,
  counts,
  lang,
}: {
  active: LensKind;
  onChange: (k: LensKind) => void;
  counts: { task: number; viewer: number };
  lang: Lang;
}) {
  const tabs: { kind: LensKind; labelPt: string; labelEn: string; Icon: typeof Sparkles }[] = [
    { kind: "task", labelPt: "Tarefas", labelEn: "Tasks", Icon: Sparkles },
    { kind: "viewer", labelPt: "Personas", labelEn: "Personas", Icon: User },
  ];
  return (
    <div className="flex items-center gap-1 mb-3 border-b border-neutral-200">
      {tabs.map((t) => {
        const isActive = t.kind === active;
        const label = lang === "pt" ? t.labelPt : t.labelEn;
        return (
          <button
            key={t.kind}
            onClick={() => onChange(t.kind)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
              isActive
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <t.Icon size={13} />
            {label}
            <span
              className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isActive ? "bg-brand-primary/10 text-brand-primary" : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {counts[t.kind]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Existing lens row ──────────────────────────────────────────────────────

function LensRow({
  lens,
  open,
  onToggle,
  onSaved,
  onDeleted,
  lang,
}: {
  lens: Lens;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  lang: Lang;
}) {
  const [draft, setDraft] = useState<Lens>(lens);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reset draft if upstream lens changes (e.g. after another save)
  useEffect(() => {
    setDraft(lens);
  }, [lens]);

  const dirty =
    draft.label_pt !== lens.label_pt ||
    (draft.label_en || "") !== (lens.label_en || "") ||
    (draft.description || "") !== (lens.description || "") ||
    draft.search_template !== lens.search_template ||
    draft.system_prompt !== lens.system_prompt ||
    draft.model !== lens.model ||
    Number(draft.temperature) !== Number(lens.temperature) ||
    Number(draft.max_tokens) !== Number(lens.max_tokens) ||
    draft.enabled !== lens.enabled;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/analysis-lenses?id=${encodeURIComponent(lens.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label_pt: draft.label_pt,
          label_en: draft.label_en,
          description: draft.description,
          search_template: draft.search_template,
          system_prompt: draft.system_prompt,
          model: draft.model,
          temperature: Number(draft.temperature),
          max_tokens: Number(draft.max_tokens),
          enabled: draft.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      setSavedAt(Date.now());
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (lens.is_builtin) return;
    if (!confirm(lang === "pt" ? `Remover lente "${lens.id}"?` : `Delete lens "${lens.id}"?`)) return;
    try {
      const res = await fetch(`/api/analysis-lenses?id=${encodeURIComponent(lens.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover");
      onDeleted();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-neutral-900">{lens.label_pt}</span>
            <span className="text-[10px] font-mono text-neutral-400">{lens.id}</span>
            {lens.is_builtin && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 uppercase">
                builtin
              </span>
            )}
            {!lens.enabled && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                disabled
              </span>
            )}
          </div>
          {lens.description && (
            <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{lens.description}</p>
          )}
        </div>
        <span className="text-[10px] text-neutral-300 shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50/50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Labeled label={lang === "pt" ? "Label (PT)" : "Label (PT)"}>
              <input
                value={draft.label_pt}
                onChange={(e) => setDraft({ ...draft, label_pt: e.target.value })}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Labeled>
            <Labeled label={lang === "pt" ? "Label (EN)" : "Label (EN)"}>
              <input
                value={draft.label_en || ""}
                onChange={(e) => setDraft({ ...draft, label_en: e.target.value })}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Labeled>
          </div>

          <Labeled label={lang === "pt" ? "Descrição interna" : "Internal description"}>
            <input
              value={draft.description || ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </Labeled>

          <Labeled
            label={lang === "pt" ? "Template de busca" : "Search template"}
            hint={lang === "pt" ? "Use {{name}} como placeholder do nome da empresa" : "Use {{name}} as the company name placeholder"}
          >
            <input
              value={draft.search_template}
              onChange={(e) => setDraft({ ...draft, search_template: e.target.value })}
              className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </Labeled>

          <Labeled label={lang === "pt" ? "System prompt (OpenAI)" : "System prompt (OpenAI)"}>
            <textarea
              value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
              rows={6}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30 leading-relaxed"
            />
          </Labeled>

          <div className="grid grid-cols-3 gap-3">
            <Labeled label="Model">
              <input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Labeled>
            <Labeled label="Temperature">
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={draft.temperature}
                onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Labeled>
            <Labeled label="Max tokens">
              <input
                type="number"
                step="50"
                min="50"
                max="4000"
                value={draft.max_tokens}
                onChange={(e) => setDraft({ ...draft, max_tokens: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Labeled>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-200">
            <label className="flex items-center gap-2 text-[12px] text-neutral-600">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />
              {lang === "pt" ? "Habilitada" : "Enabled"}
            </label>

            <div className="flex items-center gap-2">
              {err && <span className="text-[11px] text-red-600">{err}</span>}
              {savedAt && Date.now() - savedAt < 3000 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <Check size={12} />
                  {lang === "pt" ? "Salvo" : "Saved"}
                </span>
              )}
              {!lens.is_builtin && (
                <button
                  onClick={remove}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={11} />
                  {lang === "pt" ? "Remover" : "Delete"}
                </button>
              )}
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                {lang === "pt" ? "Salvar" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New lens form ──────────────────────────────────────────────────────────

function NewLensForm({
  lang,
  defaultKind,
  onCancel,
  onCreated,
}: {
  lang: Lang;
  defaultKind: LensKind;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [id, setId] = useState("");
  const [labelPt, setLabelPt] = useState("");
  const [searchTemplate, setSearchTemplate] = useState("{{name}} Brasil");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/analysis-lenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.trim().toLowerCase(),
          label_pt: labelPt,
          search_template: searchTemplate,
          system_prompt: systemPrompt,
          kind: defaultKind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar");
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 p-3 border border-purple-200 bg-purple-50/40 rounded-md space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Labeled label={lang === "pt" ? "ID (kebab-case)" : "ID (kebab-case)"}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="ex: producer"
            className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
          />
        </Labeled>
        <Labeled label={lang === "pt" ? "Label (PT)" : "Label (PT)"}>
          <input
            value={labelPt}
            onChange={(e) => setLabelPt(e.target.value)}
            placeholder="ex: Produtor Rural"
            className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
          />
        </Labeled>
      </div>
      <Labeled label={lang === "pt" ? "Template de busca" : "Search template"}>
        <input
          value={searchTemplate}
          onChange={(e) => setSearchTemplate(e.target.value)}
          className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
        />
      </Labeled>
      <Labeled label="System prompt">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
        />
      </Labeled>

      <div className="flex items-center justify-end gap-2">
        {err && <span className="text-[11px] text-red-600 mr-auto">{err}</span>}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-[11px] font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          {lang === "pt" ? "Cancelar" : "Cancel"}
        </button>
        <button
          onClick={create}
          disabled={!id.trim() || !labelPt.trim() || !systemPrompt.trim() || saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          {lang === "pt" ? "Criar lente" : "Create lens"}
        </button>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
}
