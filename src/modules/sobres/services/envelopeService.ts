import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function shiftCode(shift: "MANIANA" | "TARDE" | "NOCHE"): string {
  if (shift === "MANIANA") return "M";
  if (shift === "TARDE") return "T";
  return "N";
}

function generateEnvelopeCode(params: { businessDate: Date; shift: "MANIANA" | "TARDE" | "NOCHE" }) {
  // Human-readable, unique enough; we still guard with unique constraint + retry.
  const base = `BCN-${formatYmd(params.businessDate)}-${shiftCode(params.shift)}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${rand}`;
}

export class EnvelopeService {
  /**
   * Último paso del cierre guiado: sella el sobre con lo que el cajero declara meter y cierra el
   * turno. El cajero ve cuánto tiene que ir en el sobre; si declara otro monto, el motivo es
   * obligatorio y la diferencia queda registrada a su nombre. Tiene que aceptar la responsabilidad
   * del sobre hasta entregarlo a la encargada.
   */
  static async sealAndClose(params: {
    cashSessionId: string;
    declaredCents: number;
    note?: string | null;
    acceptedResponsibility: boolean;
  }): Promise<{ envelopeId: string | null }> {
    if (!Number.isInteger(params.declaredCents) || params.declaredCents < 0) {
      throw new Error("El monto del sobre tiene que ser un número mayor o igual a cero.");
    }
    const note = params.note?.trim() || null;

    const envelopeId = await prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findUnique({
        where: { id: params.cashSessionId },
        select: {
          id: true,
          status: true,
          businessDate: true,
          shift: true,
          employeeId: true,
          envelope: { select: { id: true } },
        },
      });
      if (!session) throw new Error("Turno no encontrado.");
      if (session.status !== "OPEN") throw new Error("El turno ya está cerrado.");
      if (session.envelope) return session.envelope.id; // ya sellado (reintento): solo falta cerrar

      // Se valida antes de sellar para no dejar un sobre sellado con el turno sin poder cerrarse.
      if ((await CashSessionService.listOpenTableSales(session.id, tx)).length) {
        throw new Error("Quedan mesas abiertas: cobralas o pasalas al turno siguiente antes de cerrar.");
      }

      const summary = await CashSessionService.getCashSessionSummary(session.id, tx);
      const expected = summary.totals.expectedEnvelopeAmountCents;
      if (expected < 0) {
        throw new Error("Los gastos en efectivo del turno superan lo cobrado en efectivo. Revisá los gastos cargados.");
      }
      if (expected === 0 && params.declaredCents === 0) return null; // sin efectivo: no hace falta sobre

      if (!params.acceptedResponsibility) {
        throw new Error("Tenés que confirmar que contaste la plata y te hacés responsable del sobre.");
      }
      const differenceCents = params.declaredCents - expected;
      if (differenceCents !== 0 && !note) {
        throw new Error("El monto no coincide con el sistema: escribí el motivo.");
      }

      const envelope = await this.createSealedEnvelope(tx, {
        cashSessionId: session.id,
        businessDate: session.businessDate,
        shift: session.shift,
        expectedAmountCents: expected,
        declaredAmountCents: params.declaredCents,
        countNote: differenceCents !== 0 ? note : null,
      });
      await EnvelopeCustodyService.autoReceiveIfOwn(envelope.id, session.employeeId, tx);
      return envelope.id;
    });

    await CashSessionService.closeCashSession({ cashSessionId: params.cashSessionId });
    return { envelopeId };
  }

  private static async createSealedEnvelope(
    tx: Prisma.TransactionClient,
    data: {
      cashSessionId: string;
      businessDate: Date;
      shift: "MANIANA" | "TARDE" | "NOCHE";
      expectedAmountCents: number;
      declaredAmountCents: number;
      countNote: string | null;
    }
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const envelopeCode = generateEnvelopeCode({ businessDate: data.businessDate, shift: data.shift });
      const taken = await tx.envelope.findUnique({ where: { envelopeCode }, select: { id: true } });
      if (taken) continue;
      return tx.envelope.create({
        data: {
          envelopeCode,
          cashSessionId: data.cashSessionId,
          expectedAmountCents: data.expectedAmountCents,
          declaredAmountCents: data.declaredAmountCents,
          countNote: data.countNote,
          status: "CLOSED",
          depositedAt: new Date(),
        },
        select: { id: true, envelopeCode: true },
      });
    }
    throw new Error("No se pudo generar un código de sobre único");
  }
}
