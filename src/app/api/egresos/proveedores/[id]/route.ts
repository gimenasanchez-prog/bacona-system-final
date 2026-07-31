import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const detail = await SupplierPayableService.getSupplierDetail(id);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[/api/egresos/proveedores/[id] GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
