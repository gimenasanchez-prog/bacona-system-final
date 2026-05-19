import { NextResponse } from "next/server";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;
  try {
    const sale = await PosSaleService.confirmSale(saleId);
    return NextResponse.json({ sale });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

