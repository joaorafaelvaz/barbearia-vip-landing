import { NextResponse, type NextRequest } from "next/server";
import { isAdminHeaders } from "@/lib/admin-auth";
import { getUnitServices } from "@/lib/unit-services";

export const dynamic = "force-dynamic";

/** Serviços da unidade (para o formulário de voucher manual). Só para o painel autenticado. */
export async function GET(request: NextRequest) {
  if (!isAdminHeaders(request.headers)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unit = request.nextUrl.searchParams.get("unit") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(unit)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const r = await getUnitServices(unit);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === "UNIT_NOT_FOUND" ? 404 : 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ servicos: r.servicos }, { headers: { "Cache-Control": "no-store" } });
}
