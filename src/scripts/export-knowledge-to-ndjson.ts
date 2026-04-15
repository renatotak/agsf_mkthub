/**
 * Export `knowledge_items` to NDJSON for Vertex AI Search indexing.
 *
 * Output format follows the Discovery Engine "documents" schema for
 * unstructured-documents-with-metadata data stores:
 *
 *   { "id": "<uuid>",
 *     "structData": { title, tier, category, tags, ..., confidentiality },
 *     "content": { "mimeType": "text/plain", "rawText": "<body>" } }
 *
 * Tier policy (PoC): only `public` + `agrisafe_published` rows are exported.
 * Vertex AI Search has no row-level ACLs of its own, so anything indexed
 * is readable by any authenticated datastore caller. Confidential rows
 * stay in pgvector / Supabase and are served via the existing tier-aware
 * RPC.
 *
 * Usage:
 *   # Local dump only
 *   npx tsx src/scripts/export-knowledge-to-ndjson.ts
 *
 *   # Also upload to the bucket (requires GCS_BUCKET env + SA with
 *   # Storage Object Admin on the bucket)
 *   GCS_BUCKET=agsf-knowledge-items-ingest \
 *     npx tsx src/scripts/export-knowledge-to-ndjson.ts
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OUT_DIR = resolve(process.cwd(), "tmp");
const DOCS_DIR = resolve(OUT_DIR, "docs");           // per-doc .txt files
const OUT_PATH = resolve(OUT_DIR, "knowledge.ndjson");
const BATCH = 500;
const ALLOWED_TIERS = ["public", "agrisafe_published"];
// Remote prefix under the bucket. The NDJSON lines reference
// gs://<bucket>/<DOCS_PREFIX>/<id>.txt for each document body.
const DOCS_PREFIX = "docs";

type Row = {
  id: string;
  tier: number | null;
  title: string;
  content: string | null;
  summary: string | null;
  source_type: string | null;
  source_table: string | null;
  source_url: string | null;
  category: string | null;
  tags: string[] | null;
  keywords: string[] | null;
  value_chain: string[] | null;
  data_origin: string | null;
  purpose: string[] | null;
  timing: string | null;
  confidentiality: string | null;
  published_at: string | null;
  indexed_at: string | null;
};

// Shape a row into a Discovery Engine document record.
//
// NOTE on `content`: the batch GCS importer does NOT accept
// `content.rawText` (v1main schema rejects it as "no such field").
// So we write each row's text to a per-doc .txt file in the bucket
// and reference it via `content.uri`. The caller (maybeUpload) does
// the actual upload.
function toDocument(row: Row, bucket: string): { doc: Record<string, unknown>; body: string } {
  const body = [row.title, row.summary, row.content]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1_000_000);

  return {
    body,
    doc: {
      id: row.id,
      structData: {
        title: row.title,
        tier: row.tier,
        source_type: row.source_type,
        source_table: row.source_table,
        source_url: row.source_url,
        category: row.category,
        tags: row.tags || [],
        keywords: row.keywords || [],
        value_chain: row.value_chain || [],
        data_origin: row.data_origin,
        purpose: row.purpose || [],
        timing: row.timing,
        confidentiality: row.confidentiality,
        published_at: row.published_at,
      },
      content: {
        mimeType: "text/plain",
        uri: `gs://${bucket}/${DOCS_PREFIX}/${row.id}.txt`,
      },
    },
  };
}

async function exportRows(bucket: string): Promise<number> {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(DOCS_DIR, { recursive: true });
  let offset = 0;
  let total = 0;
  const lines: string[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("knowledge_items")
      .select(
        "id,tier,title,content,summary,source_type,source_table,source_url,category,tags,keywords,value_chain,data_origin,purpose,timing,confidentiality,published_at,indexed_at",
      )
      .in("confidentiality", ALLOWED_TIERS)
      .order("indexed_at", { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as Row[]) {
      if (!row.title || (!row.content && !row.summary)) continue;
      const { body, doc } = toDocument(row, bucket);
      writeFileSync(resolve(DOCS_DIR, `${row.id}.txt`), body, "utf-8");
      lines.push(JSON.stringify(doc));
      total++;
    }

    offset += data.length;
    if (data.length < BATCH) break;
  }

  writeFileSync(OUT_PATH, lines.join("\n") + "\n", "utf-8");
  console.log(`✓ Wrote ${total} documents (NDJSON + per-doc .txt files)`);
  console.log(`    ${OUT_PATH}`);
  console.log(`    ${DOCS_DIR}/`);
  return total;
}

// Upload NDJSON + per-doc .txt files. Requires GCS_BUCKET. Uses the
// agrisafe-*.json SA key file from project root.
async function uploadAll(bucket: string) {
  const { Storage } = await import("@google-cloud/storage");
  const root = process.cwd();
  const saFile = readdirSync(root).find(
    (f) => f.startsWith("agrisafe-") && f.endsWith(".json"),
  );
  if (!saFile) {
    console.warn("No agrisafe-*.json SA key found — skipping upload");
    return;
  }
  const creds = JSON.parse(readFileSync(resolve(root, saFile), "utf-8"));
  const storage = new Storage({
    projectId: creds.project_id,
    credentials: creds,
  });
  const b = storage.bucket(bucket);

  // Upload per-doc .txt files in small parallel batches.
  const docFiles = readdirSync(DOCS_DIR);
  const CONCURRENCY = 16;
  let done = 0;
  const queue = [...docFiles];
  async function worker() {
    while (queue.length) {
      const f = queue.shift()!;
      await b.upload(resolve(DOCS_DIR, f), {
        destination: `${DOCS_PREFIX}/${f}`,
        resumable: false,
        metadata: { contentType: "text/plain; charset=utf-8" },
      });
      done++;
      if (done % 25 === 0 || done === docFiles.length) {
        console.log(`  …uploaded ${done}/${docFiles.length} doc files`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Upload the NDJSON manifest last so importers don't see stale refs.
  await b.upload(OUT_PATH, {
    destination: "knowledge.ndjson",
    resumable: false,
    metadata: { contentType: "application/x-ndjson" },
  });
  console.log(`✓ Uploaded manifest → gs://${bucket}/knowledge.ndjson`);
}

(async () => {
  try {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      console.error("GCS_BUCKET env var is required (each doc references gs://<bucket>/docs/<id>.txt)");
      process.exit(1);
    }
    const n = await exportRows(bucket);
    if (n === 0) {
      console.warn("No rows matched — double-check ALLOWED_TIERS.");
      return;
    }
    await uploadAll(bucket);
    console.log("\nNext step: in the Data Store console, run a new import");
    console.log(`(Documents → Import data → gs://${bucket}/knowledge.ndjson).`);
  } catch (err) {
    console.error("Export failed:", err);
    process.exit(1);
  }
})();
