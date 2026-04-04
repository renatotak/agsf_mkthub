import { NextRequest, NextResponse } from "next/server";
import { agroApiFetch } from "@/lib/agroapi";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const mode = req.nextUrl.searchParams.get("mode") || "partial"; // partial | exact | relations

  if (!query) {
    return NextResponse.json({ data: [], total: 0 });
  }

  try {
    const endpoint =
      mode === "exact" ? "/agrotermos/v1/termo" :
      mode === "relations" ? "/agrotermos/v1/termoComRelacoes" :
      "/agrotermos/v1/termoParcial";

    const data = await agroApiFetch(endpoint, { label: query });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("AgroTermos proxy error:", error.message);
    return NextResponse.json({ error: error.message, data: [], total: 0 }, { status: 502 });
  }
}
