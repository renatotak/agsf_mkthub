"use client";

import { useEffect, useRef, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { Globe, Bell, LogOut, Menu, Search, Loader2, ArrowRight } from "lucide-react";

interface ActivityRow {
  id: string;
  source: string;
  source_kind: string;
  action: string;
  target_table: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface HeaderProps {
  lang: Lang;
  onToggleLang: () => void;
  onLogout: () => void;
  onToggleMobileSidebar: () => void;
  moduleTitle: string;
  moduleSubtitle?: string;
  /** Optional: navigate to settings (used by the "Ver todas" link in the bell dropdown). */
  onOpenSettings?: () => void;
}

function formatRelative(iso: string, lang: Lang): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return lang === "pt" ? "agora" : "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "pt" ? "agora" : "just now";
  if (mins < 60) return lang === "pt" ? `${mins} min atrás` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "pt" ? `${hrs} h atrás` : `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return lang === "pt" ? `${days} d atrás` : `${days} d ago`;
  return new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

export function Header({ lang, onToggleLang, onLogout, onToggleMobileSidebar, moduleTitle, moduleSubtitle, onOpenSettings }: HeaderProps) {
  const tn = t(lang).notifications;

  // Bell dropdown state — reads last 10 activity_log rows via /api/activity
  const [bellOpen, setBellOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bellOpen]);

  const fetchActivities = async () => {
    setActivitiesLoading(true);
    setActivitiesError(false);
    try {
      const res = await fetch("/api/activity?limit=10");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setActivities((json.activities as ActivityRow[]) || []);
    } catch {
      setActivitiesError(true);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const toggleBell = () => {
    const next = !bellOpen;
    setBellOpen(next);
    if (next) fetchActivities();
  };

  return (
    <header className="fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] h-[var(--header-height)] bg-white border-b border-neutral-200 z-[90] flex items-center justify-between px-4 md:px-8 transition-[left] duration-200 ease-out">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 rounded-md text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-[20px] font-bold text-neutral-900 leading-tight">{moduleTitle}</h1>
          {moduleSubtitle && (
            <p className="text-[12px] text-neutral-500">{moduleSubtitle}</p>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Search (desktop) */}
        <div className="hidden lg:flex items-center gap-2 bg-white border border-neutral-300 rounded-md px-3 py-2 mr-2 focus-within:border-brand-primary focus-within:shadow-[0_0_0_3px_rgba(91,122,47,0.12)] transition-all">
          <Search size={16} className="text-neutral-400" />
          <input
            type="text"
            placeholder={lang === "pt" ? "Buscar..." : "Search..."}
            className="bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none w-48"
          />
        </div>

        {/* Notifications — bell dropdown wired to /api/activity (Phase 24G2) */}
        <div ref={bellRef} className="relative">
          <button
            onClick={toggleBell}
            className="relative p-2 rounded-md text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
            aria-label={tn.title}
            aria-haspopup="dialog"
            aria-expanded={bellOpen}
          >
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
          </button>
          {bellOpen && (
            <div
              role="dialog"
              aria-label={tn.title}
              className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-neutral-200 z-[100] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-neutral-100">
                <h3 className="text-sm font-semibold text-neutral-800">{tn.title}</h3>
                <p className="text-[11px] text-neutral-500">{tn.subtitle}</p>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {activitiesLoading ? (
                  <div className="flex items-center justify-center py-8 text-neutral-400">
                    <Loader2 size={18} className="animate-spin mr-2" />
                    <span className="text-xs">{tn.loading}</span>
                  </div>
                ) : activitiesError ? (
                  <p className="text-center text-xs text-error py-6 px-4">{tn.loadError}</p>
                ) : activities.length === 0 ? (
                  <p className="text-center text-xs text-neutral-400 py-6 px-4">{tn.empty}</p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {activities.map((a) => (
                      <li key={a.id} className="px-4 py-2.5 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              a.action === "error"
                                ? "bg-error"
                                : a.source_kind === "manual"
                                  ? "bg-brand-primary"
                                  : "bg-neutral-300"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-neutral-800 truncate">
                              <span className="font-mono text-[11px] text-neutral-500">{a.source}</span>
                              <span className="text-neutral-400"> · </span>
                              <span>{a.action}</span>
                              <span className="text-neutral-400"> → </span>
                              <span className="text-neutral-600">{a.target_table}</span>
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {formatRelative(a.created_at, lang)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {onOpenSettings && (
                <button
                  onClick={() => {
                    setBellOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full px-4 py-2.5 border-t border-neutral-100 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 transition-colors flex items-center justify-center gap-1.5"
                >
                  {tn.viewAll}
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Language */}
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
        >
          <Globe size={18} />
          <span className="hidden sm:inline">{lang === "pt" ? "EN" : "PT"}</span>
        </button>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-brand-surface text-brand-dark flex items-center justify-center text-[12px] font-semibold ml-1">
          A
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="p-2 rounded-md text-neutral-400 hover:bg-error-light hover:text-error transition-colors ml-1"
          aria-label={lang === "pt" ? "Sair" : "Logout"}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
