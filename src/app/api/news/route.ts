import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity } from "@/lib/activity-log";

/**
 * News row management.
 *
 * DELETE /api/news?id=<news_id>
 *   Hard-deletes a single agro_news row plus its loose references in
 *   entity_mentions and knowledge_items (both use source_table='agro_news'
 *   as a text pointer — no FK cascade).
 */

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("agro_news")
    .select("title, source_name, source_url, confidentiality")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await supabase
    .from("entity_mentions")
    .delete()
    .eq("source_table", "agro_news")
    .eq("source_id", id);

  await supabase
    .from("knowledge_items")
    .delete()
    .eq("source_table", "agro_news")
    .eq("source_id", id);

  const { error } = await supabase.from("agro_news").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, {
    action: "delete",
    target_table: "agro_news",
    target_id: id,
    source: "manual-ui",
    source_kind: "manual",
    summary: `Notícia removida: ${(existing.title || "").slice(0, 160)}`,
    confidentiality: (existing.confidentiality as any) || "agrisafe_published",
    metadata: { source_name: existing.source_name, source_url: existing.source_url },
  });

  return NextResponse.json({ ok: true });
}
