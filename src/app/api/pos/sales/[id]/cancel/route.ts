import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

const bodySchema = z.object({
  reason: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;
  try {
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = bodySchema.parse(body).reason;
    } catch {
      // body vacío o inválido — reason queda undefined
    }

    const sale = await PosSaleService.cancelSale(saleId, reason);
    return NextResponse.json({ sale });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const isClosed = message.includes("turno cerrado");
    return NextResponse.json({ error: message }, { status: isClosed ? 409 : 400 });
  }
}
