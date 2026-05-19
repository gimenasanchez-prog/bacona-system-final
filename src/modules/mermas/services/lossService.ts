import { Prisma, LossReasonType, StockMovementType, StockUnit } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";
import { UnitConversionService } from "@/modules/stock/services/unitConversionService";

export class LossService {
  static async createLossEvent(params: {
    reasonType: LossReasonType;
    locationCode?: "BACONA" | "SALTA" | "EN_TRANSITO";
    occurredAt?: Date;
    notes?: string | null;
    lines: Array<{
      inventoryItemId: string;
      qty: string | number;
      unit?: string | null;
      uomId?: string | null;
    }>;
  }) {
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
      const lossEvent = await tx.lossEvent.create({
        data: {
          reasonType: params.reasonType,
          locationId: location.id,
          occurredAt: params.occurredAt ?? new Date(),
          notes: params.notes ?? null,
          lines: {
            create: processedLines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
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
          type: StockMovementType.LOSS,
          lossEventId: lossEvent.id,
          occurredAt: lossEvent.occurredAt,
          notes: lossEvent.notes ?? undefined,
          lines: {
            create: lossEvent.lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              locationId: lossEvent.locationId,
              direction: "OUT",
              qty: l.qty,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      return lossEvent;
    });
  }
}
