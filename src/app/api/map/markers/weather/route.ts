import { NextResponse } from "next/server";
import { agroApiFetch } from "@/lib/agroapi";

/**
 * GET /api/map/markers/weather
 *
 * Phase — Painel weather layer.
 *
 * Returns ~25 weather markers for top Brazilian agro hub cities, pulled
 * from Embrapa AgroAPI ClimAPI (NCEP GFS forecast). Each marker carries
 * current/24h forecast values (temp, precipitation 24h, humidity).
 *
 * Hard-coded city list — these 25 hubs are stable. We intentionally do NOT
 * geocode or query Supabase; this is a fixed curated set.
 *
 * Cache: 1h ISR (weather updates every 6h on Embrapa side).
 *
 * Marker shape:
 *   { type: 'weather', lat, lng, city, uf, temp_c, precip_mm_24h,
 *     humidity, last_update }
 */

export const revalidate = 3600; // ISR 1h

interface WeatherCity {
  city: string;
  uf: string;
  lat: number;
  lng: number;
}

const CITIES: WeatherCity[] = [
  // Mato Grosso (MT) — soy/cotton/corn belt
  { city: "Sorriso",                 uf: "MT", lat: -12.545, lng: -55.726 },
  { city: "Sinop",                   uf: "MT", lat: -11.864, lng: -55.505 },
  { city: "Rondonópolis",            uf: "MT", lat: -16.469, lng: -54.636 },
  { city: "Cuiabá",                  uf: "MT", lat: -15.598, lng: -56.094 },
  { city: "Lucas do Rio Verde",      uf: "MT", lat: -13.050, lng: -55.910 },
  { city: "Tangará da Serra",        uf: "MT", lat: -14.622, lng: -57.493 },
  // Goiás (GO)
  { city: "Rio Verde",               uf: "GO", lat: -17.785, lng: -50.919 },
  { city: "Goiânia",                 uf: "GO", lat: -16.686, lng: -49.264 },
  // Paraná (PR)
  { city: "Cascavel",                uf: "PR", lat: -24.957, lng: -53.459 },
  { city: "Maringá",                 uf: "PR", lat: -23.420, lng: -51.933 },
  { city: "Londrina",                uf: "PR", lat: -23.304, lng: -51.169 },
  // Rio Grande do Sul (RS)
  { city: "Passo Fundo",             uf: "RS", lat: -28.261, lng: -52.408 },
  { city: "Ijuí",                    uf: "RS", lat: -28.388, lng: -53.917 },
  { city: "Santa Maria",             uf: "RS", lat: -29.685, lng: -53.806 },
  // São Paulo (SP)
  { city: "Ribeirão Preto",          uf: "SP", lat: -21.170, lng: -47.810 },
  // Minas Gerais (MG)
  { city: "Uberaba",                 uf: "MG", lat: -19.748, lng: -47.932 },
  { city: "Uberlândia",              uf: "MG", lat: -18.919, lng: -48.277 },
  { city: "Sete Lagoas",             uf: "MG", lat: -19.467, lng: -44.247 },
  // Bahia (BA) — MATOPIBA
  { city: "Luís Eduardo Magalhães",  uf: "BA", lat: -12.096, lng: -45.795 },
  { city: "Barreiras",               uf: "BA", lat: -12.144, lng: -44.997 },
  // Maranhão (MA) — MATOPIBA
  { city: "Balsas",                  uf: "MA", lat:  -7.533, lng: -46.035 },
  // Rondônia (RO)
  { city: "Vilhena",                 uf: "RO", lat: -12.741, lng: -60.146 },
  // Mato Grosso do Sul (MS)
  { city: "Dourados",                uf: "MS", lat: -22.221, lng: -54.805 },
  { city: "Campo Grande",            uf: "MS", lat: -20.449, lng: -54.620 },
  { city: "Chapadão do Sul",         uf: "MS", lat: -18.788, lng: -52.626 },
];

interface WeatherMarker {
  id: string;
  type: "weather";
  lat: number;
  lng: number;
  city: string;
  uf: string;
  temp_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  precip_mm_24h: number | null;
  humidity: number | null;
  last_update: string;
}

/** Pick the best 24h forecast value from a ClimAPI series. */
function pickValue(series: any): number | null {
  if (!Array.isArray(series) || series.length === 0) return null;
  const at24 = series.find((d: any) => d?.horas === 24);
  if (at24 && typeof at24.valor === "number") return at24.valor;
  const first = series[0];
  return first && typeof first.valor === "number" ? first.valor : null;
}

/** Sum 24h precipitation across the GFS step values that fall inside the first 24h. */
function sumPrecip24(series: any): number | null {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sum = series
    .filter((d: any) => typeof d?.horas === "number" && d.horas <= 24)
    .reduce((acc: number, d: any) => acc + (typeof d.valor === "number" ? d.valor : 0), 0);
  return Number.isFinite(sum) ? sum : null;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const lastUpdate = new Date().toISOString();

    const markers: WeatherMarker[] = await Promise.all(
      CITIES.map(async (c): Promise<WeatherMarker> => {
        const base: WeatherMarker = {
          id: `wx-${c.uf.toLowerCase()}-${c.city
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`,
          type: "weather",
          lat: c.lat,
          lng: c.lng,
          city: c.city,
          uf: c.uf,
          temp_c: null,
          temp_min_c: null,
          temp_max_c: null,
          precip_mm_24h: null,
          humidity: null,
          last_update: lastUpdate,
        };

        try {
          const [tmaxData, tminData, precipData, humData] = await Promise.all([
            agroApiFetch(`/climapi/v1/ncep-gfs/tmax2m/${today}/${c.lng}/${c.lat}`).catch(() => null),
            agroApiFetch(`/climapi/v1/ncep-gfs/tmin2m/${today}/${c.lng}/${c.lat}`).catch(() => null),
            agroApiFetch(`/climapi/v1/ncep-gfs/apcpsfc/${today}/${c.lng}/${c.lat}`).catch(() => null),
            agroApiFetch(`/climapi/v1/ncep-gfs/rh2m/${today}/${c.lng}/${c.lat}`).catch(() => null),
          ]);

          const tmax = pickValue(tmaxData);
          const tmin = pickValue(tminData);
          const precip = sumPrecip24(precipData);
          const hum = pickValue(humData);

          base.temp_max_c = round1(tmax);
          base.temp_min_c = round1(tmin);
          // "Current" displayed temp = midpoint of today's min/max
          base.temp_c =
            tmax !== null && tmin !== null ? round1((tmax + tmin) / 2) : round1(tmax ?? tmin);
          base.precip_mm_24h = round1(precip);
          base.humidity = hum !== null ? Math.round(hum) : null;
        } catch {
          // leave nulls — marker is still rendered, just without values
        }

        return base;
      }),
    );

    return NextResponse.json({
      success: true,
      date: today,
      source: "Embrapa ClimAPI (NCEP GFS)",
      count: markers.length,
      data: markers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Internal error", data: [] },
      { status: 502 },
    );
  }
}
