import { Prisma, PosPaymentMethod, PosSaleStatus, PosSaleType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { onSaleConfirmed, onSalePaid } from "./posIntegrationHooks";
import { PosModifiersService } from "./posModifiersService";
import { PosPaymentService } from "./posPaymentService";
import { PosPricingService } from "./posPricingService";
import { StockMovementService } from "@/modules/stock/services/stockMovementService";

type SaleUpdateInput = {
  saleType?: PosSaleType;
  customerId?: string | null;
  cuentaCorrienteAccountId?: string | null;
  customerNameFreeText?: string | null;
  tableId?: string | null;
  reservationAt?: Date | null;
  externalRefs?: Record<string, any> | null;
  comandaNumber?: string;
};

export class PosSaleService {
  static async createDraft(params: {
    saleType: PosSaleType;
    tableId?: string | null;
    reservationAt?: Date | null;
    cashSessionId?: string | null;
  }) {
    return prisma.posSale.create({
      data: {
        saleType: params.saleType,
        tableId: params.tableId ?? null,
        reservationAt: params.reservationAt ?? null,
        cashSessionId: params.cashSessionId ?? null,
      },
    });
  }

  static async getSaleDetails(saleId: string) {
    const sale = await prisma.posSale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        cuentaCorrienteAccount: { include: { customer: true } },
        table: true,
        items: {
          include: {
            product: true,
            modifiers: { include: { modifierOption: { include: { group: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          include: {
            cuentaCorrienteAccount: { include: { customer: true } },
            employee: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!sale) throw new Error("Sale not found");
    const paidTotalCents = sale.payments.reduce((s, p) => s + p.amountCents, 0);
    return { sale, paidTotalCents };
  }

  static async updateSale(saleId: string, input: SaleUpdateInput) {
    return prisma.posSale.update({
      where: { id: saleId },
      data: {
        saleType: input.saleType,
        customerId: input.customerId,
        cuentaCorrienteAccountId: input.cuentaCorrienteAccountId,
        customerNameFreeText: input.customerNameFreeText,
        tableId: input.tableId,
        reservationAt: input.reservationAt,
        externalRefs: input.externalRefs === null ? Prisma.DbNull : input.externalRefs,
        comandaNumber: input.comandaNumber,
      },
    });
  }

  static async addItem(params: {
    saleId: string;
    productId: string;
    qty: number;
    selectedOptionIds: string[];
  }) {
    if (!Number.isInteger(params.qty) || params.qty <= 0) {
      throw new Error("qty must be a positive integer");
    }

    const sale = await prisma.posSale.findUnique({
      where: { id: params.saleId },
      select: { status: true, saleType: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "PAID" || sale.status === "CANCELLED") {
      throw new Error("Cannot modify items on a paid or cancelled sale");
    }
    if (sale.status === "CONFIRMED" && sale.saleType === "MOSTRADOR") {
      throw new Error("Cannot modify items after sale is confirmed/paid/cancelled");
    }

    const product = await prisma.product.findUnique({ where: { id: params.productId } });
    if (!product || !product.isActive) throw new Error("Product not found or inactive");

    const { optionPriceDeltaById } = await PosModifiersService.validateProductModifierSelection({
      productId: params.productId,
      selectedOptionIds: params.selectedOptionIds,
    });

    const selectedIdsSorted = [...params.selectedOptionIds].sort();
    const existing = await prisma.posSaleItem.findMany({
      where: { saleId: params.saleId, productId: params.productId },
      include: { modifiers: true },
    });

    const existingMatch = existing.find((item) => {
      const existingIds = item.modifiers.map((m) => m.modifierOptionId).sort();
      if (existingIds.length !== selectedIdsSorted.length) return false;
      for (let i = 0; i < existingIds.length; i++) {
        if (existingIds[i] !== selectedIdsSorted[i]) return false;
      }
      return true;
    });

    const unitPriceCents =
      product.priceCents +
      selectedIdsSorted.reduce((sum, id) => sum + (optionPriceDeltaById[id] ?? 0), 0);

    if (existingMatch) {
      const newQty = existingMatch.qty + params.qty;
      await prisma.posSaleItem.update({
        where: { id: existingMatch.id },
        data: {
          qty: newQty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * newQty,
        },
      });
    } else {
      await prisma.posSaleItem.create({
        data: {
          saleId: params.saleId,
          productId: params.productId,
          qty: params.qty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * params.qty,
          modifiers: {
            create: selectedIdsSorted.map((modifierOptionId) => ({
              modifierOptionId,
              priceDeltaCents: optionPriceDeltaById[modifierOptionId] ?? 0,
            })),
          },
        },
      });
    }

    await PosPricingService.recomputeSaleTotals(params.saleId);
    return this.getSaleDetails(params.saleId);
  }

  static async updateItemQty(params: { saleId: string; itemId: string; qty: number }) {
    if (!Number.isInteger(params.qty) || params.qty < 0) {
      throw new Error("qty must be an integer >= 0");
    }

    const sale = await prisma.posSale.findUnique({
      where: { id: params.saleId },
      select: { status: true, saleType: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "PAID" || sale.status === "CANCELLED") {
      throw new Error("Cannot modify items on a paid or cancelled sale");
    }
    if (sale.status === "CONFIRMED" && sale.saleType === "MOSTRADOR") {
      throw new Error("Cannot modify items after sale is confirmed/paid/cancelled");
    }
    if (params.qty === 0) {
      await prisma.posSaleItem.delete({ where: { id: params.itemId } });
    } else {
      const item = await prisma.posSaleItem.findUnique({ where: { id: params.itemId } });
      if (!item || item.saleId !== params.saleId) throw new Error("Item not found");
      await prisma.posSaleItem.update({
        where: { id: params.itemId },
        data: { qty: params.qty, lineTotalCents: item.unitPriceCents * params.qty },
      });
    }
    await PosPricingService.recomputeSaleTotals(params.saleId);
    return this.getSaleDetails(params.saleId);
  }

  static async removeItem(params: { saleId: string; itemId: string }) {
    const sale = await prisma.posSale.findUnique({
      where: { id: params.saleId },
      select: { status: true, saleType: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "PAID" || sale.status === "CANCELLED") {
      throw new Error("Cannot modify items on a paid or cancelled sale");
    }
    if (sale.status === "CONFIRMED" && sale.saleType === "MOSTRADOR") {
      throw new Error("Cannot modify items after sale is confirmed/paid/cancelled");
    }
    const item = await prisma.posSaleItem.findUnique({ where: { id: params.itemId } });
    if (!item || item.saleId !== params.saleId) throw new Error("Item not found");
    await prisma.posSaleItem.delete({ where: { id: params.itemId } });
    await PosPricingService.recomputeSaleTotals(params.saleId);
    return this.getSaleDetails(params.saleId);
  }

  static async addPayment(params: {
    saleId: string;
    method: PosPaymentMethod;
    amountCents: number;
    cuentaCorrienteAccountId?: string | null;
    employeeId?: string | null;
    comandaNumber?: string;
  }) {
    await PosPaymentService.addPayment(params);
    if (params.method === "CUENTA_CORRIENTE" && params.comandaNumber) {
      await prisma.posSale.update({
        where: { id: params.saleId },
        data: { comandaNumber: params.comandaNumber },
      });
    }
    return this.getSaleDetails(params.saleId);
  }

  static async confirmSale(saleId: string) {
    const { sale, paidTotalCents } = await this.getSaleDetails(saleId);

    if (sale.items.length === 0) throw new Error("Sale must have at least one item");

    if (sale.saleType === "MESA" && !sale.tableId) {
      throw new Error("tableId is required for MESA sales");
    }
    if (sale.saleType === "RESERVA" && !sale.reservationAt) {
      throw new Error("reservationAt is required for RESERVA sales");
    }

    const isPaid = paidTotalCents >= sale.totalCents;

    if (sale.saleType === "MOSTRADOR" && !isPaid) {
      throw new Error("MOSTRADOR sales require payment before confirming");
    }

    const newStatus: PosSaleStatus = isPaid ? "PAID" : "CONFIRMED";

    return prisma.$transaction(async (tx) => {
      const updated = await tx.posSale.update({
        where: { id: saleId },
        data: { status: newStatus },
      });

      await onSaleConfirmed(saleId, tx);
      if (newStatus === "PAID") await onSalePaid(saleId, tx);
      return updated;
    });
  }

  static async markPaid(saleId: string) {
    const { sale, paidTotalCents } = await this.getSaleDetails(saleId);
    if (paidTotalCents < sale.totalCents) throw new Error("Payments do not cover total");
    if (sale.status === "DRAFT") throw new Error("Sale must be confirmed before marking paid");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.posSale.update({
        where: { id: saleId },
        data: { status: "PAID" },
      });
      await onSalePaid(saleId, tx);
      return updated;
    });
  }

  static async cancelSaleByGerencia(saleId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findUnique({
        where: { id: saleId },
        select: { status: true },
      });
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.status === "CANCELLED") return tx.posSale.findUnique({ where: { id: saleId } });

      if (sale.status === "CONFIRMED" || sale.status === "PAID") {
        await StockMovementService.ensureReversalForSaleMovement(tx, saleId);
      }

      return tx.posSale.update({
        where: { id: saleId },
        data: { status: "CANCELLED", cancellationReason: reason.trim(), cancelledAt: new Date() },
      });
    });
  }

  static async cancelSale(saleId: string, reason?: string) {
    return prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findUnique({
        where: { id: saleId },
        select: { status: true, cashSessionId: true },
      });
      if (!sale) throw new Error("Sale not found");
      if (sale.status === "CANCELLED") {
        return tx.posSale.findUnique({ where: { id: saleId } });
      }

      if (sale.status === "PAID") {
        if (!reason?.trim()) throw new Error("Se requiere un motivo para anular una venta paga");
        if (sale.cashSessionId) {
          const session = await tx.cashSession.findUnique({
            where: { id: sale.cashSessionId },
            select: { status: true },
          });
          if (session?.status === "CLOSED") {
            throw new Error(
              "Esta venta pertenece a un turno cerrado. La anulación debe gestionarla gerencia."
            );
          }
        }
      }

      if (sale.status === "CONFIRMED" || sale.status === "PAID") {
        await StockMovementService.ensureReversalForSaleMovement(tx, saleId);
      }

      return tx.posSale.update({
        where: { id: saleId },
        data: {
          status: "CANCELLED",
          cancellationReason: reason?.trim() ?? null,
          cancelledAt: new Date(),
        },
      });
    });
  }
}

