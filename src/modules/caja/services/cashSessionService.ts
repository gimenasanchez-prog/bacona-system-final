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
    CHEQUE: number;
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

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Un turno abierto hace más de esto se considera de otro día (cubre turnos noche que pasan la medianoche). */
export const STALE_SESSION_HOURS = 18;

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

  static async getCashSessionSummary(
    cashSessionId: string,
    client: DbClient = prisma
  ): Promise<CashSessionSummary> {
    const cashSession = await client.cashSession.findUnique({
      where: { id: cashSessionId },
      include: { employee: { select: { id: true, displayName: true } } },
    });
    if (!cashSession) throw new Error("Cash session not found");

    const payments = await client.posPayment.findMany({
      where: { sale: { cashSessionId, status: { not: "CANCELLED" } } },
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
      CHEQUE: 0,
      CUENTA_CORRIENTE: 0,
      CUENTAS_INTERNAS: 0,
    };
    for (const p of payments) {
      totalsByMethod[p.method] = (totalsByMethod[p.method] ?? 0) + p.amountCents;
    }

    const totalIncomeCents = centsSum(Object.values(totalsByMethod));

    const shiftCashExpensesAgg = await client.localExpense.aggregate({
      where: { cashSessionId, paymentSource: "SHIFT_CASH" },
      _sum: { amountCents: true },
    });
    const totalShiftCashExpensesCents = shiftCashExpensesAgg._sum.amountCents ?? 0;

    const localCashExpensesAgg = await client.localExpense.aggregate({
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

    const stockLines = await client.stockMovementLine.findMany({
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
        CHEQUE: totalsByMethod.CHEQUE,
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

  private static async persistSnapshot(
    client: Prisma.TransactionClient,
    cashSessionId: string,
    summary: CashSessionSummary,
    extraData: Prisma.CashSessionUpdateInput = {}
  ) {
    const detailsToCreate = [
      ...summary.breakdownDetails.cuentaCorriente.map((d) => ({
        cashSessionId,
        type: "CUENTA_CORRIENTE" as const,
        referenceId: d.referenceId,
        referenceName: d.referenceName,
        amountCents: d.amountCents,
      })),
      ...summary.breakdownDetails.cuentasInternas.map((d) => ({
        cashSessionId,
        type: "CUENTA_INTERNA" as const,
        referenceId: d.referenceId,
        referenceName: d.referenceName,
        amountCents: d.amountCents,
      })),
    ];

    await client.cashSessionPaymentBreakdownDetail.deleteMany({ where: { cashSessionId } });

    if (detailsToCreate.length) {
      await client.cashSessionPaymentBreakdownDetail.createMany({ data: detailsToCreate });
    }

    await client.cashSession.update({
      where: { id: cashSessionId },
      data: {
        totalCashCents: summary.totals.EFECTIVO,
        totalDebitCents: summary.totals.DEBITO,
        totalCreditCents: summary.totals.CREDITO,
        totalTransferCents: summary.totals.TRANSFERENCIA,
        totalQrCents: summary.totals.QR,
        totalChequeCents: summary.totals.CHEQUE,
        totalCuentaCorrienteCents: summary.totals.CUENTA_CORRIENTE,
        totalCuentasInternasCents: summary.totals.CUENTAS_INTERNAS,
        totalIncomeCents: summary.totals.totalIncomeCents,
        totalExpensesCents: summary.totals.totalExpensesCents,
        totalNetCents: summary.totals.totalNetCents,
        ...extraData,
      },
    });
  }

  /**
   * @param autoTransferOpenTables  cierres automáticos o de gerencia: las mesas abiertas sin cobros
   *   pasan solas al turno siguiente en vez de bloquear el cierre.
   */
  static async closeCashSession(params: {
    cashSessionId: string;
    notes?: string | null;
    autoTransferOpenTables?: boolean;
  }) {
    const summary = await this.getCashSessionSummary(params.cashSessionId);
    if (summary.cashSession.status !== "OPEN") throw new Error("La caja ya está cerrada");

    const openTables = await this.listOpenTableSales(params.cashSessionId);
    if (openTables.length) {
      if (!params.autoTransferOpenTables) {
        throw new Error(
          `Tenés ${openTables.length} mesa${openTables.length === 1 ? "" : "s"} abierta${openTables.length === 1 ? "" : "s"}. ` +
            "Cobralas o pasalas al turno siguiente antes de cerrar."
        );
      }
      for (const t of openTables) {
        if (t.payments.length) {
          throw new Error(`La mesa ${t.table?.label ?? ""} tiene un cobro parcial: hay que terminar de cobrarla antes de cerrar.`);
        }
        await this.transferOpenTable({ saleId: t.id, fromCashSessionId: params.cashSessionId });
      }
    }

    if (summary.totals.expectedEnvelopeAmountCents > 0) {
      const envelope = await prisma.envelope.findUnique({
        where: { cashSessionId: params.cashSessionId },
        select: { id: true },
      });
      if (!envelope) {
        throw new Error("Contá el efectivo y sellá el sobre antes de cerrar el turno.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await this.syncEnvelopeExpectedAmount(params.cashSessionId, tx);
      await this.persistSnapshot(tx, params.cashSessionId, summary, {
        status: "CLOSED",
        closedAt: new Date(),
        openKey: null,
        notes: params.notes ?? null,
      });
    });

    return summary;
  }

  /**
   * Recalcula y persiste el snapshot de un turno ya cerrado (totales por método +
   * detalle por cuenta). Necesario porque el snapshot se fija al cerrar y no se
   * actualiza solo — una anulación posterior (gerencia) debe llamar esto para que
   * el consolidado no quede con montos viejos.
   */
  static async recomputeClosedSessionSnapshot(cashSessionId: string, client: Prisma.TransactionClient) {
    const session = await client.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { status: true },
    });
    if (!session || session.status !== "CLOSED") return;

    const summary = await this.getCashSessionSummary(cashSessionId, client);
    await this.persistSnapshot(client, cashSessionId, summary);
  }

  /**
   * Mantiene el monto esperado del sobre igual a (efectivo cobrado − egresos en
   * efectivo del turno). El sobre se genera antes de cerrar el turno, así que
   * cualquier cobro, egreso o anulación posterior tiene que reflejarse acá; si
   * no, el sobre queda con un "esperado" que no coincide con el consolidado.
   * Si el sobre ya fue contado, se re-evalúa CONTROLLED / NOT_CONTROLLED.
   */
  static async syncEnvelopeExpectedAmount(cashSessionId: string, client: DbClient = prisma) {
    const envelope = await client.envelope.findUnique({
      where: { cashSessionId },
      select: { id: true, status: true, expectedAmountCents: true, actualAmountCents: true, declaredAmountCents: true },
    });
    if (!envelope) return null;

    const summary = await this.getCashSessionSummary(cashSessionId, client);
    const expected = summary.totals.expectedEnvelopeAmountCents;
    if (expected === envelope.expectedAmountCents) return expected;

    const counted =
      envelope.actualAmountCents != null &&
      (envelope.status === "CONTROLLED" || envelope.status === "NOT_CONTROLLED");

    await client.envelope.update({
      where: { id: envelope.id },
      data: {
        expectedAmountCents: expected,
        ...(counted
          ? {
              // Con monto declarado, el control de la apertura es contra lo declarado (no cambia con el esperado).
              status:
                envelope.actualAmountCents === (envelope.declaredAmountCents ?? expected) ? "CONTROLLED" : "NOT_CONTROLLED",
            }
          : {}),
      },
    });
    return expected;
  }

  /**
   * Un turno "tiene actividad" si tiene ventas cobradas o confirmadas (p.ej. una mesa
   * abierta), egresos o sobre. Los borradores sin cobrar no cuentan.
   */
  static async hasActivity(cashSessionId: string, client: DbClient = prisma) {
    const [sales, expenses, envelope] = await Promise.all([
      client.posSale.count({
        where: {
          cashSessionId,
          OR: [{ status: { in: ["CONFIRMED", "PAID"] } }, { status: "DRAFT", payments: { some: {} } }],
        },
      }),
      client.localExpense.count({ where: { cashSessionId } }),
      client.envelope.count({ where: { cashSessionId } }),
    ]);
    return sales + expenses + envelope > 0;
  }

  static isStale(openedAt: Date, now: Date = new Date()) {
    return now.getTime() - openedAt.getTime() > STALE_SESSION_HOURS * 3600_000;
  }

  /**
   * Cierra en $0 los turnos abiertos del empleado que no tienen actividad y devuelve los
   * que sí tienen (más viejo primero). Evita que queden turnos abiertos para siempre
   * cuando alguien sale sin cerrar o pierde la sesión del navegador.
   */
  static async closeEmptyOpenSessions(employeeId: string) {
    const open = await prisma.cashSession.findMany({
      where: { employeeId, status: "OPEN" },
      select: { id: true, businessDate: true, shift: true, openedAt: true },
      orderBy: { openedAt: "asc" },
    });
    const withActivity: typeof open = [];
    for (const s of open) {
      if (await this.hasActivity(s.id)) {
        withActivity.push(s);
      } else {
        await this.closeCashSession({
          cashSessionId: s.id,
          notes: "Cerrado automáticamente: turno sin actividad",
          autoTransferOpenTables: true,
        });
      }
    }
    return withActivity;
  }

  /** Mesas del turno sin cobrar del todo: borradores con productos o confirmadas. */
  static async listOpenTableSales(cashSessionId: string, client: DbClient = prisma) {
    return client.posSale.findMany({
      where: {
        cashSessionId,
        saleType: "MESA",
        OR: [{ status: "CONFIRMED" }, { status: "DRAFT", items: { some: {} } }],
      },
      include: { table: { select: { label: true } }, payments: { select: { amountCents: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Pasa una mesa sin cobrar al turno siguiente: la plata la cobra y la pone en su sobre quien
   * esté en ese turno. Si el turno siguiente ya está abierto la toma directo; si no, queda
   * pendiente y la toma el próximo turno que se abra. Con cobros parciales no se puede pasar:
   * un mismo cobro no puede quedar repartido entre dos sobres.
   */
  static async transferOpenTable(params: { saleId: string; fromCashSessionId: string }) {
    return prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findUnique({
        where: { id: params.saleId },
        select: { id: true, saleType: true, status: true, cashSessionId: true, _count: { select: { payments: true } } },
      });
      if (!sale || sale.cashSessionId !== params.fromCashSessionId) throw new Error("La mesa no es de este turno.");
      if (sale.saleType !== "MESA" || (sale.status !== "DRAFT" && sale.status !== "CONFIRMED")) {
        throw new Error("Solo se pueden pasar mesas abiertas.");
      }
      if (sale._count.payments) {
        throw new Error("La mesa tiene un cobro parcial: terminá de cobrarla en este turno.");
      }

      const candidates = await tx.cashSession.findMany({
        where: { status: "OPEN", id: { not: params.fromCashSessionId } },
        select: { id: true, openedAt: true },
        orderBy: { openedAt: "desc" },
      });
      const next = candidates.find((c) => !this.isStale(c.openedAt));

      await tx.posSale.update({
        where: { id: sale.id },
        data: { cashSessionId: next?.id ?? null, transferredFromCashSessionId: params.fromCashSessionId },
      });
    });
  }

  /** Al abrir un turno nuevo, toma las mesas que el turno anterior dejó pendientes. */
  static async adoptTransferredTables(cashSessionId: string) {
    return prisma.posSale.updateMany({
      where: {
        cashSessionId: null,
        transferredFromCashSessionId: { not: null },
        saleType: "MESA",
        status: { in: ["DRAFT", "CONFIRMED"] },
      },
      data: { cashSessionId },
    });
  }

  /** Recalcula todo lo derivado de un turno (snapshot del consolidado + sobre). */
  static async syncAfterSessionChange(cashSessionId: string, client: Prisma.TransactionClient) {
    await this.recomputeClosedSessionSnapshot(cashSessionId, client);
    await this.syncEnvelopeExpectedAmount(cashSessionId, client);
  }
}

