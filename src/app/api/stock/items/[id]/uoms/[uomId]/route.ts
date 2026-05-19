import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const PatchUomSchema = z.object({
  label: z.string().min(1).optional(),
  unit: z.enum(["UN", "KG", "G", "L", "ML"]).optional(),
  multiplierToBase: z.number().positive().optional(),
  isDefaultForEntry: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; uomId: string }> }
) {
  const { uomId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchUomSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const uom = await prisma.inventoryItemUom.update({
      where: { id: uomId },
      data: parsed.data,
    });
    return NextResponse.json({ uom });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; uomId: string }> }
) {
  const { uomId } = await params;
  try {
    await prisma.inventoryItemUom.delete({ where: { id: uomId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
