/**
 * Seed `analysis_lenses` with viewer lenses pulled from the agents repo.
 *
 * Source of truth: `stakeholders/agrisafe/<slug>/persona.md` in the
 * neighbouring agents repo. Each persona becomes one row with
 * `kind='viewer'` and `is_builtin=true`. The `system_prompt` is the
 * persona.md body (Portuguese LLM injection rule). `market-hub.md` is
 * intentionally NOT concatenated — it's platform-UX documentation, not
 * identity/voice, and would bloat the prompt.
 *
 * Curation: only the 8 personas that actively consume the Market Hub.
 * The other 11 org roles stay in the agents repo but are not seeded.
 *
 * Idempotent — re-runs upsert on `id`.
 *
 * Usage:  npx tsx src/scripts/seed-viewer-lenses.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Neighbouring agents repo on the developer machine. Keep this path
// dev-only — production seeds should run once from a trusted machine.
const AGENTS_ROOT = resolve(
  process.cwd(),
  "..",
  "agents",
  "stakeholders",
  "agrisafe",
);

type PersonaSeed = {
  slug: string;           // folder name in agents repo + lens id
  labelPt: string;
  labelEn: string;
  description: string;
  searchTemplate: string; // ignored for viewer lenses but column is NOT NULL
};

const PERSONAS: PersonaSeed[] = [
  {
    slug: "ceo",
    labelPt: "Visão CEO",
    labelEn: "CEO View",
    description: "Viewpoint executivo: impacto estratégico, portfólio, posicionamento.",
    searchTemplate: "{{name}} análise estratégica",
  },
  {
    slug: "head-inteligencia",
    labelPt: "Head Inteligência",
    labelEn: "Head of Intelligence",
    description: "Power user de dados: qualidade, fontes, rigor analítico.",
    searchTemplate: "{{name}} dados fontes qualidade",
  },
  {
    slug: "head-comercial",
    labelPt: "Head Comercial",
    labelEn: "Head of Sales",
    description: "Pipeline, territórios, prospects — lente de geração de receita.",
    searchTemplate: "{{name}} oportunidade comercial",
  },
  {
    slug: "digital-marketing",
    labelPt: "Marketing Digital",
    labelEn: "Digital Marketing",
    description: "Conteúdo, campanhas, SEO — transforma mercado em publicação.",
    searchTemplate: "{{name}} conteúdo mercado",
  },
  {
    slug: "consultor-senior-estrategia",
    labelPt: "Consultor Sênior — Estratégia",
    labelEn: "Senior Consultant — Strategy",
    description: "Diagnóstico setorial, cadeia produtiva, recomendações executivas.",
    searchTemplate: "{{name}} diagnóstico estratégico",
  },
  {
    slug: "consultor-senior-credito",
    labelPt: "Consultor Sênior — Crédito",
    labelEn: "Senior Consultant — Credit",
    description: "Risco de crédito, reestruturação, exposição a commodity.",
    searchTemplate: "{{name}} risco crédito reestruturação",
  },
  {
    slug: "data-analyst",
    labelPt: "Data Analyst",
    labelEn: "Data Analyst",
    description: "Dashboards, visualização, qualidade de dados, consumo por outras personas.",
    searchTemplate: "{{name}} dashboard bi dados",
  },
  {
    slug: "sdr-analyst",
    labelPt: "SDR Analyst",
    labelEn: "SDR Analyst",
    description: "Prospecting, enrichment, qualificação BANT com dados de mercado.",
    searchTemplate: "{{name}} prospect lead qualificação",
  },
];

function readPersonaPrompt(slug: string): string {
  const path = resolve(AGENTS_ROOT, slug, "persona.md");
  if (!existsSync(path)) {
    throw new Error(`persona.md not found at ${path}`);
  }
  return readFileSync(path, "utf-8").trim();
}

(async () => {
  try {
    const rows = PERSONAS.map((p) => ({
      id: `viewer_${p.slug.replace(/-/g, "_")}`,
      label_pt: p.labelPt,
      label_en: p.labelEn,
      description: p.description,
      search_template: p.searchTemplate,
      system_prompt: readPersonaPrompt(p.slug),
      kind: "viewer",
      is_builtin: true,
      enabled: true,
      // Default model / temperature / max_tokens come from the column
      // defaults (gpt-4o-mini / 0.30 / 400) — keep in sync with the
      // task lenses until Settings lets the editor override per-row.
    }));

    const { error } = await supabase
      .from("analysis_lenses")
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
    console.log(`✓ Upserted ${rows.length} viewer lenses`);
    for (const r of rows) {
      console.log(`  - ${r.id.padEnd(38)} (${r.label_pt})`);
    }
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
})();
