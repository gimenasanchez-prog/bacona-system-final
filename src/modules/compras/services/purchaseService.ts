import { Prisma, PurchaseStatus, PurchaseType, StockMovementType, StockUnit } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";
import { UnitConversionService } from "@/modules/stock/services/unitConversionService";

export class PurchaseService {
  static async createAndPost(params: {
    type: PurchaseType;
    locationCode?: "BACONA" | "SALTA" | "EN_TRANSITO";
    supplierName?: string | null;
    invoiceNumber?: string | null;
    notes?: string | null;
    purchasedAt?: Date;
    lines: Array<{
      inventoryItemId: string;
      qty: string | number;
      unit?: string | null;
      uomId?: string | null;
      unitCostCents?: number | null;
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

    // Pre-load items and uoms to avoid N+1 in transaction
    const itemIds = [...new Set(params.lines.map((l) => l.inventoryItemId))];
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((it) => [it.id, it]));

    const uomIds = params.lines.map((l) => l.uomId).filter(Boolean) as string[];
    const uomMap = new Map<string, Awaited<ReturnType<typeof prisma.inventoryItemUom.findFirst>>>();
    if (uomIds.length) {
      const uoms = await prisma.inventoryItemUom.findMany({ where: { id: { in: uomIds } } });
      uoms.forEach((u) => uomMap.set(u.id, u));
    }

    // Resolve base qty + entry audit fields for each line
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
      const purchase = await tx.purchase.create({
        data: {
          type: params.type,
          status: PurchaseStatus.POSTED,
          locationId: location.id,
          supplierName: params.supplierName ?? null,
          invoiceNumber: params.invoiceNumber ?? null,
          notes: params.notes ?? null,
          purchasedAt: params.purchasedAt ?? new Date(),
          postedAt: new Date(),
          lines: {
            create: processedLines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              qty: l.qtyBase,
              entryQty: l.entryQty,
              entryUnit: l.entryUnit,
              uomId: l.uomId ?? null,
              unitCostCents: l.unitCostCents ?? null,
              sortOrder: l.idx,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.stockMovement.create({
        data: {
          type: StockMovementType.PURCHASE,
          purchaseId: purchase.id,
          occurredAt: purchase.postedAt ?? purchase.purchasedAt,
          notes: purchase.invoiceNumber ? `Invoice ${purchase.invoiceNumber}` : undefined,
          lines: {
            create: purchase.lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              locationId: purchase.locationId,
              direction: "IN",
              qty: l.qty,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      return purchase;
    });
  }
}