import { NextRequest, NextResponse } from "next/server";
import { POST as ingestPOST } from "@/app/api/reading-room/ingest/route";

/**
 * Server-side proxy for the in-app "Adicionar Notícia" modal.
 *
 * The Reading Room ingest endpoint requires a shared-secret header so the
 * Chrome extension can authenticate from a browser. The webapp modal used
 * to read that secret from NEXT_PUBLIC_READING_ROOM_SECRET, which doesn't
 * exist in production — every click 401'd. This route keeps the secret
 * server-side and delegates to the real ingest handler in-process.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.READING_ROOM_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "READING_ROOM_SECRET is not configured on the server" },
      { status: 500 },
    );
  }

  const bodyText = await req.text();

  const forwarded = new NextRequest(req.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-reading-room-secret": secret,
    },
    body: bodyText,
  });

  return ingestPOST(forwarded);
}
