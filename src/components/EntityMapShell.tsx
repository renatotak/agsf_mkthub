"use client";

/**
 * EntityMapShell — reusable Painel-style map for entity directories.
 *
 * Phase 24B factored the chrome around DashboardMap (terrain/satellite,
 * fullscreen, recenter, bbox capture, header filter row, optional layer
 * chips, bottom highlights strip) into a single component so the Diretório
 * de Indústrias and Diretório de Canais maps can match the Painel exactly
 * — same controls, same affordances, same look.
 *
 * It is intentionally generic over marker shape: callers pass a flat
 * array of `EntityMapMarker` rows. Layer chips are optional; when omitted
 * the map renders a single uniform marker style.
 *
 * Where it lives in the UI:
 *   • Painel — DashboardMap.tsx still embeds the original (event/weather/news/rj
 *     mix is too domain-specific to flatten). It is the visual reference.
 *   • IndustriesDirectory — uses EntityMapShell with markers built from
 *     cnpj_establishments cache rows.
 *   • RetailersDirectory — uses EntityMapShell with markers built from
 *     retailer_locations rows.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import {
  MapPin, Search, X, RefreshCw, Home, Maximize, Eye, EyeOff, Loader2,
} from "lucide-react";
import type { Lang } from "@/lib/i18n";

// ─── UF coords (subset for centering — full list in DashboardMap) ──────────

const UF_COORDS: Record<string, { lat: number; lng: number }> = {
  SP: { lat: -23.55, lng: -46.63 }, PR: { lat: -25.43, lng: -49.27 },
  MG: { lat: -19.92, lng: -43.94 }, GO: { lat: -16.69, lng: -49.26 },
  MT: { lat: -15.60, lng: -56.09 }, MS: { lat: -20.45, lng: -54.62 },
  RS: { lat: -30.03, lng: -51.23 }, SC: { lat: -27.60, lng: -48.55 },
  BA: { lat: -12.97, lng: -38.51 }, PA: { lat: -1.46, lng: -48.50 },
  TO: { lat: -10.18, lng: -48.33 }, MA: { lat: -2.53, lng: -44.28 },
  PI: { lat: -5.09, lng: -42.80 }, CE: { lat: -3.72, lng: -38.54 },
  PE: { lat: -8.05, lng: -34.87 }, RO: { lat: -8.76, lng: -63.90 },
  AM: { lat: -3.12, lng: -60.02 }, DF: { lat: -15.78, lng: -47.93 },
  ES: { lat: -20.32, lng: -40.34 }, RN: { lat: -5.80, lng: -35.21 },
  PB: { lat: -7.12, lng: -34.86 }, AL: { lat: -9.67, lng: -35.74 },
  SE: { lat: -10.91, lng: -37.07 }, RR: { lat: 2.82, lng: -60.67 },
  AP: { lat: 0.04, lng: -51.07 }, AC: { lat: -9.97, lng: -67.81 },
};

const ALL_UFS = Object.keys(UF_COORDS).sort();

// ─── Public types ──────────────────────────────────────────────────────────

export interface EntityMapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Layer key — must match a `layers[i].key` for filtering, or omit. */
  layer?: string;
  title: string;
  subtitle?: string;
  uf?: string;
  url?: string;
  /** Free-form extra content rendered inside the InfoWindow body. */
  extra?: React.ReactNode;
}

export interface EntityMapLayer {
  key: string;
  label: string;
  /** Hex color — used for the marker dot AND the chip dot. */
  color: string;
}

export interface EntityMapShellProps {
  lang: Lang;
  /** Section title shown in the header (e.g. "Mapa de Revendas"). */
  title?: string;
  /** Right-aligned secondary text. */
  subtitle?: string;
  markers: EntityMapMarker[];
  /** When provided, renders Painel-style toggle chips with marker counts. */
  layers?: EntityMapLayer[];
  /** Optional initial layer visibility (defaults to all on). */
  defaultVisibleLayers?: string[];
  loading?: boolean;
  /** Optional bottom horizontal-scrolling strip — pass JSX or omit. */
  highlightsStrip?: React.ReactNode;
  /** Map height in px (default 550). */
  height?: number;
  /** Stable mapId so AdvancedMarker styling persists across re-renders. */
  mapId?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EntityMapShell({
  lang,
  title,
  subtitle,
  markers,
  layers,
  defaultVisibleLayers,
  loading = false,
  highlightsStrip,
  height = 550,
  mapId = "entity-map",
}: EntityMapShellProps) {
  const MAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // Filter state
  const [ufFilter, setUfFilter] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    () => new Set(defaultVisibleLayers ?? layers?.map((l) => l.key) ?? []),
  );
  const [mapTypeId, setMapTypeId] = useState<"terrain" | "satellite">("terrain");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bbox, setBbox] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [bboxDirty, setBboxDirty] = useState(false);

  const cityRef = useRef<HTMLDivElement>(null);

  // Re-initialize visible layers if the layer set changes
  useEffect(() => {
    if (layers && layers.length > 0) {
      setVisibleLayers((prev) => {
        if (prev.size === 0) return new Set(layers.map((l) => l.key));
        // Add any new layer keys that appeared
        const next = new Set(prev);
        layers.forEach((l) => next.add(l.key));
        return next;
      });
    }
  }, [layers]);

  // Filter markers by layer toggles + UF + city + bbox
  const filteredMarkers = useMemo(() => {
    let m = markers.slice();

    if (layers && layers.length > 0) {
      m = m.filter((mk) => !mk.layer || visibleLayers.has(mk.layer));
    }

    if (ufFilter) {
      m = m.filter((mk) => (mk.uf || "").toUpperCase() === ufFilter);
    }

    if (citySearch) {
      const q = citySearch.toLowerCase();
      m = m.filter((mk) =>
        (mk.subtitle || "").toLowerCase().includes(q) ||
        (mk.title || "").toLowerCase().includes(q),
      );
    }

    if (bbox) {
      m = m.filter(
        (mk) =>
          mk.lat >= bbox.south && mk.lat <= bbox.north &&
          mk.lng >= bbox.west && mk.lng <= bbox.east,
      );
    }

    return m;
  }, [markers, layers, visibleLayers, ufFilter, citySearch, bbox]);

  // Per-layer counts (after UF/city/bbox but before layer toggles)
  const baseFilteredForCounts = useMemo(() => {
    let m = markers.slice();
    if (ufFilter) m = m.filter((mk) => (mk.uf || "").toUpperCase() === ufFilter);
    if (citySearch) {
      const q = citySearch.toLowerCase();
      m = m.filter((mk) =>
        (mk.subtitle || "").toLowerCase().includes(q) || (mk.title || "").toLowerCase().includes(q),
      );
    }
    if (bbox) {
      m = m.filter(
        (mk) =>
          mk.lat >= bbox.south && mk.lat <= bbox.north &&
          mk.lng >= bbox.west && mk.lng <= bbox.east,
      );
    }
    return m;
  }, [markers, ufFilter, citySearch, bbox]);

  const layerCounts = useMemo(() => {
    if (!layers) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const l of layers) counts[l.key] = 0;
    for (const m of baseFilteredForCounts) {
      if (m.layer && counts[m.layer] != null) counts[m.layer]++;
    }
    return counts;
  }, [layers, baseFilteredForCounts]);

  const active = filteredMarkers.find((m) => m.id === activeId);

  // Map center: city → UF → markers fit → default Brazil
  const { mapCenter, mapZoom } = useMemo(() => {
    if (citySearch && filteredMarkers.length > 0) {
      const lats = filteredMarkers.map((m) => m.lat);
      const lngs = filteredMarkers.map((m) => m.lng);
      const center = {
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      };
      return { mapCenter: center, mapZoom: 9 };
    }
    if (ufFilter && UF_COORDS[ufFilter]) return { mapCenter: UF_COORDS[ufFilter], mapZoom: 6 };
    if (filteredMarkers.length > 0 && filteredMarkers.length <= 30) {
      const lats = filteredMarkers.map((m) => m.lat);
      const lngs = filteredMarkers.map((m) => m.lng);
      const center = {
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      };
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const zoom = latSpan < 1 ? 9 : latSpan < 3 ? 7 : latSpan < 8 ? 5 : 4;
      return { mapCenter: center, mapZoom: zoom };
    }
    return { mapCenter: { lat: -15.78, lng: -47.93 }, mapZoom: 4 };
  }, [ufFilter, citySearch, filteredMarkers]);

  // City autocomplete: derive from marker subtitles
  const availableCities = useMemo(() => {
    const set = new Map<string, string>();
    for (const m of markers) {
      if (m.subtitle) set.set(m.subtitle.toLowerCase(), m.subtitle);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [markers]);

  const citySuggestions = useMemo(() => {
    if (!cityQuery.trim()) return availableCities.slice(0, 15);
    const q = cityQuery.trim().toLowerCase();
    return availableCities.filter((c) => c.toLowerCase().includes(q)).slice(0, 10);
  }, [cityQuery, availableCities]);

  // Outside click closes dropdown
  useEffect(() => {
    if (!cityDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cityDropdownOpen]);

  const toggleLayer = (k: string) => {
    setVisibleLayers((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const recenter = () => {
    setUfFilter("");
    setCitySearch("");
    setCityQuery("");
    setBbox(null);
    setBboxDirty(false);
  };

  if (!MAP_KEY) {
    return (
      <div className="bg-neutral-100 rounded-lg border border-neutral-200 p-8 text-center text-neutral-500 text-sm">
        Google Maps API key not configured.
      </div>
    );
  }

  const containerId = `${mapId}-container`;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* ── Title bar (optional) ── */}
      {(title || subtitle) && (
        <div className="px-4 py-2.5 border-b border-neutral-200 flex items-center justify-between">
          {title && (
            <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2">
              {title}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success-light text-success-dark">
                LIVE
              </span>
            </h3>
          )}
          {subtitle && <span className="text-[11px] text-neutral-400">{subtitle}</span>}
        </div>
      )}

      {/* ── Filter row (Painel style) ── */}
      <div className="px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          {/* Layer toggles */}
          {layers && layers.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                {layers.map((l) => (
                  <LayerToggle
                    key={l.key}
                    active={visibleLayers.has(l.key)}
                    onClick={() => toggleLayer(l.key)}
                    color={l.color}
                    label={l.label}
                    count={layerCounts[l.key] || 0}
                  />
                ))}
              </div>
              <div className="h-5 w-px bg-neutral-200 hidden sm:block" />
            </>
          )}

          {/* UF dropdown */}
          <select
            value={ufFilter}
            onChange={(e) => setUfFilter(e.target.value)}
            className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-[11px] h-7 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
          >
            <option value="">{lang === "pt" ? "Todos os estados" : "All states"}</option>
            {ALL_UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>

          {/* City autocomplete */}
          {citySearch ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-surface border border-brand-light rounded text-[11px] h-7 font-medium text-brand-primary">
              <MapPin size={10} />
              {citySearch}
              <button
                onClick={() => {
                  setCitySearch("");
                  setCityQuery("");
                }}
                className="ml-0.5 text-brand-primary/60 hover:text-brand-primary"
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <div className="relative" ref={cityRef}>
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCityDropdownOpen(true);
                }}
                onFocus={() => setCityDropdownOpen(true)}
                placeholder={lang === "pt" ? "Buscar cidade..." : "Search city..."}
                className="pl-7 pr-3 py-1 w-44 bg-neutral-50 border border-neutral-200 rounded text-[11px] h-7 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
              {cityDropdownOpen && citySuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 max-h-52 overflow-y-auto">
                  {citySuggestions.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCitySearch(c);
                        setCityQuery("");
                        setCityDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0"
                    >
                      <MapPin size={11} className="text-neutral-400 shrink-0" />
                      <span className="text-neutral-800">{c}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Marker count */}
          <div className="ml-auto text-[11px] text-neutral-400">
            {loading ? (
              <span className="flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" />
                {lang === "pt" ? "Carregando..." : "Loading..."}
              </span>
            ) : (
              `${filteredMarkers.length} ${lang === "pt" ? "pontos" : "points"}`
            )}
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <div id={containerId} className="relative w-full bg-neutral-100" style={{ height }}>
        <APIProvider apiKey={MAP_KEY}>
          <GMap
            defaultCenter={mapCenter}
            defaultZoom={mapZoom}
            key={`${mapCenter.lat}-${mapCenter.lng}-${mapZoom}`}
            mapId={mapId}
            disableDefaultUI
            zoomControl
            mapTypeControl={false}
            mapTypeId={mapTypeId}
            streetViewControl={false}
            fullscreenControl={false}
            rotateControl={false}
            onCameraChanged={() => {
              if (!bboxDirty) setBboxDirty(true);
            }}
          >
            {filteredMarkers.map((m) => {
              const color = layers?.find((l) => l.key === m.layer)?.color || "#5B7A2F";
              return (
                <AdvancedMarker
                  key={m.id}
                  position={{ lat: m.lat, lng: m.lng }}
                  onClick={() => setActiveId(m.id)}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-150"
                    style={{ backgroundColor: color }}
                  />
                </AdvancedMarker>
              );
            })}

            {active && (
              <InfoWindow
                position={{ lat: active.lat, lng: active.lng }}
                onCloseClick={() => setActiveId(null)}
                pixelOffset={[0, -10]}
              >
                <div className="p-1 max-w-[260px]">
                  <h4 className="font-semibold text-neutral-900 text-[13px] leading-tight mb-0.5">
                    {active.title}
                  </h4>
                  {active.subtitle && (
                    <p className="text-[11px] text-neutral-600">{active.subtitle}</p>
                  )}
                  {active.extra}
                  {active.url && (
                    <a
                      href={active.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-brand-primary hover:underline"
                    >
                      {lang === "pt" ? "Ver detalhes" : "Details"}
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}

            {/* Map / Satellite toggle */}
            <div className="absolute top-3 left-3 flex bg-white/90 backdrop-blur-sm rounded border border-neutral-200 overflow-hidden shadow-md z-10 transition-all hover:bg-white">
              <button
                onClick={() => setMapTypeId("terrain")}
                className={`px-2 py-1 text-[10px] font-bold transition-all ${mapTypeId === "terrain" ? "bg-brand-primary text-white" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Map
              </button>
              <div className="w-[1px] bg-neutral-200" />
              <button
                onClick={() => setMapTypeId("satellite")}
                className={`px-2 py-1 text-[10px] font-bold transition-all ${mapTypeId === "satellite" ? "bg-brand-primary text-white" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                Satellite
              </button>
            </div>

            {/* Fullscreen + Recenter */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <button
                onClick={() => {
                  const el = document.getElementById(containerId);
                  if (el?.requestFullscreen) el.requestFullscreen();
                }}
                className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded border border-neutral-200 flex items-center justify-center text-neutral-600 shadow-md hover:bg-white hover:text-brand-primary transition-all"
                title={lang === "pt" ? "Tela Cheia" : "Fullscreen"}
              >
                <Maximize size={15} />
              </button>
              <button
                onClick={recenter}
                className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded border border-neutral-200 flex items-center justify-center text-neutral-600 shadow-md hover:bg-white hover:text-brand-primary transition-all"
                title={lang === "pt" ? "Recentrar" : "Recenter"}
              >
                <Home size={15} />
              </button>
            </div>

            <BboxCaptureButton
              lang={lang}
              bboxDirty={bboxDirty}
              bboxActive={!!bbox}
              onApply={(b) => {
                setBbox(b);
                setBboxDirty(false);
              }}
              onClear={() => {
                setBbox(null);
                setBboxDirty(false);
              }}
            />
          </GMap>
        </APIProvider>
      </div>

      {/* ── Optional bottom strip ── */}
      {highlightsStrip && (
        <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50">{highlightsStrip}</div>
      )}
    </div>
  );
}

// ─── Layer toggle ──────────────────────────────────────────────────────────

function LayerToggle({
  active,
  onClick,
  color,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] h-7 font-semibold transition-all border ${
        active ? "border-neutral-300 bg-white shadow-sm" : "border-transparent bg-neutral-50 text-neutral-400"
      }`}
    >
      {active ? <Eye size={11} style={{ color }} /> : <EyeOff size={11} />}
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? color : "#D1D5DB" }} />
      <span className={active ? "text-neutral-800" : ""}>{label}</span>
      <span className={`text-[9px] ${active ? "text-neutral-400" : "text-neutral-300"}`}>({count})</span>
    </button>
  );
}

// ─── Bbox capture (must be inside APIProvider) ─────────────────────────────

function BboxCaptureButton({
  lang,
  bboxDirty,
  bboxActive,
  onApply,
  onClear,
}: {
  lang: Lang;
  bboxDirty: boolean;
  bboxActive: boolean;
  onApply: (bbox: { north: number; south: number; east: number; west: number }) => void;
  onClear: () => void;
}) {
  const map = useMap();
  const handleApply = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    onApply({ north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() });
  }, [map, onApply]);

  return (
    <>
      {bboxDirty && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={handleApply}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-neutral-200 text-[11px] font-bold text-neutral-700 hover:bg-white hover:border-brand-primary transition-all"
          >
            <RefreshCw size={11} className="text-brand-primary" />
            {lang === "pt" ? "Buscar nesta área" : "Search this area"}
          </button>
        </div>
      )}
      {bboxActive && !bboxDirty && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-surface rounded-full border border-brand-light text-[11px] font-medium text-brand-primary">
            <MapPin size={11} />
            {lang === "pt" ? "Filtrado por área visível" : "Filtered by visible area"}
            <button onClick={onClear} className="ml-1 hover:text-error transition-colors">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
