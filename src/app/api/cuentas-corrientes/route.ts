import { NextResponse } from "next/server";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await CuentaCorrienteService.getAccountsWithBillingState();
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[GET /api/cuentas-corrientes]", err);
    return NextResponse.json({ error: "Error al obtener cuentas corrientes." }, { status: 500 });
  }
}
