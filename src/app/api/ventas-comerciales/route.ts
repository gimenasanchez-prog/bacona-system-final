import { NextResponse } from "next/server";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const batches = await ComercialSaleService.listBatches();
    return NextResponse.json(batches);
  } catch (err) {
    console.error("[GET /api/ventas-comerciales]", err);
    return NextResponse.json({ error: "Error al obtener ventas comerciales." }, { status: 500 });
  }
}
