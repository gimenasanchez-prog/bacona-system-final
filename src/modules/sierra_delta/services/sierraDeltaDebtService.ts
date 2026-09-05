import { Prisma, SierraDeltaDebtCurrency, SierraDeltaDebtPayment } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

function nextStatus(totalAmountCents: number, paidAmountCents: number) {
  if (paidAmountCents <= 0) return "PENDING" as const;
  if (paidAmountCents >= totalAmountCents) return "PAID" as const;
  return "PARTIAL" as const;
}

async function getLocalCashBalanceCents(tx: Prisma.TransactionClient, localCashBoxId: string) {
  const grouped = await tx.localCashMovement.groupBy({
    by: ["type"],
    where: { localCashBoxId },
    _sum: { amountCents: true },
  });
  const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
  const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
  return inSum - outSum;
}

export type RegisterSierraDeltaDebtPaymentInput = {
  debtId: string;
  date: Date;
  amountCents: number; // en la moneda ORIGINAL de la deuda (ARS o USD, en centavos)
  exchangeRate?: number | null; // obligatorio si la deuda es en USD; ARS por 1 USD
  cashBoxId: string;
  createdByEmployeeId: string;
  notes?: string | null;
  skipCashImpact?: boolean;
};

export type UpdateSierraDeltaDebtPaymentInput = Partial<{
  date: Date;
  amountCents: number;
  exchangeRate: number | null;
  cashBoxId: string;
  notes: string | null;
  skipCashImpact: boolean;
}>;

function computeAmountArsCents(currency: SierraDeltaDebtCurrency, amountCents: number, exchangeRate?: number | null) {
  if (currency === "ARS") return amountCents;
  if (!exchangeRate || exchangeRate <= 0) {
    throw new Error("Ingresá el tipo de cambio del día para convertir el pago a pesos.");
  }
  // amountCents está en centavos de USD; exchangeRate es ARS por 1 USD, así que
  // el producto ya da directamente centavos de ARS (los /100 y *100 se cancelan).
  return Math.round(amountCents * exchangeRate);
}

async function applyPaymentEffects(
  tx: Prisma.TransactionClient,
  input: RegisterSierraDeltaDebtPaymentInput,
  existingPaymentId?: string,
  updatedByEmployeeId?: string
): Promise<SierraDeltaDebtPayment> {
  assertIntCents(input.amountCents, "amountCents");
  if (input.amountCents <= 0) throw new Error("El monto a pagar debe ser mayor a cero.");

  const debt = await tx.sierraDeltaDebt.findUnique({ where: { id: input.debtId } });
  if (!debt) throw new Error("Deuda no encontrada.");

  const remaining = debt.totalAmountCents - debt.paidAmountCents;
  if (input.amountCents > remaining) {
    throw new Error("El monto a pagar supera el saldo pendiente de esta deuda.");
  }

  const amountArsCents = computeAmountArsCents(debt.currency, input.amountCents, input.exchangeRate);

  const paymentData = {
    debtId: input.debtId,
    date: input.date,
    amountCents: input.amountCents,
    exchangeRate: debt.currency === "USD" ? input.exchangeRate : null,
    amountArsCents,
    cashBoxId: input.cashBoxId,
    notes: input.notes ?? null,
  };

  const payment = existingPaymentId
    ? await tx.sierraDeltaDebtPayment.update({
        where: { id: existingPaymentId },
        data: { ...paymentData, updatedByEmployeeId: updatedByEmployeeId ?? null, updatedAt: new Date() },
      })
    : await tx.sierraDeltaDebtPayment.create({
        data: { ...paymentData, createdByEmployeeId: input.createdByEmployeeId },
      });

  if (!input.skipCashImpact) {
    const balance = await getLocalCashBalanceCents(tx, input.cashBoxId);
    if (balance < amountArsCents) {
      throw new Error("Saldo insuficiente en la caja/cuenta elegida.");
    }
    await tx.localCashMovement.create({
      data: {
        localCashBoxId: input.cashBoxId,
        type: "OUT",
        sourceType: "SIERRA_DELTA_DEBT_PAYMENT",
        relatedSierraDeltaDebtPaymentId: payment.id,
        amountCents: amountArsCents,
        date: input.date,
        description: `Pago deuda SierraDelta — ${debt.concepto}${input.notes ? ` — ${input.notes}` : ""}`,
        createdByEmployeeId: updatedByEmployeeId ?? input.createdByEmployeeId,
      },
    });
  }

  const newPaidAmountCents = debt.paidAmountCents + input.amountCents;
  await tx.sierraDeltaDebt.update({
    where: { id: debt.id },
    data: {
      paidAmountCents: newPaidAmountCents,
      status: nextStatus(debt.totalAmountCents, newPaidAmountCents),
    },
  });

  return payment;
}

async function revertPaymentEffects(tx: Prisma.TransactionClient, payment: SierraDeltaDebtPayment) {
  await tx.localCashMovement.deleteMany({ where: { relatedSierraDeltaDebtPaymentId: payment.id } });

  const debt = await tx.sierraDeltaDebt.findUnique({ where: { id: payment.debtId } });
  if (debt) {
    const newPaidAmountCents = Math.max(0, debt.paidAmountCents - payment.amountCents);
    await tx.sierraDeltaDebt.update({
      where: { id: payment.debtId },
      data: {
        paidAmountCents: newPaidAmountCents,
        status: nextStatus(debt.totalAmountCents, newPaidAmountCents),
      },
    });
  }
}

export class SierraDeltaDebtService {
  static async list() {
    return prisma.sierraDeltaDebt.findMany({
      orderBy: { createdAt: "asc" },
      include: { breakdownLines: { orderBy: { sortOrder: "asc" } } },
    });
  }

  static async getDetail(debtId: string) {
    const debt = await prisma.sierraDeltaDebt.findUniqueOrThrow({
      where: { id: debtId },
      include: {
        breakdownLines: { orderBy: { sortOrder: "asc" } },
        payments: {
          include: { cashBox: { select: { id: true, name: true } }, createdByEmployee: { select: { id: true, displayName: true } } },
          orderBy: { date: "asc" },
        },
      },
    });
    return debt;
  }

  static async createDebt(params: {
    concepto: string;
    currency: SierraDeltaDebtCurrency;
    totalAmountCents: number;
    notas?: string | null;
  }) {
    assertIntCents(params.totalAmountCents, "totalAmountCents");
    if (!params.concepto.trim()) throw new Error("El concepto es obligatorio.");
    if (params.totalAmountCents <= 0) throw new Error("El monto debe ser mayor a cero.");

    return prisma.sierraDeltaDebt.create({
      data: {
        concepto: params.concepto.trim(),
        currency: params.currency,
        totalAmountCents: params.totalAmountCents,
        notas: params.notas ?? null,
      },
    });
  }

  static async addBreakdownLine(params: {
    debtId: string;
    periodLabel: string;
    paymentMonthLabel: string;
    amountPerPartnerCents: number;
    partnersCount?: number;
    sortOrder?: number;
  }) {
    assertIntCents(params.amountPerPartnerCents, "amountPerPartnerCents");
    return prisma.sierraDeltaDebtBreakdownLine.create({
      data: {
        debtId: params.debtId,
        periodLabel: params.periodLabel,
        paymentMonthLabel: params.paymentMonthLabel,
        amountPerPartnerCents: params.amountPerPartnerCents,
        partnersCount: params.partnersCount ?? 2,
        sortOrder: params.sortOrder ?? 0,
      },
    });
  }

  static async registerPayment(input: RegisterSierraDeltaDebtPaymentInput) {
    return prisma.$transaction((tx) => applyPaymentEffects(tx, input));
  }

  static async updatePayment(
    paymentId: string,
    input: UpdateSierraDeltaDebtPaymentInput,
    updatedByEmployeeId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.sierraDeltaDebtPayment.findUnique({ where: { id: paymentId } });
      if (!existing) throw new Error("Pago no encontrado.");

      const hadMovement = !!(await tx.localCashMovement.findFirst({
        where: { relatedSierraDeltaDebtPaymentId: paymentId },
        select: { id: true },
      }));
      const previousSkipCashImpact = !hadMovement;

      await revertPaymentEffects(tx, existing);

      const merged: RegisterSierraDeltaDebtPaymentInput = {
        debtId: existing.debtId,
        date: input.date ?? existing.date,
        amountCents: input.amountCents ?? existing.amountCents,
        exchangeRate:
          input.exchangeRate !== undefined ? input.exchangeRate : existing.exchangeRate ? Number(existing.exchangeRate) : null,
        cashBoxId: input.cashBoxId ?? existing.cashBoxId,
        createdByEmployeeId: existing.createdByEmployeeId,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        skipCashImpact: input.skipCashImpact ?? previousSkipCashImpact,
      };

      return applyPaymentEffects(tx, merged, paymentId, updatedByEmployeeId);
    });
  }

  static async deletePayment(paymentId: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.sierraDeltaDebtPayment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new Error("Pago no encontrado.");

      await revertPaymentEffects(tx, payment);
      await tx.sierraDeltaDebtPayment.delete({ where: { id: paymentId } });
    });
  }
}
