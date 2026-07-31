import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CostoFijoCategoria } from "@prisma/client";
import { z } from "zod";

import { CostosFijosService } from "@/modules/rentabilidad/services/costosFijosService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period");
    const period = periodParam ? new Date(periodParam) : new Date();
    const categoriaParam = searchParams.get("categoria");
    const categoria =
      categoriaParam && categoriaParam in CostoFijoCategoria ? (categoriaParam as CostoFijoCategoria) : undefined;
    const items = await CostosFijosService.getPaymentStatusForMonth(period, { categoria });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/egresos/costos-fijos GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
