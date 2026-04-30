// ─── Regulatory Doc-Type Registry ───────────────────────────────────────────
//
// Canonical visual + textual metadata for every `regulatory_norms.norm_type`
// value produced anywhere in the codebase. Sources scanned:
//   - src/lib/extract-norms-from-news.ts  (lei, lei_complementar, decreto,
//                                          medida_provisoria, instrucao,
//                                          instrucao_normativa, resolucao,
//                                          circular, portaria, provimento,
//                                          recomendacao)
//   - src/jobs/sync-cnj-atos.ts           (provimento, resolucao, portaria,
//                                          recomendacao, instrucao_normativa,
//                                          parecer, outros)
//   - src/jobs/sync-cvm-agro.ts           (instrucao, resolucao)
//   - src/jobs/sync-bcb-rural.ts          (outros, comunicado, instrucao_normativa)
//   - src/jobs/sync-key-agro-laws.ts      (lei, lei_complementar)
//   - src/jobs/sync-regulatory.ts         (resolucao, circular, instrucao_normativa,
//                                          decreto, medida_provisoria, portaria,
//                                          outros)
//   - ROADMAP Phase 7b (BACEN MCR)        (manual)
//
// Color palette stays inside the AgriSafe agribusiness palette (greens, ambers,
// blues, purples, slates). Each badge is a soft tinted background + darker text.

import type { LucideIcon } from "lucide-react";
import {
  Scale,
  ScrollText,
  FileSignature,
  AlertOctagon,
  ClipboardList,
  BookOpen,
  Send,
  Megaphone,
  FileCheck2,
  Lightbulb,
  Stamp,
  BookMarked,
  FileText,
} from "lucide-react";

export interface NormTypeMeta {
  /** Canonical key as stored in `regulatory_norms.norm_type`. */
  key: string;
  /** Short PT-BR label (badge text). */
  pt: string;
  /** Short EN label (badge text). */
  en: string;
  /** Longer PT-BR description (hover tooltip). */
  descPt: string;
  /** Longer EN description (hover tooltip). */
  descEn: string;
  /** Tailwind classes for the soft tinted badge (bg + border + text). */
  badgeClass: string;
  /** Tailwind classes for the active filter chip (filled). */
  chipActiveClass: string;
  /** Tailwind classes for the inactive filter chip (outlined). */
  chipIdleClass: string;
  /** Lucide icon component. */
  Icon: LucideIcon;
}

export const NORM_TYPE_REGISTRY: Record<string, NormTypeMeta> = {
  lei: {
    key: "lei",
    pt: "Lei",
    en: "Law",
    descPt: "Lei ordinária aprovada pelo Congresso Nacional.",
    descEn: "Ordinary law passed by the National Congress.",
    badgeClass: "bg-emerald-50 border border-emerald-200 text-emerald-800",
    chipActiveClass: "bg-emerald-700 text-white border border-emerald-700",
    chipIdleClass:
      "bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50",
    Icon: Scale,
  },
  lei_complementar: {
    key: "lei_complementar",
    pt: "Lei Complementar",
    en: "Complementary Law",
    descPt: "Lei complementar — exige quórum qualificado no Congresso.",
    descEn: "Complementary law — requires qualified quorum in Congress.",
    badgeClass: "bg-emerald-50 border border-emerald-300 text-emerald-900",
    chipActiveClass: "bg-emerald-800 text-white border border-emerald-800",
    chipIdleClass:
      "bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-50",
    Icon: Scale,
  },
  decreto: {
    key: "decreto",
    pt: "Decreto",
    en: "Decree",
    descPt: "Ato normativo do Poder Executivo, com força regulamentar.",
    descEn: "Executive branch normative act with regulatory force.",
    badgeClass: "bg-violet-50 border border-violet-200 text-violet-800",
    chipActiveClass: "bg-violet-700 text-white border border-violet-700",
    chipIdleClass:
      "bg-white border border-violet-200 text-violet-800 hover:bg-violet-50",
    Icon: ScrollText,
  },
  decreto_lei: {
    key: "decreto_lei",
    pt: "Decreto-Lei",
    en: "Decree-Law",
    descPt: "Decreto-lei (legado) com força de lei.",
    descEn: "Legacy decree-law with the force of law.",
    badgeClass: "bg-violet-50 border border-violet-300 text-violet-900",
    chipActiveClass: "bg-violet-800 text-white border border-violet-800",
    chipIdleClass:
      "bg-white border border-violet-300 text-violet-900 hover:bg-violet-50",
    Icon: ScrollText,
  },
  medida_provisoria: {
    key: "medida_provisoria",
    pt: "Medida Provisória",
    en: "Provisional Measure",
    descPt:
      "Ato com força de lei editado pelo Presidente, sujeito à conversão pelo Congresso.",
    descEn:
      "Presidential act with the force of law, pending conversion by Congress.",
    badgeClass: "bg-amber-50 border border-amber-300 text-amber-800",
    chipActiveClass: "bg-amber-700 text-white border border-amber-700",
    chipIdleClass:
      "bg-white border border-amber-300 text-amber-800 hover:bg-amber-50",
    Icon: AlertOctagon,
  },
  instrucao_normativa: {
    key: "instrucao_normativa",
    pt: "Instrução Normativa",
    en: "Normative Instruction",
    descPt: "Norma operacional editada por órgão regulador (MAPA, BCB, etc).",
    descEn: "Operational rule issued by a regulator (MAPA, BCB, etc).",
    badgeClass: "bg-sky-50 border border-sky-200 text-sky-800",
    chipActiveClass: "bg-sky-700 text-white border border-sky-700",
    chipIdleClass:
      "bg-white border border-sky-200 text-sky-800 hover:bg-sky-50",
    Icon: ClipboardList,
  },
  instrucao: {
    key: "instrucao",
    pt: "Instrução",
    en: "Instruction",
    descPt: "Instrução normativa — em geral CVM (legado).",
    descEn: "Normative instruction — typically legacy CVM.",
    badgeClass: "bg-sky-50 border border-sky-200 text-sky-700",
    chipActiveClass: "bg-sky-600 text-white border border-sky-600",
    chipIdleClass:
      "bg-white border border-sky-200 text-sky-700 hover:bg-sky-50",
    Icon: ClipboardList,
  },
  resolucao: {
    key: "resolucao",
    pt: "Resolução",
    en: "Resolution",
    descPt:
      "Ato deliberativo de colegiado regulador (CMN, BCB, CVM, CNJ).",
    descEn:
      "Deliberative act of a regulatory board (CMN, BCB, CVM, CNJ).",
    badgeClass: "bg-blue-50 border border-blue-200 text-blue-800",
    chipActiveClass: "bg-blue-700 text-white border border-blue-700",
    chipIdleClass:
      "bg-white border border-blue-200 text-blue-800 hover:bg-blue-50",
    Icon: FileSignature,
  },
  circular: {
    key: "circular",
    pt: "Circular",
    en: "Circular",
    descPt:
      "Circular regulatória — comunicado normativo (tipicamente do BCB).",
    descEn: "Regulatory circular — normative notice (typically from BCB).",
    badgeClass: "bg-cyan-50 border border-cyan-200 text-cyan-800",
    chipActiveClass: "bg-cyan-700 text-white border border-cyan-700",
    chipIdleClass:
      "bg-white border border-cyan-200 text-cyan-800 hover:bg-cyan-50",
    Icon: Send,
  },
  bcb_circular: {
    key: "bcb_circular",
    pt: "Circular BCB",
    en: "BCB Circular",
    descPt: "Circular do Banco Central do Brasil.",
    descEn: "Central Bank of Brazil circular.",
    badgeClass: "bg-cyan-50 border border-cyan-300 text-cyan-900",
    chipActiveClass: "bg-cyan-800 text-white border border-cyan-800",
    chipIdleClass:
      "bg-white border border-cyan-300 text-cyan-900 hover:bg-cyan-50",
    Icon: Send,
  },
  bcb_resolucao: {
    key: "bcb_resolucao",
    pt: "Resolução BCB",
    en: "BCB Resolution",
    descPt: "Resolução do Banco Central do Brasil.",
    descEn: "Central Bank of Brazil resolution.",
    badgeClass: "bg-blue-50 border border-blue-300 text-blue-900",
    chipActiveClass: "bg-blue-800 text-white border border-blue-800",
    chipIdleClass:
      "bg-white border border-blue-300 text-blue-900 hover:bg-blue-50",
    Icon: FileSignature,
  },
  portaria: {
    key: "portaria",
    pt: "Portaria",
    en: "Ordinance",
    descPt:
      "Ato administrativo interno editado por ministro ou autoridade.",
    descEn: "Internal administrative act issued by a minister or authority.",
    badgeClass: "bg-orange-50 border border-orange-200 text-orange-800",
    chipActiveClass: "bg-orange-700 text-white border border-orange-700",
    chipIdleClass:
      "bg-white border border-orange-200 text-orange-800 hover:bg-orange-50",
    Icon: Stamp,
  },
  provimento: {
    key: "provimento",
    pt: "Provimento",
    en: "Ruling",
    descPt: "Provimento — ato normativo do CNJ ou corregedoria.",
    descEn: "Ruling — normative act issued by CNJ or a correctional body.",
    badgeClass: "bg-purple-50 border border-purple-200 text-purple-800",
    chipActiveClass: "bg-purple-700 text-white border border-purple-700",
    chipIdleClass:
      "bg-white border border-purple-200 text-purple-800 hover:bg-purple-50",
    Icon: FileCheck2,
  },
  recomendacao: {
    key: "recomendacao",
    pt: "Recomendação",
    en: "Recommendation",
    descPt: "Recomendação — orientação não vinculante do CNJ ou similar.",
    descEn:
      "Recommendation — non-binding guidance from CNJ or similar bodies.",
    badgeClass: "bg-yellow-50 border border-yellow-200 text-yellow-800",
    chipActiveClass: "bg-yellow-700 text-white border border-yellow-700",
    chipIdleClass:
      "bg-white border border-yellow-200 text-yellow-800 hover:bg-yellow-50",
    Icon: Lightbulb,
  },
  parecer: {
    key: "parecer",
    pt: "Parecer",
    en: "Opinion",
    descPt: "Parecer técnico — manifestação consultiva.",
    descEn: "Technical opinion — advisory statement.",
    badgeClass: "bg-teal-50 border border-teal-200 text-teal-800",
    chipActiveClass: "bg-teal-700 text-white border border-teal-700",
    chipIdleClass:
      "bg-white border border-teal-200 text-teal-800 hover:bg-teal-50",
    Icon: BookOpen,
  },
  deliberacao_cvm: {
    key: "deliberacao_cvm",
    pt: "Deliberação CVM",
    en: "CVM Deliberation",
    descPt: "Deliberação do colegiado da CVM.",
    descEn: "Decision of the CVM board.",
    badgeClass: "bg-indigo-50 border border-indigo-200 text-indigo-800",
    chipActiveClass: "bg-indigo-700 text-white border border-indigo-700",
    chipIdleClass:
      "bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50",
    Icon: FileCheck2,
  },
  oficio: {
    key: "oficio",
    pt: "Ofício",
    en: "Official Letter",
    descPt: "Ofício — comunicação oficial entre órgãos.",
    descEn: "Official letter — communication between government bodies.",
    badgeClass: "bg-stone-50 border border-stone-200 text-stone-800",
    chipActiveClass: "bg-stone-700 text-white border border-stone-700",
    chipIdleClass:
      "bg-white border border-stone-200 text-stone-800 hover:bg-stone-50",
    Icon: Send,
  },
  comunicado: {
    key: "comunicado",
    pt: "Comunicado",
    en: "Notice",
    descPt: "Comunicado oficial — informativo do regulador.",
    descEn: "Official notice — regulator's informative bulletin.",
    badgeClass: "bg-amber-50 border border-amber-200 text-amber-700",
    chipActiveClass: "bg-amber-600 text-white border border-amber-600",
    chipIdleClass:
      "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50",
    Icon: Megaphone,
  },
  ato: {
    key: "ato",
    pt: "Ato",
    en: "Act",
    descPt: "Ato normativo — categoria genérica do CNJ e outros órgãos.",
    descEn: "Normative act — generic category from CNJ and other bodies.",
    badgeClass: "bg-purple-50 border border-purple-200 text-purple-700",
    chipActiveClass: "bg-purple-600 text-white border border-purple-600",
    chipIdleClass:
      "bg-white border border-purple-200 text-purple-700 hover:bg-purple-50",
    Icon: FileCheck2,
  },
  manual: {
    key: "manual",
    pt: "Manual",
    en: "Manual",
    descPt:
      "Manual operacional consolidado (ex: MCR — Manual de Crédito Rural do BCB).",
    descEn:
      "Consolidated operational manual (e.g. MCR — BCB Rural Credit Manual).",
    badgeClass: "bg-lime-50 border border-lime-200 text-lime-800",
    chipActiveClass: "bg-lime-700 text-white border border-lime-700",
    chipIdleClass:
      "bg-white border border-lime-200 text-lime-800 hover:bg-lime-50",
    Icon: BookMarked,
  },
  outros: {
    key: "outros",
    pt: "Outros",
    en: "Other",
    descPt: "Tipo não classificado.",
    descEn: "Unclassified document type.",
    badgeClass: "bg-neutral-100 border border-neutral-200 text-neutral-700",
    chipActiveClass: "bg-neutral-700 text-white border border-neutral-700",
    chipIdleClass:
      "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50",
    Icon: FileText,
  },
};

/**
 * Default badge metadata for any norm_type not present in the registry.
 * Mirrors the `outros` row but keyed by the unknown value so the badge text
 * still says something readable.
 */
export function normTypeMeta(rawType: string | null | undefined): NormTypeMeta {
  if (!rawType) return NORM_TYPE_REGISTRY.outros;
  const hit = NORM_TYPE_REGISTRY[rawType];
  if (hit) return hit;
  // Unknown type — humanize the key but keep the default styling.
  const humanized = rawType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ...NORM_TYPE_REGISTRY.outros,
    key: rawType,
    pt: humanized,
    en: humanized,
    descPt: "Tipo não classificado.",
    descEn: "Unclassified document type.",
  };
}

/** Stable display order for the filter chip row. */
export const NORM_TYPE_DISPLAY_ORDER: string[] = [
  "lei",
  "lei_complementar",
  "decreto",
  "decreto_lei",
  "medida_provisoria",
  "resolucao",
  "bcb_resolucao",
  "circular",
  "bcb_circular",
  "instrucao_normativa",
  "instrucao",
  "deliberacao_cvm",
  "portaria",
  "provimento",
  "ato",
  "recomendacao",
  "parecer",
  "comunicado",
  "oficio",
  "manual",
  "outros",
];
