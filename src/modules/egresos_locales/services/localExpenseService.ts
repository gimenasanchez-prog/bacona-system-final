import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";

export type CreateLocalExpenseInput = {
  cashSessionId: string;
  date: Date;
  category:
    | "APROVISIONAMIENTO_COMIDA_LOCAL"
    | "APROVISIONAMIENTO_BEBIDAS_LOCAL"
    | "GAS"
    | "MANTENIMIENTO"
    | "OTRO";
  supplierId: string;
  description?: string | null;
  amountCents: number;
  paymentSource: "SHIFT_CASH" | "LOCAL_CASH";
  affectsStock: boolean;
  createdByEmployeeId: string;
  stockLink?: { inventoryItemId: string; qty: Prisma.Decimal } | null;
};

function assertPositiveIntCents(value: number) {
  if (!Number.isInteger(value) || value <= 0) throw new Error("amountCents must be a positive integer");
}

async function getDefaultLocalCashBoxId(tx: Prisma.TransactionClient) {
  const box = await tx.localCashBox.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!box) throw new Error("No existe Caja BCN activa");
  return box.id;
}

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

export class LocalExpenseService {
  static async createLocalExpense(input: CreateLocalExpenseInput) {
    assertPositiveIntCents(input.amountCents);

    return prisma.$transaction(async (tx) => {
      const cashSession = await tx.cashSession.findUnique({
        where: { id: input.cashSessionId },
        select: { id: true, status: true },
      });
      if (!cashSession) throw new Error("Cash session not found");
      if (cashSession.status !== "OPEN") throw new Error("No se puede registrar egresos en una caja cerrada");

      const supplier = await tx.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true, name: true, active: true },
      });
      if (!supplier || !supplier.active) throw new Error("Proveedor no encontrado o inactivo");

      const expense = await tx.localExpense.create({
        data: {
          cashSessionId: input.cashSessionId,
          date: input.date,
          category: input.category,
          supplierId: input.supplierId,
          supplierNameSnapshot: supplier.name,
          description: input.description ?? null,
          amountCents: input.amountCents,
          paymentSource: input.paymentSource,
          affectsStock: input.affectsStock,
          createdByEmployeeId: input.createdByEmployeeId,
        },
      });

      if (input.paymentSource === "LOCAL_CASH") {
        const localCashBoxId = await getDefaultLocalCashBoxId(tx);
        const balance = await getLocalCashBalanceCents(tx, localCashBoxId);
        if (balance < input.amountCents) {
          throw new Error("Saldo insuficiente en Caja BCN. Abrí un sobre antes o registrá el egreso con efectivo del turno.");
        }

        await tx.localCashMovement.create({
          data: {
            localCashBoxId,
            type: "OUT",
            sourceType: "LOCAL_EXPENSE",
            relatedLocalExpenseId: expense.id,
            amountCents: input.amountCents,
            date: input.date,
            description: input.description ?? null,
            createdByEmployeeId: input.createdByEmployeeId,
          },
        });
      }

      if (input.affectsStock && input.stockLink) {
        const { bacona } = await StockDefaultsService.ensureDefaultLocations(tx);
        await tx.stockMovement.create({
          data: {
            type: "PURCHASE",
            occurredAt: input.date,
            notes: `LocalExpense ${expense.id}`,
            localExpenseId: expense.id,
            createdByEmployeeId: input.createdByEmployeeId,
            lines: {
              create: [
                {
                  inventoryItemId: input.stockLink.inventoryItemId,
                  locationId: bacona.id,
                  direction: "IN",
                  qty: input.stockLink.qty,
                  sortOrder: 0,
                },
              ],
            },
          },
        });
      }

      return expense;
    });
  }

  static async listByCashSession(cashSessionId: string) {
    return prisma.localExpense.findMany({
      where: { cashSessionId },
      include: { supplier: true },
      orderBy: { date: "desc" },
    });
  }

  static async listShiftCashExpensesInRange(params: { from: Date; to: Date }) {
    return prisma.localExpense.findMany({
      where: {
        paymentSource: "SHIFT_CASH",
        date: { gte: params.from, lte: params.to },
      },
      include: {
        createdByEmployee: { select: { displayName: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  }
}

