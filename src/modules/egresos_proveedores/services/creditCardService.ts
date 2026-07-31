import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

function periodStatus(totalAmountCents: number, paidAmountCents: number) {
  if (paidAmountCents <= 0) return "PENDING" as const;
  if (paidAmountCents >= totalAmountCents) return "PAID" as const;
  return "PARTIAL" as const;
}

export class CreditCardService {
  static async listCards() {
    return prisma.creditCard.findMany({
      where: { active: true },
      include: { payFromCashBox: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }

  static async createCard(params: {
    name: string;
    closingDay: number;
    dueDay: number;
    payFromCashBoxId?: string | null;
  }) {
    if (!params.name.trim()) throw new Error("El nombre es obligatorio.");
    if (params.closingDay < 1 || params.closingDay > 28) throw new Error("Día de cierre inválido (1-28).");
    if (params.dueDay < 1 || params.dueDay > 28) throw new Error("Día de vencimiento inválido (1-28).");

    return prisma.creditCard.create({
      data: {
        name: params.name,
        closingDay: params.closingDay,
        dueDay: params.dueDay,
        payFromCashBoxId: params.payFromCashBoxId ?? null,
      },
    });
  }

  static async updateCard(
    id: string,
    params: Partial<{
      name: string;
      closingDay: number;
      dueDay: number;
      payFromCashBoxId: string | null;
      active: boolean;
    }>
  ) {
    if (params.closingDay !== undefined && (params.closingDay < 1 || params.closingDay > 28)) {
      throw new Error("Día de cierre inválido (1-28).");
    }
    if (params.dueDay !== undefined && (params.dueDay < 1 || params.dueDay > 28)) {
      throw new Error("Día de vencimiento inválido (1-28).");
    }
    return prisma.creditCard.update({ where: { id }, data: params });
  }

  static async getPeriodsSummary(creditCardId: string) {
    const [chargesGrouped, paymentsGrouped] = await Promise.all([
      prisma.creditCardCharge.groupBy({
        by: ["statementPeriod"],
        where: { creditCardId },
        _sum: { amountCents: true },
      }),
      prisma.creditCardStatementPayment.groupBy({
        by: ["period"],
        where: { creditCardId },
        _sum: { totalAmountCents: true },
      }),
    ]);

    const paidByPeriod = new Map(
      paymentsGrouped.map((p) => [p.period.toISOString(), p._sum.totalAmountCents ?? 0])
    );

    return chargesGrouped
      .map((c) => {
        const totalAmountCents = c._sum.amountCents ?? 0;
        const paidAmountCents = paidByPeriod.get(c.statementPeriod.toISOString()) ?? 0;
        return {
          period: c.statementPeriod,
          totalAmountCents,
          paidAmountCents,
          remainingCents: totalAmountCents - paidAmountCents,
          status: periodStatus(totalAmountCents, paidAmountCents),
        };
      })
      .sort((a, b) => a.period.getTime() - b.period.getTime());
  }

  static async getPeriodDetail(creditCardId: string, period: Date) {
    const [charges, payments] = await Promise.all([
      prisma.creditCardCharge.findMany({
        where: { creditCardId, statementPeriod: period },
        include: {
          supplierPayment: { include: { supplier: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.creditCardStatementPayment.findMany({
        where: { creditCardId, period },
        include: { cashBox: { select: { id: true, name: true } } },
        orderBy: { paidAt: "asc" },
      }),
    ]);

    const totalAmountCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
    const paidAmountCents = payments.reduce((sum, p) => sum + p.totalAmountCents, 0);

    return {
      charges,
      payments,
      totalAmountCents,
      paidAmountCents,
      remainingCents: totalAmountCents - paidAmountCents,
      status: periodStatus(totalAmountCents, paidAmountCents),
    };
  }

  static async payStatement(params: {
    creditCardId: string;
    period: Date;
    amountCents: number;
    cashBoxId: string;
    employeeId: string;
    notes?: string | null;
  }) {
    assertIntCents(params.amountCents, "amountCents");
    if (params.amountCents <= 0) throw new Error("El monto a pagar debe ser mayor a cero.");

    return prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findUnique({ where: { id: params.creditCardId } });
      if (!card) throw new Error("Tarjeta no encontrada.");

      const [chargesAgg, paymentsAgg] = await Promise.all([
        tx.creditCardCharge.aggregate({
          where: { creditCardId: params.creditCardId, statementPeriod: params.period },
          _sum: { amountCents: true },
        }),
        tx.creditCardStatementPayment.aggregate({
          where: { creditCardId: params.creditCardId, period: params.period },
          _sum: { totalAmountCents: true },
        }),
      ]);

      const totalAmountCents = chargesAgg._sum.amountCents ?? 0;
      const paidAmountCents = paymentsAgg._sum.totalAmountCents ?? 0;
      const remainingCents = totalAmountCents - paidAmountCents;

      if (remainingCents <= 0) throw new Error("Este período ya está saldado.");
      if (params.amountCents > remainingCents) {
        throw new Error("El monto supera el saldo pendiente del período.");
      }

      const grouped = await tx.localCashMovement.groupBy({
        by: ["type"],
        where: { localCashBoxId: params.cashBoxId },
        _sum: { amountCents: true },
      });
      const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
      const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
      if (inSum - outSum < params.amountCents) {
        throw new Error("Saldo insuficiente en la cuenta elegida.");
      }

      const statementPayment = await tx.creditCardStatementPayment.create({
        data: {
          creditCardId: params.creditCardId,
          period: params.period,
          totalAmountCents: params.amountCents,
          cashBoxId: params.cashBoxId,
          createdByEmployeeId: params.employeeId,
          notes: params.notes ?? null,
        },
      });

      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.cashBoxId,
          type: "OUT",
          sourceType: "CREDIT_CARD_STATEMENT_PAYMENT",
          relatedCreditCardStatementPaymentId: statementPayment.id,
          amountCents: params.amountCents,
          date: statementPayment.paidAt,
          description: `Pago resumen ${card.name} — período ${params.period.toISOString().slice(0, 7)}`,
          createdByEmployeeId: params.employeeId,
        },
      });

      return statementPayment;
    });
  }
}
