import { CashBoxKind, PosPaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addBusinessDays } from "@/lib/businessDays";

export type PaymentMethodConfigInput = {
  method: PosPaymentMethod;
  enabled: boolean;
  settlementBusinessDays: number;
  withholdingPercent: number | null;
  feesPercent: number | null;
  iibbPercent: number | null;
  taxDebCredPercent: number | null;
};

type DeductionConfig = {
  withholdingPercent: unknown;
  feesPercent: unknown;
  iibbPercent: unknown;
  taxDebCredPercent: unknown;
};

function computeSaleDeductions(amountCents: number, config: DeductionConfig) {
  const withholdingPercent = config.withholdingPercent ? Number(config.withholdingPercent) : 0;
  const feesPercent = config.feesPercent ? Number(config.feesPercent) : 0;
  const iibbPercent = config.iibbPercent ? Number(config.iibbPercent) : 0;
  const taxDebCredPercent = config.taxDebCredPercent ? Number(config.taxDebCredPercent) : 0;

  const withholdingCents = Math.round((amountCents * withholdingPercent) / 100);
  const feesCents = Math.round((amountCents * feesPercent) / 100);
  const netAfterProcessorCents = amountCents - withholdingCents - feesCents;
  const iibbCents = Math.round((netAfterProcessorCents * iibbPercent) / 100);
  const taxDebCredCents = Math.round((netAfterProcessorCents * taxDebCredPercent) / 100);
  const netCents = netAfterProcessorCents - iibbCents - taxDebCredCents;

  return { withholdingCents, feesCents, netAfterProcessorCents, iibbCents, taxDebCredCents, netCents };
}

export class LocalCashBoxService {
  static async listBoxesByKind(kind: CashBoxKind) {
    return prisma.localCashBox.findMany({
      where: { kind, active: true },
      orderBy: { name: "asc" },
    });
  }

  static async getPaymentMethodConfigs(cashBoxId: string) {
    return prisma.cashBoxPaymentMethodConfig.findMany({ where: { cashBoxId } });
  }

  static async setPaymentMethodConfigs(cashBoxId: string, configs: PaymentMethodConfigInput[]) {
    return prisma.$transaction(async (tx) => {
      for (const c of configs) {
        if (!c.enabled) {
          await tx.cashBoxPaymentMethodConfig.deleteMany({ where: { cashBoxId, method: c.method } });
          continue;
        }
        if (c.settlementBusinessDays < 0) throw new Error("Los días hábiles no pueden ser negativos.");
        await tx.cashBoxPaymentMethodConfig.upsert({
          where: { cashBoxId_method: { cashBoxId, method: c.method } },
          create: {
            cashBoxId,
            method: c.method,
            settlementBusinessDays: c.settlementBusinessDays,
            withholdingPercent: c.withholdingPercent,
            feesPercent: c.feesPercent,
            iibbPercent: c.iibbPercent,
            taxDebCredPercent: c.taxDebCredPercent,
          },
          update: {
            settlementBusinessDays: c.settlementBusinessDays,
            withholdingPercent: c.withholdingPercent,
            feesPercent: c.feesPercent,
            iibbPercent: c.iibbPercent,
            taxDebCredPercent: c.taxDebCredPercent,
          },
        });
      }
      return tx.cashBoxPaymentMethodConfig.findMany({ where: { cashBoxId } });
    });
  }

  static async setReconciliationStartDate(cashBoxId: string, date: Date | null) {
    return prisma.localCashBox.update({ where: { id: cashBoxId }, data: { reconciliationStartDate: date } });
  }

  static async createBankAccount(name: string) {
    if (!name.trim()) throw new Error("El nombre es obligatorio.");
    return prisma.localCashBox.create({
      data: { name, kind: "CUENTA_BANCARIA", active: true },
    });
  }

  static async updateBankAccount(cashBoxId: string, params: Partial<{ name: string; active: boolean }>) {
    return prisma.localCashBox.update({ where: { id: cashBoxId }, data: params });
  }

  static async getActiveLocalCashBox() {
    const box = await prisma.localCashBox.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!box) throw new Error("No existe Caja BCN activa");
    return box;
  }

  static async getCajaByName(name: string) {
    const box = await prisma.localCashBox.findFirst({ where: { name, active: true } });
    if (!box) throw new Error(`No existe caja activa con nombre "${name}"`);
    return box;
  }

  static async transferBalance(params: {
    fromBoxId: string;
    toBoxId: string;
    amountCents: number;
    employeeId: string;
    fromDescription: string;
    toDescription: string;
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new Error("El monto a transferir debe ser mayor a cero.");
    }
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.fromBoxId,
          type: "OUT",
          sourceType: "MANUAL_ADJUSTMENT",
          amountCents: params.amountCents,
          date: now,
          description: params.fromDescription,
          createdByEmployeeId: params.employeeId,
        },
      });
      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.toBoxId,
          type: "IN",
          sourceType: "MANUAL_ADJUSTMENT",
          amountCents: params.amountCents,
          date: now,
          description: params.toDescription,
          createdByEmployeeId: params.employeeId,
        },
      });
    });
  }

  static async getLocalCashBalance(localCashBoxId: string) {
    const grouped = await prisma.localCashMovement.groupBy({
      by: ["type"],
      where: { localCashBoxId },
      _sum: { amountCents: true },
    });
    const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
    const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
    return inSum - outSum;
  }

  static async listMovements(localCashBoxId: string, params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const [pageMovements, total, allForBalance] = await prisma.$transaction([
      prisma.localCashMovement.findMany({
        where: { localCashBoxId },
        include: {
          relatedEnvelope: true,
          relatedLocalExpense: {
            select: { id: true, supplierNameSnapshot: true, description: true },
          },
          relatedPosPayment: { select: { createdAt: true } },
          createdByEmployee: { select: { id: true, displayName: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.localCashMovement.count({ where: { localCashBoxId } }),
      prisma.localCashMovement.findMany({
        where: { localCashBoxId },
        select: { id: true, type: true, amountCents: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    let running = 0;
    const balanceById = new Map<string, number>();
    for (const m of allForBalance) {
      running += m.type === "IN" ? m.amountCents : -m.amountCents;
      balanceById.set(m.id, running);
    }

    const movements = pageMovements.map((m) => ({
      ...m,
      balanceAfterCents: balanceById.get(m.id) ?? 0,
    }));

    return { movements, total };
  }

  static async listCashOutMovementsInRange(params: { from: Date; to: Date }) {
    return prisma.localCashMovement.findMany({
      where: {
        type: "OUT",
        localCashBox: { kind: "EFECTIVO" },
        date: { gte: params.from, lte: params.to },
      },
      include: {
        localCashBox: { select: { name: true } },
        createdByEmployee: { select: { displayName: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  }

  static async getEnvelopeCashSummary() {
    const grouped = await prisma.envelope.groupBy({
      by: ["status"],
      where: { status: { in: ["CLOSED", "OPENED"] } },
      _sum: { expectedAmountCents: true },
    });
    const closedCents =
      grouped.find((g) => g.status === "CLOSED")?._sum.expectedAmountCents ?? 0;
    const openedPendingCents =
      grouped.find((g) => g.status === "OPENED")?._sum.expectedAmountCents ?? 0;
    return { closedCents, openedPendingCents };
  }

  static async openAndControlEnvelopeBatch(
    items: { envelopeId: string; actualAmountCents: number }[],
    localCashBoxId: string,
    employeeId: string
  ) {
    if (!items.length) throw new Error("No hay sobres para procesar.");
    for (const item of items) {
      if (!Number.isInteger(item.actualAmountCents) || item.actualAmountCents < 0) {
        throw new Error("Todos los montos deben ser números enteros no negativos.");
      }
    }

    return prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const item of items) {
        const env = await tx.envelope.findUnique({
          where: { id: item.envelopeId },
          select: { id: true, status: true, envelopeCode: true, expectedAmountCents: true },
        });
        if (!env || env.status !== "CLOSED") continue;

        const finalStatus =
          item.actualAmountCents === env.expectedAmountCents ? "CONTROLLED" : "NOT_CONTROLLED";

        await tx.envelope.update({
          where: { id: item.envelopeId },
          data: {
            status: finalStatus,
            openedAt: now,
            openedByEmployeeId: employeeId,
            controlledAt: now,
            controlledByEmployeeId: employeeId,
            actualAmountCents: item.actualAmountCents,
          },
        });

        await tx.localCashMovement.create({
          data: {
            localCashBoxId,
            type: "IN",
            sourceType: "ENVELOPE_OPENING",
            relatedEnvelopeId: item.envelopeId,
            amountCents: item.actualAmountCents,
            date: now,
            description: `Apertura sobre ${env.envelopeCode}`,
            createdByEmployeeId: employeeId,
          },
        });
      }
    });
  }

  static async listAvailableEnvelopes() {
    return prisma.envelope.findMany({
      where: { status: "CLOSED" },
      include: { cashSession: { include: { employee: true } } },
      orderBy: { depositedAt: "desc" },
      take: 200,
    });
  }

  static async listOpenedEnvelopes() {
    return prisma.envelope.findMany({
      where: { status: "OPENED" },
      include: {
        cashSession: { include: { employee: true } },
        openedByEmployee: { select: { id: true, displayName: true } },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  static async openAndControlEnvelope(params: {
    envelopeId: string;
    localCashBoxId: string;
    actualAmountCents: number;
    notes: string | null;
    employeeId: string;
  }) {
    if (!Number.isInteger(params.actualAmountCents) || params.actualAmountCents < 0) {
      throw new Error("El monto debe ser un número entero no negativo.");
    }

    return prisma.$transaction(async (tx) => {
      const env = await tx.envelope.findUnique({
        where: { id: params.envelopeId },
        select: { id: true, status: true, envelopeCode: true, expectedAmountCents: true },
      });
      if (!env) throw new Error("Sobre no encontrado.");
      if (env.status !== "CLOSED") throw new Error("El sobre no está disponible para abrir.");

      const finalStatus =
        params.actualAmountCents === env.expectedAmountCents ? "CONTROLLED" : "NOT_CONTROLLED";
      const now = new Date();

      await tx.envelope.update({
        where: { id: params.envelopeId },
        data: {
          status: finalStatus,
          openedAt: now,
          openedByEmployeeId: params.employeeId,
          controlledAt: now,
          controlledByEmployeeId: params.employeeId,
          actualAmountCents: params.actualAmountCents,
          notes: params.notes,
        },
      });

      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.localCashBoxId,
          type: "IN",
          sourceType: "ENVELOPE_OPENING",
          relatedEnvelopeId: params.envelopeId,
          amountCents: params.actualAmountCents,
          date: now,
          description: `Apertura sobre ${env.envelopeCode}`,
          createdByEmployeeId: params.employeeId,
        },
      });
    });
  }

  static async controlOpenedEnvelope(params: {
    envelopeId: string;
    actualAmountCents: number;
    notes: string | null;
    employeeId: string;
  }) {
    if (!Number.isInteger(params.actualAmountCents) || params.actualAmountCents < 0) {
      throw new Error("El monto debe ser un número entero no negativo.");
    }

    return prisma.$transaction(async (tx) => {
      const env = await tx.envelope.findUnique({
        where: { id: params.envelopeId },
        select: { id: true, status: true, expectedAmountCents: true },
      });
      if (!env) throw new Error("Sobre no encontrado.");
      if (env.status !== "OPENED") throw new Error("Solo se pueden controlar sobres en estado ABIERTO.");

      const finalStatus =
        params.actualAmountCents === env.expectedAmountCents ? "CONTROLLED" : "NOT_CONTROLLED";

      await tx.envelope.update({
        where: { id: params.envelopeId },
        data: {
          status: finalStatus,
          controlledAt: new Date(),
          controlledByEmployeeId: params.employeeId,
          actualAmountCents: params.actualAmountCents,
          notes: params.notes,
        },
      });
    });
  }

  static async transferEnvelopeToLocalCash(params: {
    envelopeId: string;
    localCashBoxId: string;
    amountCents: number;
    openedByEmployeeId: string;
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }

    return prisma.$transaction(async (tx) => {
      const env = await tx.envelope.findUnique({
        where: { id: params.envelopeId },
        select: { id: true, status: true, envelopeCode: true },
      });
      if (!env) throw new Error("Envelope not found");
      if (env.status !== "CLOSED") throw new Error("El sobre no está disponible para abrir");

      await tx.envelope.update({
        where: { id: params.envelopeId },
        data: {
          status: "OPENED",
          openedAt: new Date(),
          openedByEmployeeId: params.openedByEmployeeId,
        },
      });

      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.localCashBoxId,
          type: "IN",
          sourceType: "ENVELOPE_OPENING",
          relatedEnvelopeId: params.envelopeId,
          amountCents: params.amountCents,
          date: new Date(),
          description: `Apertura sobre ${env.envelopeCode}`,
          createdByEmployeeId: params.openedByEmployeeId,
        },
      });
    });
  }

  static async createManualMovement(params: {
    localCashBoxId: string;
    type: "IN" | "OUT";
    amountCents: number;
    date: Date;
    description?: string | null;
    createdByEmployeeId: string;
    sourceType?: "MANUAL_ADJUSTMENT" | "RETIRO_GERENCIA";
  }) {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }

    if (params.type === "OUT") {
      const balance = await this.getLocalCashBalance(params.localCashBoxId);
      if (balance < params.amountCents) throw new Error("Saldo insuficiente en Caja BCN");
    }

    await prisma.localCashMovement.create({
      data: {
        localCashBoxId: params.localCashBoxId,
        type: params.type,
        sourceType: params.sourceType ?? "MANUAL_ADJUSTMENT",
        amountCents: params.amountCents,
        date: params.date,
        description: params.description ?? null,
        createdByEmployeeId: params.createdByEmployeeId,
      },
    });
  }

  static async setOpeningBalance(params: {
    cashBoxId: string;
    targetBalanceCents: number;
    date: Date;
    createdByEmployeeId: string;
  }) {
    if (!Number.isInteger(params.targetBalanceCents)) {
      throw new Error("El saldo debe ser un número entero de centavos.");
    }
    const currentBalance = await this.getLocalCashBalance(params.cashBoxId);
    const deltaCents = params.targetBalanceCents - currentBalance;
    if (deltaCents === 0) return;

    await prisma.localCashMovement.create({
      data: {
        localCashBoxId: params.cashBoxId,
        type: deltaCents > 0 ? "IN" : "OUT",
        sourceType: "OPENING_BALANCE",
        amountCents: Math.abs(deltaCents),
        date: params.date,
        description: "Saldo inicial",
        createdByEmployeeId: params.createdByEmployeeId,
      },
    });
  }

  private static async getDuePosPayments(cashBoxId: string, referenceDate: Date) {
    const [box, allConfigs] = await Promise.all([
      prisma.localCashBox.findUnique({ where: { id: cashBoxId }, select: { reconciliationStartDate: true } }),
      prisma.cashBoxPaymentMethodConfig.findMany({ where: { cashBoxId } }),
    ]);
    // CHEQUE tiene su propio ciclo de vida (En cartera → Depositado → Acreditado, ver
    // módulo de Cheques) que arranca desde la fecha de depósito, no desde la venta —
    // por eso se excluye de la pantalla genérica de conciliación, aunque tenga config
    // propia (esa config la usa igual `reconcileSales` cuando se acredita un cheque).
    const configs = allConfigs.filter((c) => c.method !== "CHEQUE");
    if (!configs.length) return [];

    const configByMethod = new Map(configs.map((c) => [c.method, c]));
    const payments = await prisma.posPayment.findMany({
      where: {
        method: { in: configs.map((c) => c.method) },
        sale: { status: { not: "CANCELLED" } },
        createdAt: box?.reconciliationStartDate ? { gte: box.reconciliationStartDate } : undefined,
      },
      include: {
        sale: { select: { comandaNumber: true, tableId: true, customerNameFreeText: true } },
        reconciliationMovement: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return payments
      .map((p) => {
        const config = configByMethod.get(p.method)!;
        return { ...p, config, expectedCreditDate: addBusinessDays(p.createdAt, config.settlementBusinessDays) };
      })
      .filter((p) => p.expectedCreditDate <= referenceDate);
  }

  static async getReconciliationSummary(cashBoxId: string, referenceDate: Date = new Date()) {
    const due = await this.getDuePosPayments(cashBoxId, referenceDate);

    const byMethodMap = new Map<PosPaymentMethod, number>();
    for (const p of due) {
      byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + p.amountCents);
    }
    const byMethod = Array.from(byMethodMap.entries()).map(([method, expectedCents]) => ({ method, expectedCents }));
    const totalExpectedCents = due.reduce((sum, p) => sum + p.amountCents, 0);
    const totalReconciledCents = due
      .filter((p) => p.reconciliationMovement)
      .reduce((sum, p) => sum + p.amountCents, 0);

    return {
      byMethod,
      totalExpectedCents,
      totalReconciledCents,
      pendingCents: totalExpectedCents - totalReconciledCents,
    };
  }

  static async getPendingSalesForReconciliation(cashBoxId: string, referenceDate: Date = new Date()) {
    const due = await this.getDuePosPayments(cashBoxId, referenceDate);
    return due
      .filter((p) => !p.reconciliationMovement)
      .map((p) => ({
        id: p.id,
        method: p.method,
        amountCents: p.amountCents,
        createdAt: p.createdAt,
        expectedCreditDate: p.expectedCreditDate,
        overdueDays: Math.floor((referenceDate.getTime() - p.expectedCreditDate.getTime()) / 86400000),
        deductions: computeSaleDeductions(p.amountCents, p.config),
        sale: p.sale,
      }));
  }

  static async reconcileSales(params: {
    cashBoxId: string;
    posPaymentIds: string[];
    date: Date;
    createdByEmployeeId: string;
  }) {
    if (!params.posPaymentIds.length) throw new Error("Elegí al menos una venta para conciliar.");

    return prisma.$transaction(async (tx) => {
      const payments = await tx.posPayment.findMany({
        where: { id: { in: params.posPaymentIds } },
        include: { reconciliationMovement: { select: { id: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (payments.length !== params.posPaymentIds.length) {
        throw new Error("Alguna de las ventas seleccionadas no existe.");
      }
      if (payments.some((p) => p.reconciliationMovement)) {
        throw new Error("Una de las ventas seleccionadas ya fue conciliada.");
      }

      const configs = await tx.cashBoxPaymentMethodConfig.findMany({
        where: { cashBoxId: params.cashBoxId, method: { in: payments.map((p) => p.method) } },
      });
      const configByMethod = new Map(configs.map((c) => [c.method, c]));

      for (const p of payments) {
        const config = configByMethod.get(p.method);
        if (!config) throw new Error(`No hay configuración de conciliación para el método ${p.method}.`);
        const d = computeSaleDeductions(p.amountCents, config);
        if (d.netCents < 0) throw new Error("Los descuentos configurados superan el monto de una de las ventas.");

        await tx.localCashMovement.create({
          data: {
            localCashBoxId: params.cashBoxId,
            type: "IN",
            sourceType: "SALES_DEPOSIT",
            relatedPosPaymentId: p.id,
            grossAmountCents: p.amountCents,
            bankWithholdingCents: d.withholdingCents,
            bankFeesCents: d.feesCents,
            iibbCents: d.iibbCents,
            taxDebCredCents: d.taxDebCredCents,
            amountCents: d.netCents,
            date: params.date,
            description: `Conciliación venta ${p.method}`,
            createdByEmployeeId: params.createdByEmployeeId,
          },
        });
      }
    });
  }
}

