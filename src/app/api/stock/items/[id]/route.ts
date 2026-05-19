import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);
const STOCK_DIMENSION = z.enum(["VOLUME", "MASS", "COUNT"]);

const PatchItemSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  unit: STOCK_UNIT.optional(),
  dimension: STOCK_DIMENSION.optional(),
  displayUnit: STOCK_UNIT.optional(),
  targetDaysCover: z.number().int().min(1).max(365).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: parsed.data,
      include: { category: true, uoms: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
      include: { category: true },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

