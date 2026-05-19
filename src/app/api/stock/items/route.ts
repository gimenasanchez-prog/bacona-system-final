import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);
const STOCK_DIMENSION = z.enum(["VOLUME", "MASS", "COUNT"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
    include: {
      category: true,
      uoms: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json({ items });
}

const CreateItemSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().min(1),
  unit: STOCK_UNIT,
  dimension: STOCK_DIMENSION.optional(),
  displayUnit: STOCK_UNIT.optional(),
  targetDaysCover: z.number().int().min(1).max(365).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      unit: parsed.data.unit,
      dimension: parsed.data.dimension ?? "COUNT",
      displayUnit: parsed.data.displayUnit ?? parsed.data.unit,
      targetDaysCover: parsed.data.targetDaysCover ?? 14,
      isActive: true,
    },
    include: { category: true, uoms: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json({ item });
}

