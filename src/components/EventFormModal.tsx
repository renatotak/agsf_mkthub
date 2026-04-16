"use client";

/**
 * EventFormModal — edit OR create an event in the unified events table.
 *
 * Phase 4d additions:
 *   - "Colar URL" / "Paste URL" field at the top — scrapes the URL via
 *     /api/events/parse-url (Cheerio first, AI fallback) and pre-fills
 *     the form fields for the user to review before saving.
 *   - Location-confirm modal with a mini-map pin after save, so the user
 *     can validate the geocoded coordinates.
 *
 * Also covers: name, date range, location with inline geocode, type,
 * website, hidden flag, and "not an agro event" convenience.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Loader2, Save, X, AlertTriangle, EyeOff, MapPin, Calendar, Globe, Check,
  Link2, Sparkles,
} from "lucide-react";

export interface EventEditRecord {
  id: string;
  name: string;
  date: string;
  end_date: string | null;
  location: string | null;
  type: string;
  website: string | null;
  description_pt: string | null;
  source_name: string | null;
  latitude: number | null;
  longitude: number | null;
  hidden?: boolean;
  hidden_reason?: string | null;
}

const TYPES = [
  { value: "fair",       pt: "Feira",      en: "Fair" },
  { value: "conference", pt: "Congresso",  en: "Conference" },
  { value: "workshop",   pt: "Workshop",   en: "Workshop" },
  { value: "webinar",    pt: "Webinar",    en: "Webinar" },
  { value: "summit",     pt: "Fórum",      en: "Summit" },
  { value: "other",      pt: "Outro",      en: "Other" },
];

/** Mini-map modal shown after saving to confirm the geocoded location. */
function LocationConfirmModal({
  lang,
  eventName,
  location,
  latitude,
  longitude,
  onConfirm,
  onClose,
}: {
  lang: Lang;
  eventName: string;
  location: string;
  latitude: number;
  longitude: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // Build a Static Maps URL with a pin
  const mapUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=11&size=480x260&maptype=terrain&markers=color:red%7C${latitude},${longitude}&key=${mapsKey}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-neutral-200">
          <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2">
            <MapPin size={14} className="text-brand-primary" />
            {lang === "pt" ? "Confirmar Localização" : "Confirm Location"}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">{eventName}</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {mapUrl ? (
            <div className="rounded-md overflow-hidden border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapUrl}
                alt={`Map: ${location}`}
                className="w-full h-[200px] object-cover"
                loading="eager"
              />
            </div>
          ) : (
            <div className="w-full h-[120px] bg-neutral-100 rounded-md flex items-center justify-center text-[12px] text-neutral-500">
              {lang === "pt" ? "Mapa indisponível (chave Google Maps)" : "Map unavailable (Google Maps key)"}
            </div>
          )}

          <div className="text-[12px] text-neutral-700 space-y-1">
            <p><span className="font-bold">{lang === "pt" ? "Local:" : "Location:"}</span> {location}</p>
            <p className="font-mono text-[11px] text-neutral-500">
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </p>
          </div>

          <p className="text-[11px] text-neutral-500">
            {lang === "pt"
              ? "O pin está no local correto? Se não, edite as coordenadas no formulário."
              : "Is the pin in the correct location? If not, edit the coordinates in the form."}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-100 rounded"
          >
            {lang === "pt" ? "Editar coordenadas" : "Edit coordinates"}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-green-600 text-white text-[12px] font-bold rounded hover:bg-green-700 flex items-center gap-1.5"
          >
            <Check size={13} />
            {lang === "pt" ? "Confirmar" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventFormModal({
  lang, event, onClose, onSaved, isNew,
}: {
  lang: Lang;
  event: EventEditRecord;
  onClose: () => void;
  onSaved: (ev: EventEditRecord) => void;
  /** When true, this is a "new event" form — show the URL paste field and POST instead of PATCH. */
  isNew?: boolean;
}) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date);
  const [endDate, setEndDate] = useState(event.end_date || "");
  const [location, setLocation] = useState(event.location || "");
  const [type, setType] = useState(event.type || "other");
  const [website, setWebsite] = useState(event.website || "");
  const [description, setDescription] = useState(event.description_pt || "");
  const [lat, setLat] = useState<string>(event.latitude != null ? String(event.latitude) : "");
  const [lng, setLng] = useState<string>(event.longitude != null ? String(event.longitude) : "");
  const [hidden, setHidden] = useState(!!event.hidden);
  const [hiddenReason, setHiddenReason] = useState(event.hidden_reason || "");

  // URL paste state
  const [pasteUrl, setPasteUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Location-confirm state (after save)
  const [confirmData, setConfirmData] = useState<{
    eventName: string; location: string; latitude: number; longitude: number;
  } | null>(null);
  const [savedEvent, setSavedEvent] = useState<any>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flagNotAgro = () => {
    setHidden(true);
    if (!hiddenReason) setHiddenReason(lang === "pt" ? "Não é evento agro" : "Not an agro event");
  };

  // Parse URL handler
  const handleParseUrl = async () => {
    const url = pasteUrl.trim();
    if (!url || !url.startsWith("http")) return;

    setParsing(true);
    setParseMsg(null);
    setErr(null);

    try {
      const res = await fetch("/api/events/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const ev = data.event;
      // Pre-fill form fields (only overwrite if the parsed value is non-empty)
      if (ev.name) setName(ev.name);
      if (ev.date_start) setDate(ev.date_start);
      if (ev.date_end) setEndDate(ev.date_end);
      if (ev.city || ev.state) {
        setLocation([ev.city, ev.state].filter(Boolean).join(", "));
      }
      if (ev.url) setWebsite(ev.url);
      if (ev.description) setDescription(ev.description);

      const method = ev.parse_method === "ai" ? "IA" : "Cheerio";
      setParseMsg(
        lang === "pt"
          ? `Campos preenchidos via ${method}. Revise antes de salvar.`
          : `Fields filled via ${method}. Review before saving.`
      );
    } catch (e: any) {
      setErr(e.message);
    }
    setParsing(false);
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        date,
        end_date: endDate || null,
        location: location.trim() || null,
        type,
        website: website.trim() || null,
        description_pt: description.trim() || null,
        hidden,
        hidden_reason: hidden ? (hiddenReason.trim() || null) : null,
      };
      // Only send lat/lng if user actually typed them (empty -> let backend geocode)
      if (lat.trim()) body.latitude = Number(lat);
      if (lng.trim()) body.longitude = Number(lng);
      // If location changed and no coords supplied, clear stale coords so geocoder runs
      if (!isNew && location.trim() !== (event.location || "") && !lat.trim() && !lng.trim()) {
        body.latitude = null;
        body.longitude = null;
      }

      const url = isNew ? "/api/events" : `/api/events?id=${encodeURIComponent(event.id)}`;
      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const saved = data.event;
      setSavedEvent(saved);

      // If the saved event has coordinates + location, show location-confirm modal
      if (saved?.latitude && saved?.longitude && saved?.location) {
        setConfirmData({
          eventName: saved.name || name,
          location: saved.location,
          latitude: saved.latitude,
          longitude: saved.longitude,
        });
      } else {
        // No location to confirm — close directly
        onSaved(saved);
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  };

  // Location confirmed or skipped
  const handleLocationConfirm = () => {
    setConfirmData(null);
    if (savedEvent) onSaved(savedEvent);
  };

  const handleLocationEdit = () => {
    // User wants to fix coords — dismiss confirm modal, stay on the form
    if (savedEvent) {
      setLat(savedEvent.latitude != null ? String(savedEvent.latitude) : "");
      setLng(savedEvent.longitude != null ? String(savedEvent.longitude) : "");
    }
    setConfirmData(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-amber-100 flex items-center justify-center">
                <Calendar size={14} className="text-amber-700" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-neutral-900">
                  {isNew
                    ? (lang === "pt" ? "Novo Evento" : "New Event")
                    : (lang === "pt" ? "Editar Evento" : "Edit Event")}
                </h3>
                {event.source_name && (
                  <p className="text-[11px] text-neutral-500">{lang === "pt" ? "Fonte:" : "Source:"} {event.source_name}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-500">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            {/* Phase 4d — URL paste field (shown for new events and also for editing) */}
            <div className="bg-brand-surface/30 border border-brand-primary/20 rounded-md p-3 space-y-2">
              <label className="block text-[11px] uppercase font-bold text-brand-primary tracking-wider flex items-center gap-1.5">
                <Link2 size={12} />
                {lang === "pt" ? "Colar URL do evento" : "Paste event URL"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder={lang === "pt" ? "https://site-do-evento.com.br/..." : "https://event-website.com/..."}
                  className="flex-1 text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-primary bg-white"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleParseUrl(); } }}
                />
                <button
                  onClick={handleParseUrl}
                  disabled={parsing || !pasteUrl.trim()}
                  className="px-3 py-1.5 bg-brand-primary text-white text-[11px] font-bold rounded hover:bg-brand-dark disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {parsing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {lang === "pt" ? "Extrair" : "Extract"}
                </button>
              </div>
              {parseMsg && (
                <p className="text-[11px] text-green-700 flex items-center gap-1">
                  <Check size={11} /> {parseMsg}
                </p>
              )}
              <p className="text-[10px] text-neutral-400">
                {lang === "pt"
                  ? "Cole a URL do evento para preencher automaticamente. Cheerio primeiro, IA se necessário."
                  : "Paste the event URL to auto-fill fields. Cheerio first, AI if needed."}
              </p>
            </div>

            <Field label={lang === "pt" ? "Nome do evento" : "Event name"}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-[13px] border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:border-amber-400"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label={lang === "pt" ? "Data início" : "Start date"}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </Field>
              <Field label={lang === "pt" ? "Data fim" : "End date"}>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </Field>
              <Field label={lang === "pt" ? "Tipo" : "Type"}>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{lang === "pt" ? t.pt : t.en}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label={lang === "pt" ? "Localização (cidade, UF)" : "Location (city, state)"}
              hint={lang === "pt" ? "Ex: Cuiabá, MT — será geocodificada automaticamente" : "e.g. Cuiabá, MT — auto-geocoded"}
            >
              <div className="flex items-center gap-1.5">
                <MapPin size={13} className="text-neutral-400 shrink-0" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                  placeholder="Cuiabá, MT"
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={lang === "pt" ? "Latitude (opcional)" : "Latitude (optional)"}>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full text-[12px] font-mono border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </Field>
              <Field label={lang === "pt" ? "Longitude (opcional)" : "Longitude (optional)"}>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full text-[12px] font-mono border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </Field>
            </div>

            <Field label={lang === "pt" ? "Site oficial" : "Website"}>
              <div className="flex items-center gap-1.5">
                <Globe size={13} className="text-neutral-400 shrink-0" />
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                  placeholder="https://..."
                />
              </div>
            </Field>

            <Field label={lang === "pt" ? "Descrição / contexto" : "Description / context"}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={lang === "pt" ? "Ex: principais participantes, por que é relevante para o agro regional..." : "e.g. main participants, why it's relevant..."}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400 leading-relaxed"
              />
            </Field>

            {/* Hidden / not-agro block */}
            <div className={`rounded-md border p-3 ${hidden ? "bg-red-50 border-red-300" : "bg-neutral-50 border-neutral-200"}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={(e) => setHidden(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-neutral-900 flex items-center gap-1.5">
                    <EyeOff size={12} />
                    {lang === "pt" ? "Ocultar do feed" : "Hide from feed"}
                  </p>
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    {lang === "pt"
                      ? "Use para eventos que a fonte classificou errado (ex: shows, eventos não-agro). A linha continua no banco para evitar re-importação."
                      : "Use for events the source misclassified (e.g. concerts, non-agro). The row stays in the DB to prevent re-import."}
                  </p>
                </div>
              </label>
              {!hidden && (
                <button
                  type="button"
                  onClick={flagNotAgro}
                  className="mt-2 ml-6 text-[10px] font-bold text-red-700 hover:text-red-900 underline"
                >
                  {lang === "pt" ? "Marcar como NÃO é evento agro" : "Mark as NOT an agro event"}
                </button>
              )}
              {hidden && (
                <input
                  type="text"
                  value={hiddenReason}
                  onChange={(e) => setHiddenReason(e.target.value)}
                  placeholder={lang === "pt" ? "Motivo (opcional)" : "Reason (optional)"}
                  className="mt-2 ml-6 w-[calc(100%-1.5rem)] text-[11px] border border-red-200 bg-white rounded px-2 py-1 focus:outline-none focus:border-red-400"
                />
              )}
            </div>

            {err && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-[12px] text-red-700 flex items-center gap-2">
                <AlertTriangle size={13} /> {err}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-100 rounded"
            >
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button
              onClick={submit}
              disabled={saving || !name.trim() || !date}
              className="px-4 py-2 bg-amber-600 text-white text-[12px] font-bold rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Location confirm modal (Phase 4d) */}
      {confirmData && (
        <LocationConfirmModal
          lang={lang}
          eventName={confirmData.eventName}
          location={confirmData.location}
          latitude={confirmData.latitude}
          longitude={confirmData.longitude}
          onConfirm={handleLocationConfirm}
          onClose={handleLocationEdit}
        />
      )}
    </>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  );
}
