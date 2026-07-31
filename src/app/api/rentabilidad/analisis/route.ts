import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { RentabilidadService } from "@/modules/rentabilidad/services/rentabilidadService";

function allowedRole(role: string | undefined): boolean {
  return role === "GERENCIA" || role === "ADMINISTRATIVO";
}

export async function GET(request: Request) {
  const jar = await cookies();
  if (!allowedRole(jar.get("bcn_role")?.value)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // YYYY-MM
  const month = monthParam ? new Date(`${monthParam}-01`) : new Date();

  try {
    const data = await RentabilidadService.getAnalisisMensual(month);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/rentabilidad/analisis]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
