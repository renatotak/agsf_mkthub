/**
 * Generic 3-tier geocoder (Phase 24B).
 *
 * Mirrors the strategy used by `src/scripts/geocode-retailers.js` but as a
 * reusable TypeScript helper that any server-side route can call. Used by
 * `/api/cnpj/establishments` to geocode filiais inline as they're fetched
 * from BrasilAPI, and by `src/scripts/backfill-cnpj-establishments.js`.
 *
 * Tier order (most → least precise):
 *   1. Google Maps Geocoding   → geo_precision='address' (paid quota)
 *   2. AwesomeAPI CEP          → geo_precision='cep'
 *   3. OpenStreetMap Nominatim → geo_precision='municipality'
 *
 * Per-tier in-process caching keeps repeat lookups (same CEP, same city)
 * cheap when used from a long-running script. The single-call API in this
 * file lets you opt out of any tier (e.g. skip Google) at call time.
 */

export type GeoPrecision = "address" | "cep" | "municipality";

export interface GeoResult {
  lat: number;
  lng: number;
  precision: GeoPrecision;
}

export interface AddressInput {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

export interface GeocodeOptions {
  /** Skip Google tier even if a key is configured. */
  skipGoogle?: boolean;
  /** Override env var. */
  googleKey?: string;
}

// ─── In-process caches ──────────────────────────────────────────────────────

const cepCache = new Map<string, GeoResult | null>();
const muniCache = new Map<string, GeoResult | null>();
let googleQuotaReached = false;

// ─── Tier 1: Google Maps ────────────────────────────────────────────────────

async function geocodeGoogle(addr: AddressInput, key: string): Promise<GeoResult | null> {
  if (googleQuotaReached) return null;

  const address = [addr.logradouro, addr.numero, addr.bairro, addr.municipio, addr.uf, addr.cep, "Brasil"]
    .filter(Boolean)
    .join(", ");
  if (!address) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}&region=br&language=pt-BR`;
    const r = await fetch(url);
    const d: any = await r.json();

    if (d.status === "OK" && d.results?.[0]) {
      const { lat, lng } = d.results[0].geometry.location;
      const locType: string = d.results[0].geometry.location_type;
      const precision: GeoPrecision =
        locType === "ROOFTOP" || locType === "RANGE_INTERPOLATED" ? "address" : "cep";
      return { lat, lng, precision };
    }
    if (d.status === "OVER_QUERY_LIMIT") {
      googleQuotaReached = true;
    }
  } catch {
    // ignore — fall through to next tier
  }
  return null;
}

// ─── Tier 2: CEP centroid via AwesomeAPI ────────────────────────────────────

async function geocodeCep(cep: string | null | undefined): Promise<GeoResult | null> {
  if (!cep) return null;
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  if (cepCache.has(clean)) return cepCache.get(clean) || null;

  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${clean}`);
    if (!r.ok) {
      cepCache.set(clean, null);
      return null;
    }
    const d: any = await r.json();
    if (d.lat && d.lng) {
      const result: GeoResult = {
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lng),
        precision: "cep",
      };
      cepCache.set(clean, result);
      return result;
    }
  } catch {
    // ignore
  }
  cepCache.set(clean, null);
  return null;
}

// ─── Tier 3: Nominatim municipality centroid ────────────────────────────────

async function geocodeNominatim(
  municipio: string | null | undefined,
  uf: string | null | undefined,
): Promise<GeoResult | null> {
  if (!municipio || !uf) return null;
  const key = `${municipio.toLowerCase().trim()}|${uf.toUpperCase().trim()}`;
  if (muniCache.has(key)) return muniCache.get(key) || null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(municipio)}&state=${encodeURIComponent(uf)}&country=Brazil&format=jsonv2&limit=1`;
    const r = await fetch(url, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0 (geocoding@agrisafe.com.br)" },
    });
    if (!r.ok) {
      muniCache.set(key, null);
      return null;
    }
    const data: any = await r.json();
    if (data[0]) {
      const result: GeoResult = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        precision: "municipality",
      };
      muniCache.set(key, result);
      return result;
    }
  } catch {
    // ignore
  }
  muniCache.set(key, null);
  return null;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Geocode a Brazilian address using up to three tiers in priority order.
 * Returns the first successful hit, or null if every tier fails.
 *
 * Important: this function deliberately does NOT throttle. Callers that
 * iterate over many addresses are responsible for pacing requests so they
 * don't violate Nominatim's 1-req-per-second policy or exhaust Google's
 * free tier in seconds.
 */
export async function geocodeAddress(
  addr: AddressInput,
  opts: GeocodeOptions = {},
): Promise<GeoResult | null> {
  const googleKey = opts.googleKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // Tier 1: Google
  if (!opts.skipGoogle && googleKey) {
    const g = await geocodeGoogle(addr, googleKey);
    if (g) return g;
  }

  // Tier 2: CEP
  const c = await geocodeCep(addr.cep);
  if (c) return c;

  // Tier 3: Nominatim municipality
  const m = await geocodeNominatim(addr.municipio, addr.uf);
  if (m) return m;

  return null;
}

/** Reset in-process caches (useful between long-running script runs). */
export function resetGeocodeCaches() {
  cepCache.clear();
  muniCache.clear();
  googleQuotaReached = false;
}
