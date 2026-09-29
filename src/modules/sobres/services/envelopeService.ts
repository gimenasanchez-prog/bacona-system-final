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

export type EnvelopeCountResult =
  /** Coincide (o se aceptó con motivo): el sobre quedó sellado. */
  | { status: "SEALED"; envelopeCode: string; differenceCents: number }
  /** Primer conteo con diferencia: se muestra la diferencia para revisar y volver a contar. */
  | { status: "MISMATCH"; differenceCents: number }
  /** Sigue sin coincidir: para sellar hace falta escribir el motivo. */
  | { status: "NEEDS_NOTE"; differenceCents: number }
  /** No hay efectivo para depositar: no hace falta sobre. */
  | { status: "NO_ENVELOPE" };

export class EnvelopeService {
  /**
   * Cierre con "primero contar, después ver": el cajero carga lo que contó sin ver el esperado.
   * Se guarda el primer conteo. Si coincide, se sella el sobre; si no, se le muestra la diferencia
   * para que revise (egreso sin cargar, medio de pago mal elegido) y vuelva a contar. Si sigue sin
   * coincidir, sella con lo que contó y un motivo obligatorio: la diferencia queda en su turno.
   */
  static async submitCount(params: { cashSessionId: string; countedCents: number; note?: string | null }) {
    if (!Number.isInteger(params.countedCents) || params.countedCents < 0) {
      throw new Error("El monto contado tiene que ser un número mayor o igual a cero.");
    }
    const note = params.note?.trim() || null;

    const result = await prisma.$transaction(async (tx): Promise<EnvelopeCountResult> => {
      const session = await tx.cashSession.findUnique({
        where: { id: params.cashSessionId },
        select: {
          id: true,
          status: true,
          businessDate: true,
          shift: true,
          employeeId: true,
          envelopeFirstCountCents: true,
          envelope: { select: { id: true } },
        },
      });
      if (!session) throw new Error("Turno no encontrado.");
      if (session.status !== "OPEN") throw new Error("El turno ya está cerrado.");
      if (session.envelope) throw new Error("El sobre de este turno ya está sellado.");

      const summary = await CashSessionService.getCashSessionSummary(session.id, tx);
      const expected = summary.totals.expectedEnvelopeAmountCents;
      if (expected < 0) {
        throw new Error("Los egresos en efectivo del turno superan lo cobrado en efectivo. Revisá los egresos cargados.");
      }

      const isFirstCount = session.envelopeFirstCountCents == null;
      if (isFirstCount) {
        await tx.cashSession.update({
          where: { id: session.id },
          data: {
            envelopeFirstCountCents: params.countedCents,
            envelopeFirstCountExpectedCents: expected,
            envelopeFirstCountAt: new Date(),
          },
        });
      }

      const differenceCents = params.countedCents - expected;
      if (differenceCents === 0 && expected === 0) return { status: "NO_ENVELOPE" };
      if (differenceCents !== 0) {
        if (isFirstCount) return { status: "MISMATCH", differenceCents };
        if (!note) return { status: "NEEDS_NOTE", differenceCents };
      }

      const envelope = await this.createSealedEnvelope(tx, {
        cashSessionId: session.id,
        businessDate: session.businessDate,
        shift: session.shift,
        expectedAmountCents: expected,
        declaredAmountCents: params.countedCents,
        firstCountCents: session.envelopeFirstCountCents ?? params.countedCents,
        countNote: differenceCents !== 0 ? note : null,
      });
      await EnvelopeCustodyService.autoReceiveIfOwn(envelope.id, session.employeeId, tx);
      return { status: "SEALED", envelopeCode: envelope.envelopeCode, differenceCents };
    });

    return result;
  }

  private static async createSealedEnvelope(
    tx: Prisma.TransactionClient,
    data: {
      cashSessionId: string;
      businessDate: Date;
      shift: "MANIANA" | "TARDE" | "NOCHE";
      expectedAmountCents: number;
      declaredAmountCents: number;
      firstCountCents: number;
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
          firstCountCents: data.firstCountCents,
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
