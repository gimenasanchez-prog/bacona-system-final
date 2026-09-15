import { NextResponse } from "next/server";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clients = await ComercialSaleService.listBillingClients();
    return NextResponse.json(clients);
  } catch (err) {
    console.error("[GET /api/ventas-comerciales/billing-clients]", err);
    return NextResponse.json({ error: "Error al obtener clientes de facturación." }, { status: 500 });
  }
}
