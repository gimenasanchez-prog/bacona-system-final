import { prisma } from "@/lib/prisma";

export class LocalCashBoxService {
  static async getActiveLocalCashBox() {
    const box = await prisma.localCashBox.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!box) throw new Error("No existe Caja BCN activa");
    return box;
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

  static async listMovements(localCashBoxId: string) {
    return prisma.localCashMovement.findMany({
      where: { localCashBoxId },
      include: {
        relatedEnvelope: true,
        relatedLocalExpense: true,
        createdByEmployee: { select: { id: true, displayName: true } },
      },
      orderBy: { date: "desc" },
      take: 200,
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
        sourceType: "MANUAL_ADJUSTMENT",
        amountCents: params.amountCents,
        date: params.date,
        description: params.description ?? null,
        createdByEmployeeId: params.createdByEmployeeId,
      },
    });
  }
}

