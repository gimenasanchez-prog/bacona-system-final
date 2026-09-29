import {
  envelopeCashierDifferenceCents,
  envelopeCustodyDifferenceCents,
  type EnvelopeStatus,
} from "@/modules/sobres/lib/envelopeStatus";
import { prisma } from "@/lib/prisma";
import { STALE_SESSION_HOURS } from "@/modules/caja/services/cashSessionService";

export class ConsolidatedClosuresService {
  static async listCashClosures(params: {
    from?: Date;
    to?: Date;
    shift?: "MANIANA" | "TARDE" | "NOCHE";
    employeeId?: string;
    cashSessionStatus?: "OPEN" | "CLOSED";
    envelopeStatus?: EnvelopeStatus;
    take?: number;
  }) {
    return prisma.cashSession.findMany({
      where: {
        businessDate: {
          gte: params.from,
          lte: params.to,
        },
        shift: params.shift,
        employeeId: params.employeeId,
        status: params.cashSessionStatus,
        envelope: params.envelopeStatus ? { status: params.envelopeStatus } : undefined,
      },
      include: {
        employee: { select: { id: true, displayName: true } },
        envelope: true,
      },
      orderBy: [{ businessDate: "desc" }, { openedAt: "desc" }],
      take: params.take ?? 200,
    });
  }

  static async getInternalAccountBreakdown(params: {
    from?: Date;
    to?: Date;
    shift?: "MANIANA" | "TARDE" | "NOCHE";
    employeeId?: string;
    cashSessionStatus?: "OPEN" | "CLOSED";
    envelopeStatus?: EnvelopeStatus;
  }) {
    const grouped = await prisma.cashSessionPaymentBreakdownDetail.groupBy({
      by: ["referenceId", "referenceName"],
      where: {
        type: "CUENTA_INTERNA",
        cashSession: {
          businessDate: { gte: params.from, lte: params.to },
          shift: params.shift,
          employeeId: params.employeeId,
          status: params.cashSessionStatus,
          envelope: params.envelopeStatus ? { status: params.envelopeStatus } : undefined,
        },
      },
      _sum: { amountCents: true },
    });

    return grouped
      .map((g) => ({
        employeeId: g.referenceId,
        employeeName: g.referenceName,
        amountCents: g._sum.amountCents ?? 0,
      }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }

  /**
   * Sobres con diferencia, separada por dónde se produjo:
   * - cajero: lo que declaró meter en el sobre al cerrar − lo que dice el sistema.
   * - custodia: lo contado al abrir − lo que declaró el cajero (sobres viejos: − el esperado).
   */
  static async getEnvelopeDifferenceBreakdown(params: {
    from?: Date;
    to?: Date;
    shift?: "MANIANA" | "TARDE" | "NOCHE";
    employeeId?: string;
    cashSessionStatus?: "OPEN" | "CLOSED";
    envelopeStatus?: EnvelopeStatus;
  }) {
    const envelopes = await prisma.envelope.findMany({
      where: {
        OR: [{ actualAmountCents: { not: null } }, { declaredAmountCents: { not: null } }],
        status: params.envelopeStatus,
        cashSession: {
          businessDate: { gte: params.from, lte: params.to },
          shift: params.shift,
          employeeId: params.employeeId,
          status: params.cashSessionStatus,
        },
      },
      include: {
        cashSession: { include: { employee: { select: { id: true, displayName: true } } } },
        receivedByEmployee: { select: { displayName: true } },
        openedByEmployee: { select: { displayName: true } },
      },
      orderBy: { cashSession: { businessDate: "desc" } },
    });

    return envelopes
      .map((e) => ({
        envelopeId: e.id,
        envelopeCode: e.envelopeCode,
        employeeName: e.cashSession.employee.displayName,
        businessDate: e.cashSession.businessDate,
        shift: e.cashSession.shift,
        expectedAmountCents: e.expectedAmountCents,
        declaredAmountCents: e.declaredAmountCents,
        firstCountCents: e.firstCountCents,
        countNote: e.countNote,
        actualAmountCents: e.actualAmountCents,
        receivedByName: e.receivedByEmployee?.displayName ?? null,
        openedByName: e.openedByEmployee?.displayName ?? null,
        // negativo = faltante, positivo = sobrante
        cashierDifferenceCents: envelopeCashierDifferenceCents(e),
        custodyDifferenceCents: envelopeCustodyDifferenceCents(e),
      }))
      .filter((e) => !!e.cashierDifferenceCents || !!e.custodyDifferenceCents);
  }

  /**
   * Turnos abiertos hace más de STALE_SESSION_HOURS. Sus ventas no suman al consolidado
   * (que lee el snapshot del cierre) hasta que se cierran, así que se muestran aparte.
   */
  static async listStaleOpenSessions() {
    const cutoff = new Date(Date.now() - STALE_SESSION_HOURS * 3600_000);
    const sessions = await prisma.cashSession.findMany({
      where: { status: "OPEN", openedAt: { lt: cutoff } },
      include: {
        employee: { select: { displayName: true } },
        sales: { where: { status: { not: "CANCELLED" } }, select: { payments: { select: { amountCents: true } } } },
        _count: { select: { localExpenses: true } },
      },
      orderBy: { businessDate: "asc" },
    });
    return sessions.map((s) => ({
      id: s.id,
      businessDate: s.businessDate,
      shift: s.shift,
      employeeName: s.employee.displayName,
      paidCents: s.sales.flatMap((x) => x.payments).reduce((a, p) => a + p.amountCents, 0),
      expensesCount: s._count.localExpenses,
    }));
  }

  static async deleteCashSession(cashSessionId: string): Promise<void> {
    const session = await prisma.cashSession.findUnique({
      where: { id: cashSessionId },
      include: {
        sales: { where: { status: { not: "CANCELLED" } }, select: { id: true } },
        envelope: { select: { id: true, status: true } },
      },
    });
    if (!session) throw new Error("Sesión no encontrada");

    if (session.sales.length > 0) {
      throw new Error(
        `No se puede eliminar: la sesión tiene ${session.sales.length} venta(s) no cancelada(s). Anulá las ventas primero desde Ver cierre.`
      );
    }

    // El sobre existe físicamente: borrar el cierre lo haría desaparecer del sistema.
    if (session.envelope) {
      throw new Error("No se puede eliminar: el turno tiene un sobre sellado. Los sobres no se borran.");
    }

    await prisma.$transaction(async (tx) => {
      // Desvinculá registros con FK nullable sin cascade hacia CashSession
      await tx.posSale.updateMany({ where: { cashSessionId }, data: { cashSessionId: null } });
      await tx.localExpense.deleteMany({ where: { cashSessionId } });

      // Eliminá la sesión — CashSessionPaymentBreakdownDetail se cascade-deletea
      await tx.cashSession.delete({ where: { id: cashSessionId } });
    });
  }

  static async getCashClosureDetail(cashSessionId: string) {
    const cashSession = await prisma.cashSession.findUnique({
      where: { id: cashSessionId },
      include: {
        employee: { select: { id: true, displayName: true } },
        envelope: true,
        paymentDetails: { orderBy: { createdAt: "asc" } },
        localExpenses: { include: { supplier: true }, orderBy: { date: "desc" } },
        sales: {
          include: {
            payments: true,
            items: { include: { product: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
            customer: { select: { displayName: true } },
            cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!cashSession) throw new Error("Cash session not found");
    return cashSession;
  }
}

