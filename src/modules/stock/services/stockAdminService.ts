import { prisma } from "@/lib/prisma";

export class StockAdminService {
  static async getAuditData() {
    const [products, productionRecipes, consumptionRecipes, inventoryItems] =
      await Promise.all([
        prisma.product.findMany({
          where: { isActive: true },
          include: {
            category: true,
            consumptionRecipeVersion: { include: { recipe: true } },
            inventoryItem: true,
          },
          orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
        }),
        prisma.recipe.findMany({
          where: { kind: "PRODUCTION", isActive: true },
          include: {
            versions: {
              where: { isActive: true },
              include: {
                lines: {
                  include: { inventoryItem: true },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.recipe.findMany({
          where: { kind: "CONSUMPTION", isActive: true },
          include: {
            versions: {
              where: { isActive: true },
              include: {
                lines: {
                  include: { inventoryItem: { select: { id: true, name: true, unit: true } } },
                  orderBy: { sortOrder: "asc" },
                },
                productConsumptionLinks: { select: { name: true } },
              },
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.inventoryItem.findMany({
          where: { isActive: true },
          select: { id: true, name: true, unit: true },
          orderBy: { name: "asc" },
        }),
      ]);

    // Build map: inventoryItemId → production recipe name (for items that are outputs)
    // Needed by the modal to show "Producida en: Miguelitos" next to each ingredient
    const productionByOutputItemId = new Map<string, { recipeId: string; recipeName: string }>();
    for (const recipe of productionRecipes) {
      const v = recipe.versions[0];
      if (!v) continue;
      for (const line of v.lines) {
        if (line.direction === "IN") {
          productionByOutputItemId.set(line.inventoryItemId, {
            recipeId: recipe.id,
            recipeName: recipe.name,
          });
        }
      }
    }

    // Shape consumption recipes for the modal dropdown + ingredient preview
    const consumptionRecipesForModal = consumptionRecipes.map((r) => {
      const v = r.versions[0] ?? null;
      return {
        id: r.id,
        name: r.name,
        activeVersion: v
          ? {
              id: v.id,
              lines: v.lines
                .filter((l) => l.direction === "OUT")
                .map((l) => ({
                  inventoryItemId: l.inventoryItemId,
                  itemName: l.inventoryItem.name,
                  qty: l.qty.toString(),
                  unit: l.inventoryItem.unit,
                })),
            }
          : null,
      };
    });

    return {
      products,
      productionRecipes,
      consumptionRecipes,
      inventoryItems,
      consumptionRecipesForModal,
      productionByOutputItemId: Object.fromEntries(productionByOutputItemId),
    };
  }
}
