import { Prisma, PurchaseStatus, PurchaseType, StockMovementType, StockUnit } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";
import { UnitConversionService } from "@/modules/stock/services/unitConversionService";
import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

export type PurchasePaymentInput =
  | { mode: "PENDING"; dueDate?: Date | null }
  | {
      mode: "PAID_NOW";
      method: "EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO";
      cashBoxId?: string | null;
      creditCardId?: string | null;
      installments?: number;
      createdByEmployeeId: string;
    };

export class PurchaseService {
  static async createAndPost(params: {
    type: PurchaseType;
    locationCode?: "BACONA" | "SALTA" | "EN_TRANSITO";
    supplierId?: string | null;
    supplierName?: string | null;
    invoiceNumber?: string | null;
    invoiceTotalCents?: number | null;
    notes?: string | null;
    purchasedAt?: Date;
    payment?: PurchasePaymentInput | null;
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
    if (params.supplierId && params.payment && !params.invoiceTotalCents) {
      throw new Error("Falta el monto total de la factura para registrar el pago/deuda al proveedor.");
    }

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

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          type: params.type,
          status: PurchaseStatus.POSTED,
          locationId: location.id,
          supplierId: params.supplierId ?? null,
          supplierName: params.supplierName ?? null,
          invoiceNumber: params.invoiceNumber ?? null,
          invoiceTotalCents: params.invoiceTotalCents ?? null,
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
          purchaseId: created.id,
          occurredAt: created.postedAt ?? created.purchasedAt,
          notes: created.invoiceNumber ? `Invoice ${created.invoiceNumber}` : undefined,
          lines: {
            create: created.lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              locationId: created.locationId,
              direction: "IN",
              qty: l.qty,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      return created;
    });

    if (params.supplierId && params.payment) {
      const totalAmountCents = params.invoiceTotalCents ?? 0;

      if (totalAmountCents > 0) {
        if (params.payment.mode === "PENDING") {
          await SupplierPayableService.createPayable({
            supplierId: params.supplierId,
            sourcePurchaseId: purchase.id,
            totalAmountCents,
            dueDate: params.payment.dueDate ?? null,
          });
        } else {
          const payable = await SupplierPayableService.createPayable({
            supplierId: params.supplierId,
            sourcePurchaseId: purchase.id,
            totalAmountCents,
          });
          await SupplierPayableService.registerPayment({
            supplierId: params.supplierId,
            payableId: payable.id,
            amountCents: totalAmountCents,
            date: purchase.purchasedAt,
            method: params.payment.method,
            cashBoxId: params.payment.cashBoxId ?? null,
            creditCardId: params.payment.creditCardId ?? null,
            installments: params.payment.installments,
            createdByEmployeeId: params.payment.createdByEmployeeId,
          });
        }
      }
    }

    return purchase;
  }
}