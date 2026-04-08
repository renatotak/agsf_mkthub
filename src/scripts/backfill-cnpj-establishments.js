/**
 * Phase 24B — backfill cnpj_establishments for industries (and other roles).
 *
 * Purpose: pre-populate the on-demand RF establishment cache so the
 * Diretório de Indústrias map view shows points without users having to
 * click "Buscar filiais" on every row.
 *
 * Strategy:
 *   1. Pick CNPJ roots from `legal_entities` filtered by `entity_roles`
 *      (default: role_type='industry'). Customize via --role.
 *   2. For each root, iterate ordens 0001..N via BrasilAPI (default 25).
 *   3. Geocode each establishment with the shared 3-tier helper:
 *        Google (paid) → AwesomeAPI CEP → Nominatim municipality.
 *   4. Upsert into cnpj_establishments.
 *
 * Pacing: BrasilAPI (~30/min CNPJ) and Nominatim (1/sec) are the bottlenecks.
 * The loop sleeps 1.1s between requests to respect both. Long but cached.
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/backfill-cnpj-establishments.js [options]
 *
 *   --role <name>    role_type to backfill (default: industry)
 *   --limit N        only process the first N entities (default: all)
 *   --max-ordem N    max ordem per CNPJ root (default: 25)
 *   --skip-google    skip Google geocoding tier
 *   --refresh        re-fetch even if cache row is fresh (<30d)
 *   --dry            don't write to Supabase, just log what would happen
 *
 * Prerequisites:
 *   - Migration 035_cnpj_establishments.sql applied
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - (Optional) NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for tier 1 geocoding
 */

const { createClient } = require("@supabase/supabase-js");

// ─── Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
function flag(name) {
  return args.includes(name);
}

const ROLE = arg("--role", "industry");
const LIMIT = parseInt(arg("--limit", "99999"), 10);
const MAX_ORDEM = parseInt(arg("--max-ordem", "25"), 10);
const SKIP_GOOGLE = flag("--skip-google");
const REFRESH = flag("--refresh");
const DRY = flag("--dry");

const PACE_MS = 1100;
const MAX_CONSECUTIVE_MISSES = 4;
const CACHE_DAYS = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env vars. Run with: node --env-file=.env.local src/scripts/backfill-cnpj-establishments.js");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── CNPJ helpers ──────────────────────────────────────────────────────────

function computeCnpjDv(base12) {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * w1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * w2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

function buildCnpj(root8, ordem4) {
  const base12 = root8.padStart(8, "0") + ordem4.padStart(4, "0");
  return base12 + computeCnpjDv(base12);
}

function parseDate(s) {
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

// ─── Geocoder (3-tier, mirrors src/lib/geocode.ts) ─────────────────────────

const cepCache = new Map();
const muniCache = new Map();
let googleQuotaReached = false;

async function geocodeGoogle(addr) {
  if (SKIP_GOOGLE || googleQuotaReached || !GOOGLE_KEY) return null;
  const address = [addr.logradouro, addr.numero, addr.bairro, addr.municipio, addr.uf, addr.cep, "Brasil"]
    .filter(Boolean)
    .join(", ");
  if (!address) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}&region=br&language=pt-BR`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status === "OK" && d.results?.[0]) {
      const { lat, lng } = d.results[0].geometry.location;
      const lt = d.results[0].geometry.location_type;
      const precision = lt === "ROOFTOP" || lt === "RANGE_INTERPOLATED" ? "address" : "cep";
      return { lat, lng, precision };
    }
    if (d.status === "OVER_QUERY_LIMIT") {
      console.log("  ⚠ Google quota reached — switching to CEP/Nominatim only");
      googleQuotaReached = true;
    }
  } catch {}
  return null;
}

async function geocodeCep(cep) {
  if (!cep) return null;
  const clean = String(cep).replace(/\D/g, "");
  if (clean.length !== 8) return null;
  if (cepCache.has(clean)) return cepCache.get(clean);
  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${clean}`);
    if (!r.ok) {
      cepCache.set(clean, null);
      return null;
    }
    const d = await r.json();
    if (d.lat && d.lng) {
      const result = { lat: parseFloat(d.lat), lng: parseFloat(d.lng), precision: "cep" };
      cepCache.set(clean, result);
      return result;
    }
  } catch {}
  cepCache.set(clean, null);
  return null;
}

async function geocodeNominatim(municipio, uf) {
  if (!municipio || !uf) return null;
  const key = `${municipio.toLowerCase()}|${uf.toUpperCase()}`;
  if (muniCache.has(key)) return muniCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(municipio)}&state=${encodeURIComponent(uf)}&country=Brazil&format=jsonv2&limit=1`;
    const r = await fetch(url, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0 (geocoding@agrisafe.com.br)" },
    });
    if (!r.ok) {
      muniCache.set(key, null);
      return null;
    }
    const data = await r.json();
    if (data[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), precision: "municipality" };
      muniCache.set(key, result);
      return result;
    }
  } catch {}
  muniCache.set(key, null);
  return null;
}

async function geocode(addr) {
  return (await geocodeGoogle(addr)) || (await geocodeCep(addr.cep)) || (await geocodeNominatim(addr.municipio, addr.uf)) || null;
}

// ─── BrasilAPI fetcher ─────────────────────────────────────────────────────

async function fetchOrdemBrasilApi(fullCnpj) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${fullCnpj}`, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeBrasilApi(d, root8) {
  const cnpj14 = String(d.cnpj || "").replace(/\D/g, "");
  return {
    cnpj: cnpj14,
    cnpj_raiz: root8,
    ordem: cnpj14.slice(8, 12),
    matriz_filial: d.identificador_matriz_filial != null ? String(d.identificador_matriz_filial) : null,
    razao_social: d.razao_social || null,
    nome_fantasia: d.nome_fantasia || null,
    situacao_cadastral:
      d.descricao_situacao_cadastral || (d.situacao_cadastral != null ? String(d.situacao_cadastral) : null),
    data_inicio_atividade: parseDate(d.data_inicio_atividade),
    logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ") || null,
    numero: d.numero || null,
    complemento: d.complemento || null,
    bairro: d.bairro || null,
    cep: d.cep ? String(d.cep) : null,
    municipio: d.municipio || null,
    uf: d.uf || null,
    latitude: null,
    longitude: null,
    geo_precision: null,
    email: d.email || null,
    telefone: d.ddd_telefone_1
      ? `(${String(d.ddd_telefone_1).slice(0, 2)}) ${String(d.ddd_telefone_1).slice(2)}`.trim()
      : null,
    source: "BrasilAPI",
    fetched_at: new Date().toISOString(),
    raw_response: d,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== cnpj_establishments backfill ===");
  console.log(`role:        ${ROLE}`);
  console.log(`limit:       ${LIMIT === 99999 ? "all" : LIMIT}`);
  console.log(`max ordem:   ${MAX_ORDEM}`);
  console.log(`google:      ${SKIP_GOOGLE ? "DISABLED" : GOOGLE_KEY ? "enabled" : "no key"}`);
  console.log(`refresh:     ${REFRESH}`);
  console.log(`dry-run:     ${DRY}\n`);

  // Pull every entity_uid that holds the requested role + has a tax_id.
  // We hit legal_entities directly so we don't depend on the curated
  // industries slug catalog (which has no CNPJ).
  const { data: rolesRows, error: rolesErr } = await sb
    .from("entity_roles")
    .select("entity_uid, legal_entities!inner(entity_uid, tax_id, display_name, legal_name)")
    .eq("role_type", ROLE)
    .not("legal_entities.tax_id", "is", null)
    .limit(LIMIT);

  if (rolesErr) {
    console.error("Failed to load entities:", rolesErr.message);
    process.exit(1);
  }

  const targets = (rolesRows || [])
    .map((r) => ({
      cnpjRaiz: String(r.legal_entities?.tax_id || "").replace(/\D/g, "").padStart(8, "0"),
      name: r.legal_entities?.display_name || r.legal_entities?.legal_name || "—",
    }))
    .filter((t) => t.cnpjRaiz.length === 8);

  console.log(`→ ${targets.length} CNPJ roots to process\n`);

  let totalEstablishments = 0;
  let geoHits = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const { cnpjRaiz, name } = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${name.slice(0, 40)} (${cnpjRaiz}) `);

    // Check existing cache freshness
    if (!REFRESH) {
      const { data: cached } = await sb
        .from("cnpj_establishments")
        .select("fetched_at")
        .eq("cnpj_raiz", cnpjRaiz)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached && cached.fetched_at) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
        if (ageMs < CACHE_DAYS * 86_400_000) {
          process.stdout.write("[cached, skip]\n");
          skipped++;
          continue;
        }
      }
    }

    const found = [];
    let consecutiveMisses = 0;

    for (let ordem = 1; ordem <= MAX_ORDEM; ordem++) {
      const ordem4 = String(ordem).padStart(4, "0");
      const fullCnpj = buildCnpj(cnpjRaiz, ordem4);
      const raw = await fetchOrdemBrasilApi(fullCnpj);

      if (raw && raw.cnpj) {
        consecutiveMisses = 0;
        const row = normalizeBrasilApi(raw, cnpjRaiz);
        const geo = await geocode({
          logradouro: row.logradouro,
          numero: row.numero,
          bairro: row.bairro,
          cep: row.cep,
          municipio: row.municipio,
          uf: row.uf,
        });
        if (geo) {
          row.latitude = geo.lat;
          row.longitude = geo.lng;
          row.geo_precision = geo.precision;
          geoHits++;
        }
        found.push(row);
      } else {
        consecutiveMisses++;
        if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) break;
      }

      await sleep(PACE_MS);
    }

    if (found.length > 0 && !DRY) {
      const { error: upErr } = await sb
        .from("cnpj_establishments")
        .upsert(found, { onConflict: "cnpj" });
      if (upErr) {
        console.log(`[upsert err: ${upErr.message}]`);
      } else {
        console.log(`+${found.length} estabs`);
      }
    } else if (DRY) {
      console.log(`+${found.length} estabs (DRY)`);
    } else {
      console.log(`+0`);
    }

    totalEstablishments += found.length;
  }

  console.log("\n=== DONE ===");
  console.log(`processed:        ${targets.length - skipped}`);
  console.log(`skipped (cached): ${skipped}`);
  console.log(`establishments:   ${totalEstablishments}`);
  console.log(`geocoded:         ${geoHits} (${totalEstablishments > 0 ? Math.round((geoHits / totalEstablishments) * 100) : 0}%)`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
