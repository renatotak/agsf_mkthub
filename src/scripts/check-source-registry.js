/**
 * Phase 27 follow-up — health-check the 176 entries in source-registry.json.
 *
 * Until now `source-registry.json` was hand-curated with `url_status='unchecked'`
 * for every entry, so the Ingestão de Dados → KPI strip showed
 * "166 Não verificado" out of 176 endpoints. This script does the actual
 * HTTP probe pass and writes the result back to the JSON file.
 *
 * Strategy:
 *   1. HEAD request first (cheaper, doesn't download body).
 *   2. If HEAD returns 4xx or 5xx, retry with GET (some servers reject HEAD
 *      but accept GET — common for legacy government portals).
 *   3. Classify the final status:
 *        2xx → 'active'
 *        3xx → 'active' (follow handled by fetch)
 *        404, 410, 451 → 'inactive'
 *        4xx other, 5xx → 'error'
 *        network error / timeout → 'error'
 *   4. Write `url_status`, `http_status`, `last_checked_at` back to the entry.
 *
 * Pacing: 200ms between requests, 8 concurrent workers via a simple pool.
 * Total walltime for 176 entries ≈ 30-60s.
 *
 * Usage:
 *   node src/scripts/check-source-registry.js
 *   node src/scripts/check-source-registry.js --dry
 *   node src/scripts/check-source-registry.js --only-unchecked   # skip already-classified
 *   node src/scripts/check-source-registry.js --concurrency 4
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const onlyUnchecked = args.includes("--only-unchecked");
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? parseInt(args[i + 1], 10) : fallback;
}
const CONCURRENCY = arg("--concurrency", 8);
const TIMEOUT_MS = arg("--timeout", 12000);
const PACE_MS = arg("--pace", 100);

const REGISTRY_PATH = path.join(__dirname, "..", "data", "source-registry.json");

const UA = "Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)";

// ─── Probe a single URL ────────────────────────────────────────────────────

async function probe(url) {
  if (!url) return { status: "unchecked", http: null, reason: "empty_url" };

  // Reject obviously-not-HTTP entries (e.g. ftp://, mailto:)
  if (!/^https?:\/\//i.test(url)) {
    return { status: "unchecked", http: null, reason: "non_http_scheme" };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers = { "User-Agent": UA, Accept: "*/*" };

  // Try HEAD first
  try {
    const res = await fetch(url, { method: "HEAD", headers, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    const http = res.status;
    if (http >= 200 && http < 400) return { status: "active", http, reason: "head_ok" };
    // Some servers return 405 Method Not Allowed for HEAD — retry with GET
    if (http === 405 || http === 403 || http === 400) {
      // fall through to GET
    } else if (http === 404 || http === 410 || http === 451) {
      return { status: "inactive", http, reason: `head_${http}` };
    } else if (http >= 500) {
      // Server error — retry with GET in case HEAD has a different code path
    } else {
      return { status: "error", http, reason: `head_${http}` };
    }
  } catch (e) {
    clearTimeout(t);
    // Network/timeout — try GET below before giving up
  }

  // Retry with GET (download minimal body)
  const ctrl2 = new AbortController();
  const t2 = setTimeout(() => ctrl2.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "follow", signal: ctrl2.signal });
    clearTimeout(t2);
    // Don't read the body — we just need the status. Cancel.
    try {
      if (res.body && typeof res.body.cancel === "function") await res.body.cancel();
    } catch {}
    const http = res.status;
    if (http >= 200 && http < 400) return { status: "active", http, reason: "get_ok" };
    if (http === 404 || http === 410 || http === 451) return { status: "inactive", http, reason: `get_${http}` };
    return { status: "error", http, reason: `get_${http}` };
  } catch (e) {
    clearTimeout(t2);
    const msg = e?.message || String(e);
    if (msg.includes("aborted") || msg.includes("timeout")) return { status: "error", http: null, reason: "timeout" };
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return { status: "error", http: null, reason: "dns" };
    if (msg.includes("ECONNREFUSED")) return { status: "error", http: null, reason: "refused" };
    if (msg.includes("certificate") || msg.includes("CERT")) return { status: "error", http: null, reason: "cert" };
    return { status: "error", http: null, reason: msg.slice(0, 60) };
  }
}

// ─── Concurrency pool ──────────────────────────────────────────────────────

async function pool(items, worker, concurrency) {
  const out = new Array(items.length);
  let next = 0;
  async function spawn() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
      if (PACE_MS > 0) await new Promise((r) => setTimeout(r, PACE_MS));
    }
  }
  const workers = Array.from({ length: concurrency }, () => spawn());
  await Promise.all(workers);
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Source Registry Health Check ===");
  console.log(`Registry: ${REGISTRY_PATH}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`Filter: ${onlyUnchecked ? "only previously-unchecked entries" : "all entries"}\n`);

  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  const registry = JSON.parse(raw);
  console.log(`Loaded ${registry.length} entries.\n`);

  const targets = registry
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => {
      if (!entry.url) return false;
      if (onlyUnchecked && entry.url_status && entry.url_status !== "unchecked") return false;
      return true;
    });

  console.log(`Probing ${targets.length} entries...\n`);

  const stats = { active: 0, inactive: 0, error: 0, unchecked: 0 };
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  await pool(
    targets,
    async ({ entry, i }, taskIdx) => {
      const result = await probe(entry.url);
      stats[result.status] = (stats[result.status] || 0) + 1;

      // Update the in-memory entry
      entry.url_status = result.status;
      entry.http_status = result.http;
      entry.last_checked_at = nowIso;

      const tag =
        result.status === "active"
          ? "✓"
          : result.status === "inactive"
            ? "✗"
            : result.status === "error"
              ? "!"
              : "·";
      const httpLabel = result.http != null ? `[${result.http}]` : "[--]";
      const url = entry.url.length > 70 ? entry.url.slice(0, 67) + "..." : entry.url;
      console.log(
        `${tag} ${String(taskIdx + 1).padStart(3)}/${String(targets.length).padStart(3)} ${httpLabel.padEnd(5)} ${result.reason.padEnd(15)} ${url}`,
      );
    },
    CONCURRENCY,
  );

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n=== Probe complete in ${elapsedSec}s ===`);
  console.log(`active:    ${stats.active}`);
  console.log(`inactive:  ${stats.inactive}`);
  console.log(`error:     ${stats.error}`);
  console.log(`unchecked: ${stats.unchecked}`);

  // Recompute the full registry distribution after the probe
  const fullDist = {};
  for (const e of registry) {
    fullDist[e.url_status || "undefined"] = (fullDist[e.url_status || "undefined"] || 0) + 1;
  }
  console.log(`\nFull registry distribution after update:`);
  console.log(fullDist);

  if (dryRun) {
    console.log("\nDRY RUN — registry file NOT written.");
    return;
  }

  // Write back, preserving 2-space indentation to match the existing file
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
  console.log(`\n✓ Wrote ${registry.length} entries back to ${REGISTRY_PATH}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
