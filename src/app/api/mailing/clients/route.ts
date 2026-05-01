/**
 * Phase 29 — /api/mailing/clients CRUD.
 *
 * GET    ?persona=ceo|intel|marketing|credit&active=true|false
 *          → list clients with cultures inlined
 * POST                          → insert client + culture rows
 * PATCH  ?id=<uuid>             → update client; if `cultures` supplied, replace set
 * DELETE ?id=<uuid>             → soft-delete (active = false)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logActivity } from "@/lib/activity-log"
import type { MailingClient, MailingClientWithCultures, MailingPersona } from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PERSONAS: MailingPersona[] = ["ceo", "intel", "marketing", "credit"]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EDITABLE_FIELDS = [
  "full_name",
  "email",
  "persona",
  "phone",
  "notes",
  "active",
  "entity_uid",
] as const

function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

type ClientRowWithJoin = MailingClient & {
  mailing_client_cultures: { culture_slug: string }[] | null
}

function flattenRow(row: ClientRowWithJoin): MailingClientWithCultures {
  const { mailing_client_cultures, ...rest } = row
  return {
    ...rest,
    cultures: (mailing_client_cultures ?? []).map((c) => c.culture_slug),
  }
}

export async function GET(req: NextRequest) {
  const persona = req.nextUrl.searchParams.get("persona")
  const activeParam = req.nextUrl.searchParams.get("active")

  let query = supabaseAdmin
    .from("mailing_clients")
    .select(`
      id, entity_uid, full_name, email, persona, phone, notes, active,
      confidentiality, created_at, updated_at,
      mailing_client_cultures ( culture_slug )
    `)
    .order("full_name", { ascending: true })

  if (persona && PERSONAS.includes(persona as MailingPersona)) {
    query = query.eq("persona", persona)
  }
  if (activeParam === "true") query = query.eq("active", true)
  if (activeParam === "false") query = query.eq("active", false)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const flat = (data ?? []).map((r) => flattenRow(r as unknown as ClientRowWithJoin))
  return NextResponse.json({ success: true, data: flat })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const persona = body.persona as MailingPersona | undefined
  const cultures = Array.isArray(body.cultures) ? (body.cultures as unknown[]).filter((c): c is string => typeof c === "string") : []

  if (!fullName) {
    return NextResponse.json({ success: false, error: "full_name required" }, { status: 400 })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false, error: "valid email required" }, { status: 400 })
  }
  if (!persona || !PERSONAS.includes(persona)) {
    return NextResponse.json(
      { success: false, error: `persona must be one of ${PERSONAS.join(", ")}` },
      { status: 400 },
    )
  }

  const insertRow: Record<string, unknown> = {
    full_name: fullName,
    email,
    persona,
    phone: typeof body.phone === "string" ? body.phone : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    entity_uid: typeof body.entity_uid === "string" ? body.entity_uid : null,
  }

  const { data: client, error: insertErr } = await supabaseAdmin
    .from("mailing_clients")
    .insert(insertRow)
    .select()
    .single()

  if (insertErr || !client) {
    return NextResponse.json(
      { success: false, error: insertErr?.message ?? "insert failed" },
      { status: 500 },
    )
  }

  if (cultures.length > 0) {
    const cultureRows = cultures.map((slug) => ({ client_id: client.id, culture_slug: slug }))
    const { error: cErr } = await supabaseAdmin.from("mailing_client_cultures").insert(cultureRows)
    if (cErr) {
      // Roll back the client to keep state consistent
      await supabaseAdmin.from("mailing_clients").delete().eq("id", client.id)
      return NextResponse.json(
        { success: false, error: `culture insert failed: ${cErr.message}` },
        { status: 500 },
      )
    }
  }

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "mailing_clients",
    target_id: client.id,
    source: "manual:mailing_client_create",
    source_kind: "manual",
    summary: `Mailing client criado · ${fullName} <${email}> · ${persona}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: { persona, cultures, entity_uid: insertRow.entity_uid },
  })

  return NextResponse.json({
    success: true,
    data: { ...client, cultures } as MailingClientWithCultures,
  })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const updates = pickEditable(body)

  if ("email" in updates) {
    const e = updates.email
    if (typeof e !== "string" || !EMAIL_RE.test(e)) {
      return NextResponse.json({ success: false, error: "invalid email" }, { status: 400 })
    }
    updates.email = e.trim().toLowerCase()
  }
  if ("persona" in updates && !PERSONAS.includes(updates.persona as MailingPersona)) {
    return NextResponse.json(
      { success: false, error: `persona must be one of ${PERSONAS.join(", ")}` },
      { status: 400 },
    )
  }

  const culturesProvided = Array.isArray(body.cultures)
  const cultures = culturesProvided
    ? (body.cultures as unknown[]).filter((c): c is string => typeof c === "string")
    : null

  if (Object.keys(updates).length === 0 && !culturesProvided) {
    return NextResponse.json(
      { success: false, error: "no editable fields in body" },
      { status: 400 },
    )
  }

  let client: MailingClient | null = null
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabaseAdmin
      .from("mailing_clients")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }
    client = data as MailingClient
  } else {
    const { data, error } = await supabaseAdmin
      .from("mailing_clients")
      .select()
      .eq("id", id)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }
    client = data as MailingClient
  }

  if (culturesProvided) {
    const { error: delErr } = await supabaseAdmin
      .from("mailing_client_cultures")
      .delete()
      .eq("client_id", id)
    if (delErr) {
      return NextResponse.json(
        { success: false, error: `culture clear failed: ${delErr.message}` },
        { status: 500 },
      )
    }
    if ((cultures?.length ?? 0) > 0) {
      const rows = cultures!.map((slug) => ({ client_id: id, culture_slug: slug }))
      const { error: insErr } = await supabaseAdmin.from("mailing_client_cultures").insert(rows)
      if (insErr) {
        return NextResponse.json(
          { success: false, error: `culture insert failed: ${insErr.message}` },
          { status: 500 },
        )
      }
    }
  }

  // Re-read cultures for the response payload
  const { data: cRows } = await supabaseAdmin
    .from("mailing_client_cultures")
    .select("culture_slug")
    .eq("client_id", id)

  const flatCultures = (cRows ?? []).map((r) => r.culture_slug)

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "mailing_clients",
    target_id: id,
    source: "manual:mailing_client_update",
    source_kind: "manual",
    summary: `Mailing client atualizado · ${client?.full_name ?? id}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: {
      fields: Object.keys(updates),
      cultures_replaced: culturesProvided,
      cultures_count: flatCultures.length,
    },
  })

  return NextResponse.json({
    success: true,
    data: { ...client, cultures: flatCultures } as MailingClientWithCultures,
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_clients")
    .update({ active: false })
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  }

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "mailing_clients",
    target_id: id,
    source: "manual:mailing_client_delete",
    source_kind: "manual",
    summary: `Mailing client desativado · ${data.full_name ?? id}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: { soft_delete: true },
  })

  return NextResponse.json({ success: true, data })
}
