import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { CostosFijosService } from "@/modules/rentabilidad/services/costosFijosService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period");
    if (!periodParam) return NextResponse.json({ error: "Falta el parámetro period." }, { status: 400 });
    const detail = await CostosFijosService.getPeriodDetail(id, new Date(periodParam));
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[/api/egresos/costos-fijos/[id]/periodo GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
