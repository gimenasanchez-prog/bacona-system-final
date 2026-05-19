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

