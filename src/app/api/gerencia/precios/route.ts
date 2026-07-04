import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { PreciosService } from "@/modules/precios/services/preciosService";

export async function GET() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const products = await PreciosService.listGroupedByCategory();
  return NextResponse.json({ products });
}
