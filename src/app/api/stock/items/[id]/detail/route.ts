import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: "Ítem no encontrado" }, { status: 404 });

  const [directProducts, recipeLines, productionOutputLines, productionInputLines] =
    await Promise.all([
      // Products linked directly to this item
      prisma.product.findMany({
        where: { inventoryItemId: id, isActive: true },
        select: { id: true, name: true, category: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),

      // Consumption recipe lines that use this item as ingredient (direction=OUT)
      prisma.recipeLine.findMany({
        where: {
          inventoryItemId: id,
          direction: "OUT",
          recipeVersion: {
            isActive: true,
            recipe: { kind: "CONSUMPTION", isActive: true },
          },
        },
        select: {
          recipeVersion: {
            select: {
              id: true,
              recipe: { select: { name: true } },
              productConsumptionLinks: {
                where: { isActive: true },
                select: { id: true, name: true, category: { select: { name: true } } },
              },
            },
          },
        },
      }),

      // Production recipes that OUTPUT this item (direction=IN) — i.e. produce it
      prisma.recipeLine.findMany({
        where: {
          inventoryItemId: id,
          direction: "IN",
          recipeVersion: {
            isActive: true,
            recipe: { kind: "PRODUCTION", isActive: true },
          },
        },
        select: {
          recipeVersion: {
            select: {
              recipe: { select: { id: true, name: true } },
            },
          },
        },
      }),

      // Production recipes that USE this item as ingredient (direction=OUT)
      prisma.recipeLine.findMany({
        where: {
          inventoryItemId: id,
          direction: "OUT",
          recipeVersion: {
            isActive: true,
            recipe: { kind: "PRODUCTION", isActive: true },
          },
        },
        select: {
          recipeVersion: {
            select: {
              recipe: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

  // Flatten consumption recipe products (deduplicate by product id)
  const recipeProductsMap = new Map<
    string,
    { productId: string; productName: string; categoryName: string; recipeName: string }
  >();
  for (const line of recipeLines) {
    const { recipeVersion } = line;
    for (const p of recipeVersion.productConsumptionLinks) {
      if (!recipeProductsMap.has(p.id)) {
        recipeProductsMap.set(p.id, {
          productId: p.id,
          productName: p.name,
          categoryName: p.category.name,
          recipeName: recipeVersion.recipe.name,
        });
      }
    }
  }

  // Production recipes that generate this item (dedup)
  const productionOutputMap = new Map<string, { id: string; name: string }>();
  for (const line of productionOutputLines) {
    const r = line.recipeVersion.recipe;
    if (!productionOutputMap.has(r.id)) productionOutputMap.set(r.id, r);
  }

  // Production recipes that use this item as ingredient (dedup)
  const productionInputMap = new Map<string, { id: string; name: string }>();
  for (const line of productionInputLines) {
    const r = line.recipeVersion.recipe;
    if (!productionInputMap.has(r.id)) productionInputMap.set(r.id, r);
  }

  return NextResponse.json({
    directProducts: directProducts.map((p) => ({
      productId: p.id,
      productName: p.name,
      categoryName: p.category.name,
    })),
    recipeProducts: [...recipeProductsMap.values()],
    // Recipes that PRODUCE this item (relevant to register a production batch to restock)
    productionRecipes: [...productionOutputMap.values()],
    // Recipes that CONSUME this item as ingredient (relevant to know which batches need it)
    productionConsumers: [...productionInputMap.values()],
  });
}
