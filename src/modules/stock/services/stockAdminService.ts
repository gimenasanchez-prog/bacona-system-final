import { prisma } from "@/lib/prisma";

export class StockAdminService {
  static async getAuditData() {
    const [products, productionRecipes, consumptionRecipes] = await Promise.all([
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
                include: { inventoryItem: true },
                orderBy: { sortOrder: "asc" },
              },
              productConsumptionLinks: { select: { name: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return { products, productionRecipes, consumptionRecipes };
  }
}
