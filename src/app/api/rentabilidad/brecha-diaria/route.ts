import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { RentabilidadService } from "@/modules/rentabilidad/services/rentabilidadService";

export async function GET(request: Request) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const month = monthParam ? new Date(`${monthParam}-01`) : new Date();

  try {
    const data = await RentabilidadService.getBrechaDiaria(month);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/rentabilidad/brecha-diaria]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
