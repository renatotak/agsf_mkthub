import { NextResponse } from "next/server";
import { agroApiFetch } from "@/lib/agroapi";

export const revalidate = 3600; // cache 1h — weather updates every 6h

// Key agro regions with coordinates
const REGIONS = [
  { id: "sorriso-mt", name: "Sorriso", state: "MT", lat: -12.545, lng: -55.726 },
  { id: "londrina-pr", name: "Londrina", state: "PR", lat: -23.304, lng: -51.169 },
  { id: "ribeirao-sp", name: "Ribeirão Preto", state: "SP", lat: -21.170, lng: -47.810 },
  { id: "dourados-ms", name: "Dourados", state: "MS", lat: -22.221, lng: -54.805 },
  { id: "luis-eduardo-ba", name: "Luís Eduardo Magalhães", state: "BA", lat: -12.096, lng: -45.795 },
  { id: "rio-verde-go", name: "Rio Verde", state: "GO", lat: -17.785, lng: -50.919 },
  { id: "passo-fundo-rs", name: "Passo Fundo", state: "RS", lat: -28.261, lng: -52.408 },
  { id: "sinop-mt", name: "Sinop", state: "MT", lat: -11.864, lng: -55.505 },
];

interface RegionWeather {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  tempMax: number | null;
  tempMin: number | null;
  precip: number | null;
}

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Fetch weather for all regions (batch — ClimAPI allows per-point queries)
    const results: RegionWeather[] = [];

    for (const region of REGIONS) {
      try {
        const [tmaxData, tminData, precipData] = await Promise.all([
          agroApiFetch(`/climapi/v1/ncep-gfs/tmax2m/${today}/${region.lng}/${region.lat}`),
          agroApiFetch(`/climapi/v1/ncep-gfs/tmin2m/${today}/${region.lng}/${region.lat}`),
          agroApiFetch(`/climapi/v1/ncep-gfs/apcpsfc/${today}/${region.lng}/${region.lat}`),
        ]);

        // Get the 24h forecast values (first day)
        const tmax24 = Array.isArray(tmaxData) ? tmaxData.find((d: any) => d.horas === 24)?.valor ?? tmaxData[0]?.valor : null;
        const tmin24 = Array.isArray(tminData) ? tminData.find((d: any) => d.horas === 24)?.valor ?? tminData[0]?.valor : null;
        // Sum precipitation over first 24h
        const precip24 = Array.isArray(precipData)
          ? precipData.filter((d: any) => d.horas <= 24).reduce((s: number, d: any) => s + (d.valor || 0), 0)
          : null;

        results.push({
          ...region,
          tempMax: tmax24 !== null ? Math.round(tmax24 * 10) / 10 : null,
          tempMin: tmin24 !== null ? Math.round(tmin24 * 10) / 10 : null,
          precip: precip24 !== null ? Math.round(precip24 * 10) / 10 : null,
        });
      } catch {
        results.push({ ...region, tempMax: null, tempMin: null, precip: null });
      }
    }

    return NextResponse.json({
      success: true,
      date: today,
      source: "Embrapa ClimAPI (GFS)",
      data: results,
    });
  } catch (error: any) {
    console.error("ClimAPI error:", error);
    return NextResponse.json({ success: false, error: error.message, data: [] }, { status: 502 });
  }
}
