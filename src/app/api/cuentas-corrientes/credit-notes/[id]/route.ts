import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await CuentaCorrienteService.deleteCreditNote(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Nota de crédito no encontrada." }, { status: 404 });
  }
}
