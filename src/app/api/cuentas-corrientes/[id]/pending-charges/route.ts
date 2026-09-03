import { NextResponse } from "next/server";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [pendingCharges, invoices] = await Promise.all([
      CuentaCorrienteService.getPendingChargesForAccount(id),
      CuentaCorrienteService.listInvoicesForAccount(id),
    ]);
    return NextResponse.json({ pendingCharges, invoices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener cargos pendientes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
