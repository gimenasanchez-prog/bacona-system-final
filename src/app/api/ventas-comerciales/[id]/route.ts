import { NextResponse } from "next/server";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const batch = await ComercialSaleService.getBatchDetails(id);
    return NextResponse.json(batch);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener el cierre comercial." },
      { status: 404 }
    );
  }
}
