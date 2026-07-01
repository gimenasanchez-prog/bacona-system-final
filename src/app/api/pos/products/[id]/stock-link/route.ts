import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({ type: z.literal("ITEM"), itemId: z.string().min(1) }),
  z.object({ type: z.literal("RECIPE"), recipeVersionId: z.string().min(1) }),
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const { type } = parsed.data;

  if (type === "ITEM") {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: parsed.data.itemId },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ error: "Ítem de inventario no encontrado" }, { status: 400 });

    await prisma.product.update({
      where: { id },
      data: { inventoryItemId: parsed.data.itemId, consumptionRecipeVersionId: null },
    });
  } else if (type === "RECIPE") {
    const version = await prisma.recipeVersion.findUnique({
      where: { id: parsed.data.recipeVersionId },
      select: { id: true, recipe: { select: { kind: true } } },
    });
    if (!version) {
      return NextResponse.json({ error: "Versión de receta no encontrada" }, { status: 400 });
    }
    if (version.recipe.kind !== "CONSUMPTION") {
      return NextResponse.json({ error: "Solo se puede vincular a recetas de consumo" }, { status: 400 });
    }

    await prisma.product.update({
      where: { id },
      data: { consumptionRecipeVersionId: parsed.data.recipeVersionId, inventoryItemId: null },
    });
  } else {
    await prisma.product.update({
      where: { id },
      data: { consumptionRecipeVersionId: null, inventoryItemId: null },
    });
  }

  return NextResponse.json({ ok: true });
}
