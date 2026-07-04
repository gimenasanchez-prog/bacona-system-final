import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

const CORPORATIVO_CATEGORY_NAME = "Corporativo";

export class PreciosService {
  static async listGroupedByCategory() {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      isActive: p.isActive,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      isCorporativo: p.category.name === CORPORATIVO_CATEGORY_NAME,
    }));
  }

  static async updateProduct(params: {
    productId: string;
    name?: string;
    priceCents?: number;
    isActive?: boolean;
    employeeId: string;
  }) {
    const { productId, name, priceCents, isActive, employeeId } = params;

    const current = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });
    if (!current) throw new Error("Producto no encontrado");

    if (name !== undefined && name !== current.name && current.category.name === CORPORATIVO_CATEGORY_NAME) {
      throw new Error(
        "No se puede editar el nombre de productos de Tarifas Corporativas: el POS filtra los combos de cada plan por el nombre del producto, y renombrarlo rompería ese filtro."
      );
    }

    if (priceCents !== undefined) {
      assertIntCents(priceCents, "priceCents");
    }

    const priceChanged = priceCents !== undefined && priceCents !== current.priceCents;

    if (!priceChanged) {
      return prisma.product.update({
        where: { id: productId },
        data: { name, priceCents, isActive },
        include: { category: true },
      });
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: { name, priceCents, isActive },
        include: { category: true },
      });
      await tx.priceHistory.create({
        data: {
          productId,
          oldPriceCents: current.priceCents,
          newPriceCents: priceCents!,
          changeType: "MANUAL",
          createdByEmployeeId: employeeId,
        },
      });
      return updated;
    });
  }

  static async previewBulkIncrease(params: { categoryIds: string[]; percent: number }) {
    const { categoryIds, percent } = params;

    const products = await prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    });

    return products.map((p) => ({
      productId: p.id,
      name: p.name,
      categoryName: p.category.name,
      oldPriceCents: p.priceCents,
      newPriceCents: Math.round(p.priceCents * (1 + percent / 100)),
    }));
  }

  static async applyBulkIncrease(params: {
    categoryIds: string[];
    percent: number;
    employeeId: string;
  }) {
    const { categoryIds, percent, employeeId } = params;

    return prisma.$transaction(
      async (tx) => {
        const products = await tx.product.findMany({
          where: { categoryId: { in: categoryIds }, isActive: true },
        });

        const bulkUpdate = await tx.priceBulkUpdate.create({
          data: {
            percent,
            categoryIds,
            affectedCount: products.length,
            createdByEmployeeId: employeeId,
          },
        });

        for (const product of products) {
          const newPriceCents = Math.round(product.priceCents * (1 + percent / 100));
          assertIntCents(newPriceCents, "priceCents");

          await tx.product.update({
            where: { id: product.id },
            data: { priceCents: newPriceCents },
          });
          await tx.priceHistory.create({
            data: {
              productId: product.id,
              oldPriceCents: product.priceCents,
              newPriceCents,
              changeType: "BULK",
              bulkUpdateId: bulkUpdate.id,
              createdByEmployeeId: employeeId,
            },
          });
        }

        return { bulkUpdate, updatedCount: products.length };
      },
      { timeout: 20000 }
    );
  }
}
