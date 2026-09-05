import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SierraDeltaDebtService } from "@/modules/sierra_delta/services/sierraDeltaDebtService";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const detail = await SierraDeltaDebtService.getDetail(id);
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Deuda no encontrada." }, { status: 404 });
  }
}
