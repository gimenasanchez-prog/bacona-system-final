import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const PatchCategorySchema = z.object({
  name: z.string().trim().min(1),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchCategorySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "El nombre no puede estar vacío." }, { status: 400 });
  }

  try {
    const category = await prisma.inventoryCategory.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    return NextResponse.json({ category });
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

  const activeItems = await prisma.inventoryItem.count({ where: { categoryId: id, isActive: true } });
  if (activeItems > 0) {
    return NextResponse.json(
      {
        error: `La categoría tiene ${activeItems} ítem(s) activo(s). Movelos a otra categoría o eliminalos antes de borrarla.`,
      },
      { status: 400 }
    );
  }

  try {
    const category = await prisma.inventoryCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ category });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
