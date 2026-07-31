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
    const referenceDateParam = searchParams.get("referenceDate");
    const referenceDate = referenceDateParam ? new Date(referenceDateParam) : new Date();
    const items = await LocalCashBoxService.getPendingSalesForReconciliation(id, referenceDate);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/egresos/cuentas/[id]/ventas-pendientes GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
