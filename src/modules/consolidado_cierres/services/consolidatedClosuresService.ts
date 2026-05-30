import { prisma } from "@/lib/prisma";

export class ConsolidatedClosuresService {
  static async listCashClosures(params: {
    from?: Date;
    to?: Date;
    shift?: "MANIANA" | "TARDE" | "NOCHE";
    employeeId?: string;
    cashSessionStatus?: "OPEN" | "CLOSED";
    envelopeStatus?: "CLOSED" | "OPENED" | "CONTROLLED" | "NOT_CONTROLLED";
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
      take: 200,
    });
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

    if (session.envelope && session.envelope.status !== "CLOSED") {
      throw new Error(
        `No se puede eliminar: el sobre está en estado ${session.envelope.status}. Solo se puede eliminar si el sobre está CLOSED.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.cashSessionPaymentBreakdownDetail.deleteMany({ where: { cashSessionId } });
      await tx.localExpense.deleteMany({ where: { cashSessionId } });
      if (session.envelope) {
        await tx.envelope.delete({ where: { id: session.envelope.id } });
      }
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
          include: { payments: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!cashSession) throw new Error("Cash session not found");
    return cashSession;
  }
}

