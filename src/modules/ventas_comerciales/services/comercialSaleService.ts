import { PosPaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";
import { PosPricingService } from "@/modules/ventas_pos/services/posPricingService";

const PLACEHOLDER_PRODUCT_ID = "comercial-venta-placeholder-product";

export type ComercialSaleLineInput = {
  deliveryDate: Date;
  clienteLabel: string;
  tipoVianda: string;
  cant: number;
  horarioRetiro: string;
  unitPriceCents: number;
  formaDePagoPlanificada?: string | null;
  viandasCobradasPlanned: number;
  detalleComanda?: string | null;
};

export type CreateBatchParams = {
  cuentaCorrienteAccountId?: string | null;
  notes?: string | null;
  createdByEmployeeId: string;
  lines: ComercialSaleLineInput[];
};

function lineData(l: ComercialSaleLineInput) {
  return {
    deliveryDate: l.deliveryDate,
    clienteLabel: l.clienteLabel,
    tipoVianda: l.tipoVianda,
    cant: l.cant,
    horarioRetiro: l.horarioRetiro,
    unitPriceCents: l.unitPriceCents,
    formaDePagoPlanificada: l.formaDePagoPlanificada ?? null,
    viandasCobradasPlanned: l.viandasCobradasPlanned,
    detalleComanda: l.detalleComanda ?? null,
  };
}

export class ComercialSaleService {
  static async listBatches() {
    return prisma.comercialSale.findMany({
      include: {
        cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } },
        lines: { orderBy: { sortOrder: "asc" }, include: { products: { select: { id: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getBatchDetails(id: string) {
    const batch = await prisma.comercialSale.findUnique({
      where: { id },
      include: {
        cuentaCorrienteAccount: { include: { customer: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            products: { include: { product: true } },
            deliveredByEmployee: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (!batch) throw new Error("Cierre comercial no encontrado");
    return batch;
  }

  static async createBatch(params: CreateBatchParams) {
    if (params.lines.length === 0) throw new Error("Agregá al menos una línea de entrega");

    return prisma.$transaction(async (tx) => {
      const batch = await tx.comercialSale.create({
        data: {
          cuentaCorrienteAccountId: params.cuentaCorrienteAccountId ?? null,
          notes: params.notes ?? null,
          createdByEmployeeId: params.createdByEmployeeId,
        },
      });

      await tx.comercialSaleLine.createMany({
        data: params.lines.map((l, i) => ({
          comercialSaleId: batch.id,
          ...lineData(l),
          sortOrder: i,
        })),
      });

      return tx.comercialSale.findUniqueOrThrow({ where: { id: batch.id } });
    });
  }

  static async addLine(batchId: string, line: ComercialSaleLineInput) {
    const count = await prisma.comercialSaleLine.count({ where: { comercialSaleId: batchId } });
    return prisma.comercialSaleLine.create({
      data: { comercialSaleId: batchId, ...lineData(line), sortOrder: count },
    });
  }

  static async updateLine(lineId: string, patch: Partial<ComercialSaleLineInput>) {
    const line = await prisma.comercialSaleLine.findUnique({ where: { id: lineId }, select: { status: true } });
    if (!line) throw new Error("Línea no encontrada");
    if (line.status !== "PENDIENTE") throw new Error("Solo se puede editar una línea pendiente");
    return prisma.comercialSaleLine.update({ where: { id: lineId }, data: patch });
  }

  static async removeLine(lineId: string) {
    const line = await prisma.comercialSaleLine.findUnique({ where: { id: lineId }, select: { status: true } });
    if (!line) throw new Error("Línea no encontrada");
    if (line.status !== "PENDIENTE") throw new Error("Solo se puede eliminar una línea pendiente");
    await prisma.comercialSaleLine.delete({ where: { id: lineId } });
  }

  static async cancelLine(lineId: string, reason: string) {
    const line = await prisma.comercialSaleLine.findUnique({ where: { id: lineId }, select: { status: true } });
    if (!line) throw new Error("Línea no encontrada");
    if (line.status === "ENTREGADA") {
      throw new Error("No se puede cancelar una línea ya entregada. Gestioná la anulación desde el POS.");
    }
    if (line.status === "CANCELADA") return prisma.comercialSaleLine.findUnique({ where: { id: lineId } });
    return prisma.comercialSaleLine.update({
      where: { id: lineId },
      data: { status: "CANCELADA", cancellationReason: reason, cancelledAt: new Date() },
    });
  }

  static async getUpcomingLines() {
    const recentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const lines = await prisma.comercialSaleLine.findMany({
      where: {
        OR: [{ status: "PENDIENTE" }, { status: "ENTREGADA", deliveredAt: { gte: recentCutoff } }],
      },
      include: {
        comercialSale: {
          include: { cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } } },
        },
        products: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: [{ deliveryDate: "asc" }, { sortOrder: "asc" }],
    });

    // Pendientes primero (necesitan acción del asociado); entregadas recientes
    // abajo, solo como historial. Array.sort es estable, así que el orden por
    // fecha/sortOrder de la query se conserva dentro de cada grupo.
    return lines.sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "PENDIENTE" ? -1 : 1;
    });
  }

  static async setLineProducts(lineId: string, products: { productId: string; qtyPerUnit: number }[]) {
    const line = await prisma.comercialSaleLine.findUnique({ where: { id: lineId }, select: { status: true } });
    if (!line) throw new Error("Línea no encontrada");
    if (line.status !== "PENDIENTE") throw new Error("Solo se puede editar el desglose de una línea pendiente");

    return prisma.$transaction(async (tx) => {
      await tx.comercialSaleLineProduct.deleteMany({ where: { comercialSaleLineId: lineId } });
      if (products.length > 0) {
        await tx.comercialSaleLineProduct.createMany({
          data: products.map((p, i) => ({
            comercialSaleLineId: lineId,
            productId: p.productId,
            qtyPerUnit: p.qtyPerUnit,
            sortOrder: i,
          })),
        });
      }
      return tx.comercialSaleLine.findUniqueOrThrow({
        where: { id: lineId },
        include: { products: { include: { product: true } } },
      });
    });
  }

  static async deliverLine(params: {
    lineId: string;
    actualQty: number;
    actualCobradas: number;
    paymentMethod: PosPaymentMethod;
    employeeId: string;
    cashSessionId: string;
  }) {
    const line = await prisma.comercialSaleLine.findUnique({
      where: { id: params.lineId },
      include: {
        products: true,
        comercialSale: { include: { cuentaCorrienteAccount: true } },
      },
    });
    if (!line) throw new Error("Línea no encontrada");
    if (line.status !== "PENDIENTE") throw new Error("Esta línea ya fue entregada o cancelada");
    if (!Number.isInteger(params.actualQty) || params.actualQty < 0) {
      throw new Error("Cantidad entregada inválida");
    }
    if (!Number.isInteger(params.actualCobradas) || params.actualCobradas < 0) {
      throw new Error("Viandas cobradas inválida");
    }

    const account = line.comercialSale.cuentaCorrienteAccount;
    if (params.paymentMethod === "CUENTA_CORRIENTE" && !account) {
      throw new Error("Este cierre no tiene una cuenta corriente asociada");
    }

    const totalCents = line.unitPriceCents * params.actualCobradas;
    if (totalCents <= 0) throw new Error("El total a cobrar debe ser mayor a cero");

    const sale = await PosSaleService.createDraft({
      saleType: "COMERCIAL",
      cashSessionId: params.cashSessionId,
    });

    for (const p of line.products) {
      const qty = Math.round(Number(p.qtyPerUnit) * params.actualQty);
      if (qty <= 0) continue;
      await prisma.posSaleItem.create({
        data: { saleId: sale.id, productId: p.productId, qty, unitPriceCents: 0, lineTotalCents: 0 },
      });
    }

    await prisma.posSaleItem.create({
      data: {
        saleId: sale.id,
        productId: PLACEHOLDER_PRODUCT_ID,
        qty: 1,
        unitPriceCents: totalCents,
        lineTotalCents: totalCents,
      },
    });

    await PosPricingService.recomputeSaleTotals(sale.id);

    if (params.paymentMethod === "CUENTA_CORRIENTE") {
      await PosSaleService.updateSale(sale.id, { cuentaCorrienteAccountId: account!.id });
    }

    await PosSaleService.addPayment({
      saleId: sale.id,
      method: params.paymentMethod,
      amountCents: totalCents,
      cuentaCorrienteAccountId: params.paymentMethod === "CUENTA_CORRIENTE" ? account!.id : null,
      employeeId: params.paymentMethod === "CUENTAS_INTERNAS" ? params.employeeId : null,
    });

    if (params.paymentMethod === "CHEQUE") {
      const payment = await prisma.posPayment.findFirstOrThrow({ where: { saleId: sale.id, method: "CHEQUE" } });
      await prisma.cheque.create({
        data: {
          posPaymentId: payment.id,
          amountCents: totalCents,
          createdByEmployeeId: params.employeeId,
        },
      });

      // El cheque todavía no es plata acreditada — se deja un cargo pendiente
      // de facturar (igual que hace cuenta corriente con la venta), sea cual
      // sea el tipo de cuenta: en una transitoria, Gerencia lo factura
      // manualmente por selección; en una corporativa, cae en la quincena/mes
      // en curso y se factura junto con el resto del período. La factura se
      // salda sola cuando el cheque se acredita (ver ChequeService.markAcreditado).
      if (account) {
        await prisma.ccDirectCharge.create({
          data: {
            cuentaCorrienteAccountId: account.id,
            comercialSaleLineId: line.id,
            date: new Date(),
            description: `Venta comercial (cheque) — ${line.clienteLabel}`,
            motive: line.tipoVianda,
            category: "OTRO",
            amountCents: totalCents,
            createdByEmployeeId: params.employeeId,
          },
        });
      }
    }

    await PosSaleService.confirmSale(sale.id);

    const updatedLine = await prisma.comercialSaleLine.update({
      where: { id: line.id },
      data: {
        status: "ENTREGADA",
        actualQty: params.actualQty,
        actualCobradas: params.actualCobradas,
        paymentMethod: params.paymentMethod,
        posSaleId: sale.id,
        deliveredAt: new Date(),
        deliveredByEmployeeId: params.employeeId,
      },
    });

    return updatedLine;
  }
}
