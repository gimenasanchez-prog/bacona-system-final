import { NextResponse } from "next/server";
import { z } from "zod";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

const PatchItemSchema = z.object({
  qty: z.number().int().min(0),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: saleId, itemId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const details = await PosSaleService.updateItemQty({
      saleId,
      itemId,
      qty: parsed.data.qty,
    });
    return NextResponse.json(details);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: saleId, itemId } = await params;
  try {
    const details = await PosSaleService.removeItem({ saleId, itemId });
    return NextResponse.json(details);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

