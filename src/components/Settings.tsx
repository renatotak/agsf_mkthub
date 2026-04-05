"use client";

import { Lang, t } from "@/lib/i18n";
import {
  Download, BarChart3, TestTube, Radar, Newspaper, Calendar, Store,
  PenTool, BookOpen, Scale, Database, Brain, LayoutDashboard,
  Shield, Server, Workflow, ArrowRight,
} from "lucide-react";

const APP_VERSION = "1.0.0";

const FLOW_STEPS = [
  { key: "flowIngest" as const, icon: Download, color: "bg-blue-500" },
  { key: "flowAnalyze" as const, icon: BarChart3, color: "bg-amber-500" },
  { key: "flowCreate" as const, icon: PenTool, color: "bg-brand-primary" },
  { key: "flowComply" as const, icon: Shield, color: "bg-purple-500" },
];

const MODULE_LIST = [
  { key: "modDashboard" as const, icon: LayoutDashboard },
  { key: "modMarket" as const, icon: BarChart3 },
  { key: "modInputs" as const, icon: TestTube },
  { key: "modCompetitors" as const, icon: Radar },
  { key: "modNews" as const, icon: Newspaper },
  { key: "modEvents" as const, icon: Calendar },
  { key: "modRetailers" as const, icon: Store },
  { key: "modContent" as const, icon: PenTool },
  { key: "modRegulatory" as const, icon: BookOpen },
  { key: "modRecuperacao" as const, icon: Scale },
  { key: "modDataSources" as const, icon: Database },
  { key: "modKnowledge" as const, icon: Brain },
];

export function Settings({ lang }: { lang: Lang }) {
  const tr = t(lang).settings;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-[22px] font-bold text-neutral-900">{tr.title}</h2>
        <p className="text-[14px] text-neutral-500 mt-1">{tr.subtitle}</p>
      </div>

      {/* About card */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-[17px] font-bold text-neutral-900 mb-3">{tr.aboutTitle}</h3>
        <p className="text-[14px] text-neutral-700 leading-relaxed">{tr.aboutDescription}</p>
      </div>

      {/* Platform Flow — Ingest > Analyze > Create > Comply */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-5">
          <Workflow size={18} className="text-brand-primary" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.platformFlow}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FLOW_STEPS.map((step, i) => {
            const label = tr[step.key] as string;
            const desc = tr[`${step.key}Desc` as keyof typeof tr] as string;
            return (
              <div key={step.key} className="relative">
                <div className="rounded-lg border border-neutral-200 p-4 h-full hover:border-brand-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-md ${step.color} flex items-center justify-center`}>
                      <step.icon size={15} className="text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                      {i + 1}.
                    </span>
                    <span className="text-[14px] font-bold text-neutral-900">{label}</span>
                  </div>
                  <p className="text-[12px] text-neutral-600 leading-relaxed">{desc}</p>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight size={14} className="text-neutral-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modules */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-[17px] font-bold text-neutral-900 mb-4">{tr.modulesTitle}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULE_LIST.map((mod) => {
            const text = tr[mod.key] as string;
            const dashIdx = text.indexOf("\u2014");
            const name = dashIdx > -1 ? text.slice(0, dashIdx).trim() : text;
            const desc = dashIdx > -1 ? text.slice(dashIdx + 1).trim() : "";
            return (
              <div
                key={mod.key}
                className="flex gap-3 items-start rounded-md border border-neutral-100 p-3 hover:border-neutral-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <mod.icon size={16} className="text-neutral-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-neutral-900">{name}</p>
                  {desc && <p className="text-[12px] text-neutral-500 leading-relaxed mt-0.5">{desc}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data & Privacy */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-brand-primary" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.dataTitle}</h3>
        </div>
        <ul className="space-y-2.5">
          {([
            "dataPublicOnly",
            "dataSources",
            "dataCron",
            "dataLiveApis",
          ] as const).map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-[7px] shrink-0" />
              <span className="text-[13px] text-neutral-700 leading-relaxed">{tr[key]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tech Stack + Version */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Server size={18} className="text-neutral-500" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.techTitle}</h3>
        </div>
        <p className="text-[13px] text-neutral-600 font-mono bg-neutral-50 rounded-md px-3 py-2 border border-neutral-100">
          {tr.techStack}
        </p>
        <p className="text-[12px] text-neutral-400 mt-3">
          {tr.version} {APP_VERSION} &middot; &copy; {new Date().getFullYear()} AgriSafe
        </p>
      </div>
    </div>
  );
}
