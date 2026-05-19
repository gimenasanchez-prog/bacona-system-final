import {
  Prisma,
  ProductionStatus,
  RecipeKind,
  StockMovementDirection,
  StockMovementType,
  StockUnit,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";
import { UnitConversionService } from "@/modules/stock/services/unitConversionService";

export class ProductionService {
  static async ensureFreeProductionRecipeVersionId() {
    const existing = await prisma.recipe.findFirst({
      where: { kind: RecipeKind.PRODUCTION, name: "Producción libre" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (existing?.versions[0]) return existing.versions[0].id;

    const recipe = await prisma.recipe.create({
      data: {
        name: "Producción libre",
        kind: RecipeKind.PRODUCTION,
        isActive: true,
        versions: {
          create: [{ version: 1, isActive: true }],
        },
      },
      include: { versions: true },
    });
    return recipe.versions[0]!.id;
  }

  static async createAndConfirmBatch(params: {
    occurredAt?: Date;
    locationCode?: "BACONA" | "SALTA" | "EN_TRANSITO";
    deviationFlag?: boolean;
    deviationReason?: string | null;
    lines: Array<{
      inventoryItemId: string;
      direction: StockMovementDirection;
      qty: string | number;
      unit?: string | null;
      uomId?: string | null;
    }>;
  }) {
    const recipeVersionId = await this.ensureFreeProductionRecipeVersionId();
    const { bacona, salta, enTransito } = await StockDefaultsService.ensureDefaultLocations(prisma);
    const location =
      params.locationCode === "SALTA"
        ? salta
        : params.locationCode === "EN_TRANSITO"
          ? enTransito
          : bacona;

    if (!params.lines.length) throw new Error("At least one line is required");

    // Pre-load items and uoms
    const itemIds = [...new Set(params.lines.map((l) => l.inventoryItemId))];
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((it) => [it.id, it]));

    const uomIds = params.lines.map((l) => l.uomId).filter(Boolean) as string[];
    const uomMap = new Map<string, Awaited<ReturnType<typeof prisma.inventoryItemUom.findFirst>>>();
    if (uomIds.length) {
      const uoms = await prisma.inventoryItemUom.findMany({ where: { id: { in: uomIds } } });
      uoms.forEach((u) => uomMap.set(u.id, u));
    }

    const processedLines = params.lines.map((l, idx) => {
      const item = itemMap.get(l.inventoryItemId);
      if (!item) throw new Error(`Ítem ${l.inventoryItemId} no encontrado`);

      let qtyBase: Prisma.Decimal;
      const entryQty = new Prisma.Decimal(String(l.qty));
      let entryUnit: StockUnit;
      let uomId: string | null = null;

      if (l.uomId) {
        const uom = uomMap.get(l.uomId);
        if (!uom) throw new Error(`Presentación ${l.uomId} no encontrada`);
        if (uom.inventoryItemId !== l.inventoryItemId)
          throw new Error(`La presentación no corresponde al ítem "${item.name}"`);
        qtyBase = UnitConversionService.toBaseQtyFromUom({
          qty: l.qty,
          multiplierToBase: uom.multiplierToBase,
        });
        entryUnit = uom.unit;
        uomId = uom.id;
      } else {
        entryUnit = (l.unit ?? item.unit) as StockUnit;
        qtyBase = UnitConversionService.toBaseQty({
          qty: l.qty,
          entryUnit,
          itemUnit: item.unit,
          itemDimension: item.dimension,
          itemName: item.name,
        });
      }

      return { ...l, idx, qtyBase, entryQty, entryUnit, uomId };
    });

    return prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.create({
        data: {
          recipeVersionId,
          locationId: location.id,
          status: ProductionStatus.CONFIRMED,
          occurredAt: params.occurredAt ?? new Date(),
          deviationFlag: params.deviationFlag ?? false,
          deviationReason: params.deviationReason ?? null,
          lines: {
            create: processedLines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              direction: l.direction,
              qty: l.qtyBase,
              entryQty: l.entryQty,
              entryUnit: l.entryUnit,
              uomId: l.uomId ?? null,
              sortOrder: l.idx,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.stockMovement.create({
        data: {
          type: StockMovementType.PRODUCTION,
          productionBatchId: batch.id,
          occurredAt: batch.occurredAt,
          lines: {
            create: batch.lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              locationId: batch.locationId,
              direction: l.direction,
              qty: l.qty,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      return batch;
    });
  }
}
