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

  const [directProducts, recipeLines, productionLines] = await Promise.all([
    // Products linked directly to this item
    prisma.product.findMany({
      where: { inventoryItemId: id, isActive: true },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),

    // Recipe lines that consume this item (direction=OUT, CONSUMPTION recipes)
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

    // Production recipes that output this item (direction=IN)
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
  ]);

  // Flatten recipe products (deduplicate by product id)
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

  // Deduplicate production recipes by recipe id
  const productionRecipesMap = new Map<string, { id: string; name: string }>();
  for (const line of productionLines) {
    const r = line.recipeVersion.recipe;
    if (!productionRecipesMap.has(r.id)) {
      productionRecipesMap.set(r.id, { id: r.id, name: r.name });
    }
  }

  return NextResponse.json({
    directProducts: directProducts.map((p) => ({
      productId: p.id,
      productName: p.name,
      categoryName: p.category.name,
    })),
    recipeProducts: [...recipeProductsMap.values()],
    productionRecipes: [...productionRecipesMap.values()],
  });
}
