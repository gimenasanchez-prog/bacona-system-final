import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";

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

async function generateEnvelopeCode(params: { businessDate: Date; shift: "MANIANA" | "TARDE" | "NOCHE" }) {
  // Human-readable, unique enough; we still guard with unique constraint + retry.
  const base = `BCN-${formatYmd(params.businessDate)}-${shiftCode(params.shift)}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${rand}`;
}

export class EnvelopeService {
  static async confirmEnvelopeDeposit(params: { cashSessionId: string; notes?: string | null }) {
    const cashSession = await prisma.cashSession.findUnique({
      where: { id: params.cashSessionId },
      select: { id: true, businessDate: true, shift: true },
    });
    if (!cashSession) throw new Error("Cash session not found");

    const existing = await prisma.envelope.findUnique({
      where: { cashSessionId: params.cashSessionId },
      select: { id: true, envelopeCode: true },
    });
    if (existing) return existing;

    const summary = await CashSessionService.getCashSessionSummary(params.cashSessionId);
    const expected = summary.totals.expectedEnvelopeAmountCents;
    if (expected < 0) {
      throw new Error("El efectivo del turno no cubre los egresos en efectivo del turno");
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const envelopeCode = await generateEnvelopeCode({
        businessDate: cashSession.businessDate,
        shift: cashSession.shift,
      });
      try {
        return await prisma.envelope.create({
          data: {
            envelopeCode,
            cashSessionId: params.cashSessionId,
            expectedAmountCents: expected,
            status: "CLOSED",
            depositedAt: new Date(),
            notes: params.notes ?? null,
          },
          select: { id: true, envelopeCode: true },
        });
      } catch (e) {
        // Unique collision: retry
        if (e instanceof Error && e.message.includes("Unique constraint")) continue;
        throw e;
      }
    }

    throw new Error("No se pudo generar un código de sobre único");
  }
}

