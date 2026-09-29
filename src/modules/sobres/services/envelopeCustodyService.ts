import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type ActiveCustodian = {
  id: string;
  displayName: string;
  /** Traspaso que la hizo encargada, si todavía no confirmó qué sobres tiene. */
  pendingHandoverId: string | null;
};

/** Un sobre con un traspaso sin confirmar no se puede abrir hasta que la nueva encargada confirme que lo tiene. */
const NOT_IN_PENDING_HANDOVER: Prisma.EnvelopeWhereInput = {
  custodyHandoverItems: { none: { accepted: null, handover: { confirmedAt: null } } },
};

/**
 * Encargada de sobres: una sola persona a la vez recibe y abre sobres (Yanet; Noelia cuando la cubre).
 * La define el último traspaso. Si nunca hubo uno, es la única empleada activa con rol Caja Local.
 */
export class EnvelopeCustodyService {
  static async getActiveCustodian(client: DbClient = prisma): Promise<ActiveCustodian | null> {
    const last = await client.envelopeCustodyHandover.findFirst({
      orderBy: { createdAt: "desc" },
      include: { toEmployee: { select: { id: true, displayName: true } } },
    });
    if (last) {
      return {
        id: last.toEmployee.id,
        displayName: last.toEmployee.displayName,
        pendingHandoverId: last.confirmedAt ? null : last.id,
      };
    }

    const cajaLocal = await client.employee.findMany({
      where: { role: "CAJA_LOCAL", isActive: true },
      select: { id: true, displayName: true },
      take: 2,
    });
    if (cajaLocal.length === 1) return { ...cajaLocal[0], pendingHandoverId: null };
    return null;
  }

  static async isActiveCustodian(employeeId: string | null | undefined, client: DbClient = prisma) {
    if (!employeeId) return false;
    const custodian = await this.getActiveCustodian(client);
    return custodian?.id === employeeId;
  }

  private static async assertActiveCustodian(employeeId: string, client: DbClient) {
    const custodian = await this.getActiveCustodian(client);
    if (!custodian) {
      throw new Error("No hay encargada de sobres definida. Gerencia la define desde Caja BCÑ.");
    }
    if (custodian.id !== employeeId) {
      throw new Error(`Solo la encargada de sobres (${custodian.displayName}) puede hacer esto.`);
    }
    return custodian;
  }

  /**
   * Al sellar el sobre: si el turno es de la encargada de sobres, el sobre ya está en su poder
   * y queda recibido solo.
   */
  static async autoReceiveIfOwn(envelopeId: string, sessionEmployeeId: string, client: DbClient) {
    const custodian = await this.getActiveCustodian(client);
    if (custodian?.id !== sessionEmployeeId) return false;
    await client.envelope.update({
      where: { id: envelopeId },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedByEmployeeId: sessionEmployeeId,
        custodianEmployeeId: sessionEmployeeId,
        selfReceived: true,
      },
    });
    return true;
  }

  /** La encargada marca "Recibí" los sobres que el cajero le dio en mano. */
  static async receiveEnvelopes(params: { envelopeIds: string[]; employeeId: string }) {
    if (!params.envelopeIds.length) throw new Error("Elegí al menos un sobre.");

    return prisma.$transaction(async (tx) => {
      await this.assertActiveCustodian(params.employeeId, tx);
      const envelopes = await tx.envelope.findMany({
        where: { id: { in: params.envelopeIds } },
        select: { id: true, status: true, envelopeCode: true, cashSession: { select: { employeeId: true } } },
      });
      const now = new Date();
      let received = 0;
      for (const env of envelopes) {
        if (env.status !== "CLOSED") continue;
        await tx.envelope.update({
          where: { id: env.id },
          data: {
            status: "RECEIVED",
            receivedAt: now,
            receivedByEmployeeId: params.employeeId,
            custodianEmployeeId: params.employeeId,
            selfReceived: env.cashSession.employeeId === params.employeeId,
          },
        });
        received++;
      }
      if (!received) throw new Error("Los sobres elegidos ya fueron recibidos.");
      return received;
    });
  }

  /**
   * Cambia la encargada de sobres. Los sobres recibidos sin abrir que tenía la encargada anterior
   * pasan a la nueva, que después confirma cuáles tiene físicamente.
   */
  static async handover(params: { toEmployeeId: string; createdByEmployeeId: string }) {
    return prisma.$transaction(async (tx) => {
      const to = await tx.employee.findUnique({
        where: { id: params.toEmployeeId },
        select: { id: true, isActive: true },
      });
      if (!to || !to.isActive) throw new Error("Empleada no encontrada o inactiva.");

      const current = await this.getActiveCustodian(tx);
      if (current?.id === params.toEmployeeId) throw new Error("Ya es la encargada de sobres.");

      // Un traspaso anterior sin confirmar queda cerrado: sus sobres siguen viaje con este.
      await tx.envelopeCustodyHandover.updateMany({
        where: { confirmedAt: null },
        data: { confirmedAt: new Date() },
      });

      const envelopes = current
        ? await tx.envelope.findMany({
            where: { status: "RECEIVED", custodianEmployeeId: current.id },
            select: { id: true },
          })
        : [];

      const handover = await tx.envelopeCustodyHandover.create({
        data: {
          fromEmployeeId: current?.id ?? null,
          toEmployeeId: params.toEmployeeId,
          createdByEmployeeId: params.createdByEmployeeId,
          confirmedAt: envelopes.length ? null : new Date(),
          items: { create: envelopes.map((e) => ({ envelopeId: e.id })) },
        },
      });

      if (envelopes.length) {
        await tx.envelope.updateMany({
          where: { id: { in: envelopes.map((e) => e.id) } },
          data: { custodianEmployeeId: params.toEmployeeId },
        });
      }
      return handover;
    });
  }

  /**
   * La nueva encargada confirma qué sobres del traspaso tiene. Los que no, vuelven a quedar a
   * cargo de la encargada anterior (siguen apareciendo como "en poder de otra persona").
   */
  static async confirmHandover(params: { handoverId: string; acceptedEnvelopeIds: string[]; employeeId: string }) {
    return prisma.$transaction(async (tx) => {
      const handover = await tx.envelopeCustodyHandover.findUnique({
        where: { id: params.handoverId },
        include: { items: true },
      });
      if (!handover) throw new Error("Traspaso no encontrado.");
      if (handover.toEmployeeId !== params.employeeId) {
        throw new Error("Solo quien recibe los sobres puede confirmar el traspaso.");
      }
      if (handover.confirmedAt) throw new Error("El traspaso ya fue confirmado.");

      const accepted = new Set(params.acceptedEnvelopeIds);
      for (const item of handover.items) {
        const ok = accepted.has(item.envelopeId);
        await tx.envelopeCustodyHandoverItem.update({ where: { id: item.id }, data: { accepted: ok } });
        if (!ok) {
          await tx.envelope.updateMany({
            where: { id: item.envelopeId, status: "RECEIVED", custodianEmployeeId: handover.toEmployeeId },
            data: { custodianEmployeeId: handover.fromEmployeeId },
          });
        }
      }
      await tx.envelopeCustodyHandover.update({
        where: { id: handover.id },
        data: { confirmedAt: new Date() },
      });
    });
  }

  /** Verifica, dentro de la transacción de apertura, que el sobre se pueda abrir. */
  static async assertCanOpen(envelopeId: string, employeeId: string, tx: Prisma.TransactionClient) {
    await this.assertActiveCustodian(employeeId, tx);
    const env = await tx.envelope.findFirst({
      where: { id: envelopeId, ...NOT_IN_PENDING_HANDOVER },
      select: { id: true, status: true, envelopeCode: true, cashSessionId: true, custodianEmployeeId: true, declaredAmountCents: true },
    });
    if (!env) throw new Error("El sobre tiene un traspaso sin confirmar. Confirmá primero qué sobres tenés.");
    if (env.status === "CLOSED") throw new Error(`El sobre ${env.envelopeCode} todavía no fue recibido. Marcalo como recibido primero.`);
    if (env.status !== "RECEIVED") throw new Error(`El sobre ${env.envelopeCode} ya fue abierto.`);
    if (env.custodianEmployeeId !== employeeId) throw new Error(`El sobre ${env.envelopeCode} no está a tu cargo.`);
    return env;
  }

  /** Todo lo que necesita la pantalla de Caja BCÑ para la parte de sobres. */
  static async getCustodyOverview() {
    const custodian = await this.getActiveCustodian();

    const envelopeInclude = {
      cashSession: { select: { businessDate: true, shift: true, employee: { select: { id: true, displayName: true } } } },
    } as const;

    const [toReceive, readyToOpen, withOthers, pendingHandover] = await Promise.all([
      prisma.envelope.findMany({
        where: { status: "CLOSED" },
        include: envelopeInclude,
        orderBy: { depositedAt: "asc" },
        take: 200,
      }),
      custodian
        ? prisma.envelope.findMany({
            where: { status: "RECEIVED", custodianEmployeeId: custodian.id, ...NOT_IN_PENDING_HANDOVER },
            include: envelopeInclude,
            orderBy: { depositedAt: "asc" },
            take: 200,
          })
        : Promise.resolve([]),
      prisma.envelope.findMany({
        where: {
          status: "RECEIVED",
          ...(custodian ? { NOT: { custodianEmployeeId: custodian.id } } : {}),
        },
        include: { ...envelopeInclude, custodianEmployee: { select: { displayName: true } } },
        orderBy: { depositedAt: "asc" },
      }),
      custodian?.pendingHandoverId
        ? prisma.envelopeCustodyHandover.findUnique({
            where: { id: custodian.pendingHandoverId },
            include: {
              fromEmployee: { select: { displayName: true } },
              items: { include: { envelope: { include: envelopeInclude } } },
            },
          })
        : Promise.resolve(null),
    ]);

    return { custodian, toReceive, readyToOpen, withOthers, pendingHandover };
  }
}
