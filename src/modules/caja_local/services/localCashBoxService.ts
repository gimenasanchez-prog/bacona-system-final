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

