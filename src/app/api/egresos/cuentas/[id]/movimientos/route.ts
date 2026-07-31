import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "50");
    const result = await LocalCashBoxService.listMovements(id, { page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/egresos/cuentas/[id]/movimientos GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
