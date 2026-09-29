import { PosPaymentMethod, Prisma } from "@prisma/client";

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
    /** Turno abierto de quien cobra (cookie). El cobro va a este turno, que es donde está la plata. */
    currentCashSessionId?: string | null;
  }) {
    this.validatePaymentInput(params);

    return prisma.$transaction(async (tx) => {
      const cashSessionId = await this.resolvePaymentCashSession(tx, params);

      // La facturación de CC busca las ventas por posSale.cuentaCorrienteAccountId. Si la
      // cuenta se eligió solo en el panel de pago, la venta quedaba sin cuenta y nunca se
      // facturaba: la venta toma la cuenta del pago.
      if (params.method === "CUENTA_CORRIENTE" && params.cuentaCorrienteAccountId) {
        const sale = await tx.posSale.findUnique({
          where: { id: params.saleId },
          select: { cuentaCorrienteAccountId: true },
        });
        if (!sale) throw new Error("Venta no encontrada");
        if (!sale.cuentaCorrienteAccountId) {
          await tx.posSale.update({
            where: { id: params.saleId },
            data: { cuentaCorrienteAccountId: params.cuentaCorrienteAccountId },
          });
        } else if (sale.cuentaCorrienteAccountId !== params.cuentaCorrienteAccountId) {
          throw new Error("La venta está asignada a otra cuenta corriente. Revisá la cuenta elegida.");
        }
      }

      const payment = await tx.posPayment.create({
        data: {
          saleId: params.saleId,
          method: params.method,
          amountCents: params.amountCents,
          cuentaCorrienteAccountId: params.cuentaCorrienteAccountId ?? null,
          employeeId: params.employeeId ?? null,
        },
      });
      if (cashSessionId) {
        await CashSessionService.syncAfterSessionChange(cashSessionId, tx);
      }
      return payment;
    });
  }

  /**
   * El cobro va al turno de quien cobra, no al que abrió la venta (una mesa que pasó de turno,
   * una reserva cobrada otro día). Si la venta todavía no tiene cobros, pasa al turno actual.
   * Con cobros previos en otro turno se rechaza: un mismo cobro no puede quedar repartido entre
   * dos sobres. Tampoco se cobra en un turno cerrado ni en efectivo con el sobre ya sellado.
   */
  private static async resolvePaymentCashSession(
    tx: Prisma.TransactionClient,
    params: { saleId: string; method: PosPaymentMethod; currentCashSessionId?: string | null }
  ) {
    const sale = await tx.posSale.findUnique({
      where: { id: params.saleId },
      select: { cashSessionId: true, _count: { select: { payments: true } } },
    });
    if (!sale) throw new Error("Venta no encontrada");

    let cashSessionId = sale.cashSessionId;
    const current = params.currentCashSessionId ?? null;
    if (current && current !== sale.cashSessionId) {
      if (sale._count.payments > 0) {
        throw new Error("Esta venta ya tiene cobros en otro turno: hay que terminar de cobrarla en ese turno.");
      }
      await tx.posSale.update({
        where: { id: params.saleId },
        data: {
          cashSessionId: current,
          ...(sale.cashSessionId ? { transferredFromCashSessionId: sale.cashSessionId } : {}),
        },
      });
      cashSessionId = current;
    }

    if (cashSessionId) {
      const session = await tx.cashSession.findUnique({
        where: { id: cashSessionId },
        select: { status: true, envelope: { select: { id: true } } },
      });
      if (session?.status === "CLOSED") {
        throw new Error("Esta venta es de un turno cerrado. Abrí tu turno para cobrarla.");
      }
      if (params.method === "EFECTIVO" && session?.envelope) {
        throw new Error("El sobre de este turno ya está sellado: no se puede cobrar más efectivo. Cerrá el turno y abrí uno nuevo.");
      }
    }
    return cashSessionId;
  }
}

