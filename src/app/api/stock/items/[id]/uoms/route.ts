import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const CreateUomSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(["UN", "KG", "G", "L", "ML"]),
  multiplierToBase: z.number().positive(),
  isDefaultForEntry: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uoms = await prisma.inventoryItemUom.findMany({
    where: { inventoryItemId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ uoms });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = CreateUomSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const uom = await prisma.inventoryItemUom.create({
      data: {
        inventoryItemId: id,
        label: parsed.data.label,
        unit: parsed.data.unit,
        multiplierToBase: parsed.data.multiplierToBase,
        isDefaultForEntry: parsed.data.isDefaultForEntry ?? false,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ uom });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
