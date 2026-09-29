import { PosPaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";

export class PosPaymentService {
  static validatePaymentInput(params: {
    method: PosPaymentMethod;
    amountCents: number;
    cuentaCorrienteAccountId?: string | null;
    employeeId?: string | null;
  }) {
    const { method, amountCents, cuentaCorrienteAccountId, employeeId } = params;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }

    if (method === "CUENTA_CORRIENTE" && !cuentaCorrienteAccountId) {
      throw new Error("cuentaCorrienteAccountId is required for CUENTA_CORRIENTE payments");
    }
    if (method === "CUENTAS_INTERNAS" && !employeeId) {
      throw new Error("employeeId is required for CUENTAS_INTERNAS payments");
    }
  }

  static async addPayment(params: {
    saleId: string;
    method: PosPaymentMethod;
    amountCents: number;
    cuentaCorrienteAccountId?: string | null;
    employeeId?: string | null;
  }) {
    this.validatePaymentInput(params);

    return prisma.$transaction(async (tx) => {
      const payment = await tx.posPayment.create({
        data: {
          saleId: params.saleId,
          method: params.method,
          amountCents: params.amountCents,
          cuentaCorrienteAccountId: params.cuentaCorrienteAccountId ?? null,
          employeeId: params.employeeId ?? null,
        },
        include: { sale: { select: { cashSessionId: true } } },
      });
      // Un cobro puede caer en un turno que ya generó sobre (o ya cerró, p.ej. una mesa
      // que se paga en el turno siguiente): el sobre y el consolidado deben reflejarlo.
      if (payment.sale.cashSessionId) {
        await CashSessionService.syncAfterSessionChange(payment.sale.cashSessionId, tx);
      }
      const { sale: _sale, ...rest } = payment;
      return rest;
    });
  }
}

