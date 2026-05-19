import { NextResponse } from "next/server";
import { z } from "zod";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

const AddItemSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive().default(1),
  selectedOptionIds: z.array(z.string()).default([]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = AddItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const details = await PosSaleService.addItem({
      saleId,
      productId: parsed.data.productId,
      qty: parsed.data.qty,
      selectedOptionIds: parsed.data.selectedOptionIds,
    });
    return NextResponse.json(details);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

