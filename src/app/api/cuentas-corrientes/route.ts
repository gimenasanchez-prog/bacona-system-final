import { NextResponse } from "next/server";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  try {
    const [accounts, lastPaymentAt] = await Promise.all([
      CuentaCorrienteService.getAccountsWithBillingState({ includeInactive }),
      CuentaCorrienteService.getLastPaymentDate(),
    ]);
    return NextResponse.json({ accounts, lastPaymentAt });
  } catch (err) {
    console.error("[GET /api/cuentas-corrientes]", err);
    return NextResponse.json({ error: "Error al obtener cuentas corrientes." }, { status: 500 });
  }
}
