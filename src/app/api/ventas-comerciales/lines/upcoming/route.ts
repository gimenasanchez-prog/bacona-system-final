import { NextResponse } from "next/server";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lines = await ComercialSaleService.getUpcomingLines();
    return NextResponse.json({ lines });
  } catch (err) {
    console.error("[GET /api/ventas-comerciales/lines/upcoming]", err);
    return NextResponse.json({ error: "Error al obtener ventas comerciales próximas." }, { status: 500 });
  }
}
