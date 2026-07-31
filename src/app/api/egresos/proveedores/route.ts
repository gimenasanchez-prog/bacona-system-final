import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? undefined;
    const estadoParam = searchParams.get("estado");
    const estado =
      estadoParam === "CON_DEUDA" || estadoParam === "SIN_DEUDA" ? estadoParam : "TODOS";
    const categoria = searchParams.get("categoria") ?? undefined;
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

    const items = await SupplierPayableService.listSuppliersWithDebt({ search, estado, categoria, from, to });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/egresos/proveedores GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
