import { NextResponse } from "next/server";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [accounts, lastPaymentAt] = await Promise.all([
      CuentaCorrienteService.getAccountsWithBillingState(),
      CuentaCorrienteService.getLastPaymentDate(),
    ]);
    return NextResponse.json({ accounts, lastPaymentAt });
  } catch (err) {
    console.error("[GET /api/cuentas-corrientes]", err);
    return NextResponse.json({ error: "Error al obtener cuentas corrientes." }, { status: 500 });
  }
}
