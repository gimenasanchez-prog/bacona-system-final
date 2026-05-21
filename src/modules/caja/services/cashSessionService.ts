import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CashSessionSummary = {
  cashSession: {
    id: string;
    businessDate: Date;
    shift: "MANIANA" | "TARDE" | "NOCHE";
    status: "OPEN" | "CLOSED";
    openedAt: Date;
    closedAt: Date | null;
    employee: { id: string; displayName: string };
  };
  totals: {
    EFECTIVO: number;
    DEBITO: number;
    CREDITO: number;
    TRANSFERENCIA: number;
    QR: number;
    CUENTA_CORRIENTE: number;
    CUENTAS_INTERNAS: number;
    totalIncomeCents: number;
    totalShiftCashExpensesCents: number;
    totalLocalCashExpensesCents: number;
    totalExpensesCents: number;
    totalNetCents: number;
    expectedEnvelopeAmountCents: number;
  };
  breakdownDetails: {
    cuentaCorriente: Array<{ referenceId: string; referenceName: string; amountCents: number }>;
    cuentasInternas: Array<{ referenceId: string; referenceName: string; amountCents: number }>;
  };
  stock: {
    linesIn: number;
    linesOut: number;
    byItem: Array<{
      inventoryItemId: string;
      inventoryItemName: string;
      unit: string;
      direction: "IN" | "OUT";
      locationCode: string;
      qty: string;
    }>;
  };
};

function normalizeBusinessDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function centsSum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

export class CashSessionService {
  static async openCashSession(params: {
    employeeId: string;
    shift: "MANIANA" | "TARDE" | "NOCHE";
    businessDate?: Date;
  }) {
    const businessDate = normalizeBusinessDate(params.businessDate ?? new Date());
    const openKey = `${params.employeeId}:${params.shift}:${businessDate.toISOString().slice(0, 10)}`;

    const employee = await prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { id: true, isActive: true },
    });
    if (!employee || !employee.isActive) throw new Error("Employee not found or inactive");

    const existing = await prisma.cashSession.findFirst({
      where: { openKey, status: "OPEN" },
    });
    if (existing) return existing; // retomar sesión existente en lugar de bloquear

    return prisma.cashSession.create({
      data: {
        businessDate,
        shift: params.shift,
        employeeId: params.employeeId,
        status: "OPEN",
        openedAt: new Date(),
        openKey,
      },
    });
  }

  static async getCashSessionSummary(cashSessionId: string): Promise<CashSessionSummary> {
    const cashSession = await prisma.cashSession.findUnique({
      where: { id: cashSessionId },
      include: { employee: { select: { id: true, displayName: true } } },
    });
    if (!cashSession) throw new Error("Cash session not found");

    const payments = await prisma.posPayment.findMany({
      where: { sale: { cashSessionId } },
      include: {
        cuentaCorrienteAccount: { include: { customer: true } },
        employee: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalsByMethod: Record<string, number> = {
      EFECTIVO: 0,
      DEBITO: 0,
      CREDITO: 0,
      TRANSFERENCIA: 0,
      QR: 0,
      CUENTA_CORRIENTE: 0,
      CUENTAS_INTERNAS: 0,
    };
    for (const p of payments) {
      totalsByMethod[p.method] = (totalsByMethod[p.method] ?? 0) + p.amountCents;
    }

    const totalIncomeCents = centsSum(Object.values(totalsByMethod));

    const shiftCashExpensesAgg = await prisma.localExpense.aggregate({
      where: { cashSessionId, paymentSource: "SHIFT_CASH" },
      _sum: { amountCents: true },
    });
    const totalShiftCashExpensesCents = shiftCashExpensesAgg._sum.amountCents ?? 0;

    const localCashExpensesAgg = await prisma.localExpense.aggregate({
      where: { cashSessionId, paymentSource: "LOCAL_CASH" },
      _sum: { amountCents: true },
    });
    const totalLocalCashExpensesCents = localCashExpensesAgg._sum.amountCents ?? 0;

    const totalExpensesCents = totalShiftCashExpensesCents + totalLocalCashExpensesCents;
    const expectedEnvelopeAmountCents = totalsByMethod.EFECTIVO - totalShiftCashExpensesCents;
    const totalNetCents = totalIncomeCents - totalExpensesCents;

    const ccMap = new Map<string, { referenceId: string; referenceName: string; amountCents: number }>();
    const internalMap = new Map<
      string,
      { referenceId: string; referenceName: string; amountCents: number }
    >();
    for (const p of payments) {
      if (p.method === "CUENTA_CORRIENTE" && p.cuentaCorrienteAccount?.id) {
        const refId = p.cuentaCorrienteAccount.id;
        const refName = p.cuentaCorrienteAccount.customer?.displayName ?? "Cuenta corriente";
        const prev = ccMap.get(refId) ?? { referenceId: refId, referenceName: refName, amountCents: 0 };
        prev.amountCents += p.amountCents;
        ccMap.set(refId, prev);
      }
      if (p.method === "CUENTAS_INTERNAS" && p.employee?.id) {
        const refId = p.employee.id;
        const refName = p.employee.displayName ?? "Cuentas internas";
        const prev =
          internalMap.get(refId) ?? { referenceId: refId, referenceName: refName, amountCents: 0 };
        prev.amountCents += p.amountCents;
        internalMap.set(refId, prev);
      }
    }

    const stockLines = await prisma.stockMovementLine.findMany({
      where: { movement: { posSale: { cashSessionId } } },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true } },
        location: { select: { code: true } },
      },
    });

    const grouped = new Map<
      string,
      {
        inventoryItemId: string;
        inventoryItemName: string;
        unit: string;
        direction: "IN" | "OUT";
        locationCode: string;
        qty: Prisma.Decimal;
      }
    >();
    for (const line of stockLines) {
      const key = `${line.direction}:${line.inventoryItemId}:${line.locationId}`;
      const prev =
        grouped.get(key) ??
        ({
          inventoryItemId: line.inventoryItem.id,
          inventoryItemName: line.inventoryItem.name,
          unit: line.inventoryItem.unit,
          direction: line.direction,
          locationCode: line.location.code,
          qty: new Prisma.Decimal(0),
        } as const);
      grouped.set(key, { ...prev, qty: prev.qty.plus(line.qty) });
    }

    const byItem = [...grouped.values()]
      .map((g) => ({
        inventoryItemId: g.inventoryItemId,
        inventoryItemName: g.inventoryItemName,
        unit: g.unit,
        direction: g.direction,
        locationCode: g.locationCode,
        qty: g.qty.toFixed(3),
      }))
      .sort((a, b) => a.inventoryItemName.localeCompare(b.inventoryItemName));

    const linesIn = stockLines.filter((l) => l.direction === "IN").length;
    const linesOut = stockLines.filter((l) => l.direction === "OUT").length;

    return {
      cashSession: {
        id: cashSession.id,
        businessDate: cashSession.businessDate,
        shift: cashSession.shift,
        status: cashSession.status,
        openedAt: cashSession.openedAt,
        closedAt: cashSession.closedAt,
        employee: cashSession.employee,
      },
      totals: {
        EFECTIVO: totalsByMethod.EFECTIVO,
        DEBITO: totalsByMethod.DEBITO,
        CREDITO: totalsByMethod.CREDITO,
        TRANSFERENCIA: totalsByMethod.TRANSFERENCIA,
        QR: totalsByMethod.QR,
        CUENTA_CORRIENTE: totalsByMethod.CUENTA_CORRIENTE,
        CUENTAS_INTERNAS: totalsByMethod.CUENTAS_INTERNAS,
        totalIncomeCents,
        totalShiftCashExpensesCents,
        totalLocalCashExpensesCents,
        totalExpensesCents,
        totalNetCents,
        expectedEnvelopeAmountCents,
      },
      breakdownDetails: {
        cuentaCorriente: [...ccMap.values()].sort((a, b) => b.amountCents - a.amountCents),
        cuentasInternas: [...internalMap.values()].sort((a, b) => b.amountCents - a.amountCents),
      },
      stock: {
        linesIn,
        linesOut,
        byItem,
      },
    };
  }

  static async closeCashSession(params: { cashSessionId: string; notes?: string | null }) {
    const summary = await this.getCashSessionSummary(params.cashSessionId);
    if (summary.cashSession.status !== "OPEN") throw new Error("La caja ya está cerrada");

    if (summary.totals.expectedEnvelopeAmountCents > 0) {
      const envelope = await prisma.envelope.findUnique({
        where: { cashSessionId: params.cashSessionId },
        select: { id: true },
      });
      if (!envelope) {
        throw new Error("Generá el sobre antes de cerrar el turno. Hay efectivo pendiente de depositar.");
      }
    }

    const detailsToCreate = [
      ...summary.breakdownDetails.cuentaCorriente.map((d) => ({
        cashSessionId: params.cashSessionId,
        type: "CUENTA_CORRIENTE" as const,
        referenceId: d.referenceId,
        referenceName: d.referenceName,
        amountCents: d.amountCents,
      })),
      ...summary.breakdownDetails.cuentasInternas.map((d) => ({
        cashSessionId: params.cashSessionId,
        type: "CUENTA_INTERNA" as const,
        referenceId: d.referenceId,
        referenceName: d.referenceName,
        amountCents: d.amountCents,
      })),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.cashSessionPaymentBreakdownDetail.deleteMany({
        where: { cashSessionId: params.cashSessionId },
      });

      if (detailsToCreate.length) {
        await tx.cashSessionPaymentBreakdownDetail.createMany({ data: detailsToCreate });
      }

      await tx.cashSession.update({
        where: { id: params.cashSessionId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          openKey: null,
          notes: params.notes ?? null,
          totalCashCents: summary.totals.EFECTIVO,
          totalDebitCents: summary.totals.DEBITO,
          totalCreditCents: summary.totals.CREDITO,
          totalTransferCents: summary.totals.TRANSFERENCIA,
          totalQrCents: summary.totals.QR,
          totalCuentaCorrienteCents: summary.totals.CUENTA_CORRIENTE,
          totalCuentasInternasCents: summary.totals.CUENTAS_INTERNAS,
          totalIncomeCents: summary.totals.totalIncomeCents,
          totalExpensesCents: summary.totals.totalExpensesCents,
          totalNetCents: summary.totals.totalNetCents,
        },
      });
    });

    return summary;
  }
}

