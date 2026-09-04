import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";
import { PLAN_TARIFF_CONFIG, isUncappedPlan, matchesCorpoFilter } from "@/modules/cuentas_corrientes/lib/planTariffs";

const CORPORATIVO_CATEGORY_NAME = "Corporativo";

export class PreciosService {
  /**
   * Recalcula coverageAmountCents (tope del POS por cuenta CC) para toda
   * cuenta corriente con tarifa corporativa, según el precio actual del
   * producto "Corporativo" más caro habilitado para su plan. Debe correrse
   * dentro de la misma transacción que cualquier cambio de precio en la
   * categoría Corporativo — ver prisma/set-cc-coverage-amounts.ts (script
   * histórico) y planTariffs.ts para la misma regla usada en el alta de
   * cuentas.
   */
  private static async syncCorporateCoverageAmounts(tx: Prisma.TransactionClient) {
    const corporateProducts = await tx.product.findMany({
      where: { category: { name: CORPORATIVO_CATEGORY_NAME } },
      select: { name: true, priceCents: true },
    });

    const accounts = await tx.cuentaCorrienteAccount.findMany({
      where: { planCode: { not: null } },
      select: { id: true, planCode: true, coverageAmountCents: true },
    });

    for (const acc of accounts) {
      if (isUncappedPlan(acc.planCode)) continue;
      const config = PLAN_TARIFF_CONFIG[acc.planCode as string];
      if (!config) continue;

      const matching = corporateProducts.filter((p) => matchesCorpoFilter(p.name.toLowerCase(), config.corpoFilter));
      const suggested = matching.length > 0 ? Math.max(...matching.map((p) => p.priceCents)) : null;

      if (suggested !== acc.coverageAmountCents) {
        await tx.cuentaCorrienteAccount.update({
          where: { id: acc.id },
          data: { coverageAmountCents: suggested },
        });
      }
    }
  }

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
      if (current.category.name === CORPORATIVO_CATEGORY_NAME) {
        await PreciosService.syncCorporateCoverageAmounts(tx);
      }
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
          include: { category: true },
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

        if (products.some((p) => p.category.name === CORPORATIVO_CATEGORY_NAME)) {
          await PreciosService.syncCorporateCoverageAmounts(tx);
        }

        return { bulkUpdate, updatedCount: products.length };
      },
      { timeout: 20000 }
    );
  }
}
