import { Prisma, SupplierPaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

export type RegisterSupplierPaymentInput = {
  supplierId: string;
  payableId?: string | null;
  amountCents: number;
  date: Date;
  method: SupplierPaymentMethod;
  cashBoxId?: string | null;
  creditCardId?: string | null;
  installments?: number;
  notes?: string | null;
  createdByEmployeeId: string;
};

async function getLocalCashBalanceCents(tx: Prisma.TransactionClient, localCashBoxId: string) {
  const grouped = await tx.localCashMovement.groupBy({
    by: ["type"],
    where: { localCashBoxId },
    _sum: { amountCents: true },
  });
  const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
  const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
  return inSum - outSum;
}

function nextStatus(totalAmountCents: number, paidAmountCents: number) {
  if (paidAmountCents <= 0) return "PENDING" as const;
  if (paidAmountCents >= totalAmountCents) return "PAID" as const;
  return "PARTIAL" as const;
}

function addMonths(date: Date, months: number) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return d;
}

export type ListSuppliersFilters = {
  search?: string;
  estado?: "CON_DEUDA" | "SIN_DEUDA" | "TODOS";
  categoria?: string;
  from?: Date;
  to?: Date;
};

export class SupplierPayableService {
  static async listSuppliersWithDebt(filters?: ListSuppliersFilters) {
    const estado = filters?.estado ?? "TODOS";

    const grouped = await prisma.supplierPayable.groupBy({
      by: ["supplierId"],
      where: {
        status: { not: "PAID" },
        ...(filters?.from || filters?.to
          ? { createdAt: { gte: filters?.from, lte: filters?.to } }
          : {}),
      },
      _sum: { totalAmountCents: true, paidAmountCents: true },
    });
    const debtBySupplierId = new Map(
      grouped.map((g) => [g.supplierId, (g._sum.totalAmountCents ?? 0) - (g._sum.paidAmountCents ?? 0)])
    );

    const suppliers = await prisma.supplier.findMany({
      where: {
        active: true,
        ...(filters?.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
        ...(filters?.categoria ? { categoria: filters.categoria } : {}),
      },
      select: { id: true, name: true, active: true, categoria: true },
      orderBy: { name: "asc" },
    });

    let result = suppliers.map((s) => ({
      supplierId: s.id,
      supplierName: s.name,
      active: s.active,
      categoria: s.categoria,
      debtCents: debtBySupplierId.get(s.id) ?? 0,
    }));

    if (estado === "CON_DEUDA") result = result.filter((s) => s.debtCents > 0);
    if (estado === "SIN_DEUDA") result = result.filter((s) => s.debtCents <= 0);

    return result.sort((a, b) => b.debtCents - a.debtCents);
  }

  static async getSupplierDetail(supplierId: string) {
    const [supplier, payables, payments] = await Promise.all([
      prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      prisma.supplierPayable.findMany({
        where: { supplierId },
        include: { sourcePurchase: { select: { id: true, invoiceNumber: true, purchasedAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supplierPayment.findMany({
        where: { supplierId },
        include: {
          cashBox: { select: { id: true, name: true } },
          creditCard: { select: { id: true, name: true } },
          createdByEmployee: { select: { id: true, displayName: true } },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    const debtCents = payables.reduce(
      (sum, p) => sum + (p.status === "PAID" ? 0 : p.totalAmountCents - p.paidAmountCents),
      0
    );

    return { supplier, payables, payments, debtCents };
  }

  static async createPayable(params: {
    supplierId: string;
    sourcePurchaseId?: string | null;
    description?: string | null;
    totalAmountCents: number;
    dueDate?: Date | null;
  }) {
    assertIntCents(params.totalAmountCents, "totalAmountCents");
    if (params.totalAmountCents <= 0) throw new Error("El monto debe ser mayor a cero.");

    return prisma.supplierPayable.create({
      data: {
        supplierId: params.supplierId,
        sourcePurchaseId: params.sourcePurchaseId ?? null,
        description: params.description ?? null,
        totalAmountCents: params.totalAmountCents,
        dueDate: params.dueDate ?? null,
      },
    });
  }

  static async registerPayment(input: RegisterSupplierPaymentInput) {
    assertIntCents(input.amountCents, "amountCents");
    if (input.amountCents <= 0) throw new Error("El monto a pagar debe ser mayor a cero.");

    if (input.method === "TARJETA_CREDITO" && !input.creditCardId) {
      throw new Error("Elegí una tarjeta de crédito.");
    }
    if ((input.method === "EFECTIVO_CAJA" || input.method === "TRANSFERENCIA") && !input.cashBoxId) {
      throw new Error("Elegí una caja o cuenta.");
    }

    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || !supplier.active) throw new Error("Proveedor no encontrado o inactivo.");

      let payable = input.payableId
        ? await tx.supplierPayable.findUnique({ where: { id: input.payableId } })
        : await tx.supplierPayable.findFirst({
            where: { supplierId: input.supplierId, status: { not: "PAID" } },
            orderBy: { createdAt: "asc" },
          });

      if (payable && payable.supplierId !== input.supplierId) {
        throw new Error("La deuda elegida no pertenece a este proveedor.");
      }
      if (payable) {
        const remaining = payable.totalAmountCents - payable.paidAmountCents;
        if (input.amountCents > remaining) {
          throw new Error("El monto a pagar supera la deuda pendiente.");
        }
      }

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: input.supplierId,
          payableId: payable?.id ?? null,
          amountCents: input.amountCents,
          date: input.date,
          method: input.method,
          cashBoxId: input.cashBoxId ?? null,
          creditCardId: input.creditCardId ?? null,
          installments: input.method === "TARJETA_CREDITO" ? (input.installments ?? 1) : null,
          notes: input.notes ?? null,
          createdByEmployeeId: input.createdByEmployeeId,
        },
      });

      if (input.method === "EFECTIVO_CAJA" || input.method === "TRANSFERENCIA") {
        const cashBoxId = input.cashBoxId!;
        const balance = await getLocalCashBalanceCents(tx, cashBoxId);
        if (balance < input.amountCents) {
          throw new Error("Saldo insuficiente en la caja/cuenta elegida.");
        }
        await tx.localCashMovement.create({
          data: {
            localCashBoxId: cashBoxId,
            type: "OUT",
            sourceType: "SUPPLIER_PAYMENT",
            relatedSupplierPaymentId: payment.id,
            amountCents: input.amountCents,
            date: input.date,
            description: `Pago a ${supplier.name}${input.notes ? ` — ${input.notes}` : ""}`,
            createdByEmployeeId: input.createdByEmployeeId,
          },
        });
      }

      if (input.method === "TARJETA_CREDITO") {
        const card = await tx.creditCard.findUnique({ where: { id: input.creditCardId! } });
        if (!card || !card.active) throw new Error("Tarjeta no encontrada o inactiva.");

        const installments = Math.max(1, input.installments ?? 1);
        const basePeriod =
          input.date.getUTCDate() >= card.closingDay
            ? addMonths(input.date, 1)
            : addMonths(input.date, 0);

        const baseAmount = Math.floor(input.amountCents / installments);
        const remainder = input.amountCents - baseAmount * installments;

        for (let i = 0; i < installments; i++) {
          await tx.creditCardCharge.create({
            data: {
              creditCardId: card.id,
              supplierPaymentId: payment.id,
              description: `Pago a ${supplier.name}${installments > 1 ? ` (cuota ${i + 1}/${installments})` : ""}`,
              statementPeriod: addMonths(basePeriod, i),
              installmentNumber: i + 1,
              totalInstallments: installments,
              amountCents: i === installments - 1 ? baseAmount + remainder : baseAmount,
            },
          });
        }
      }

      if (payable) {
        const newPaidAmountCents = payable.paidAmountCents + input.amountCents;
        await tx.supplierPayable.update({
          where: { id: payable.id },
          data: {
            paidAmountCents: newPaidAmountCents,
            status: nextStatus(payable.totalAmountCents, newPaidAmountCents),
          },
        });
      }

      return payment;
    });
  }
}
