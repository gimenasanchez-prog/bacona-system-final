import { CostoFijoCategoria } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

function periodStart(period: Date) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
}

function subtractOneMonth(period: Date) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() - 1, 1));
}

const MAX_ARREARS_MONTHS = 36;

// Calcula la racha CONSECUTIVA de meses impagos que termina en `referenceStart`
// (el período elegido en el selector). Corta ni bien encuentra un mes saldado o
// al llegar antes de `validFrom` — no "resucita" deuda vieja ya saldada antes de
// una recaída posterior. Usa el `amountCents` ACTUAL del costo fijo para meses
// pasados (no hay historial de montos), es una aproximación aceptada para
// priorizar pagos, no para contabilidad exacta.
function computeArrears(
  item: { id: string; amountCents: number; validFrom: Date },
  referenceStart: Date,
  paidPeriods: Map<number, number> | undefined
): { pendingSincePeriod: Date | null; periodsOwed: number; totalOwedCents: number } {
  const validFromStart = periodStart(item.validFrom);
  let current = referenceStart;
  let pendingSincePeriod: Date | null = null;
  let periodsOwed = 0;
  let totalOwedCents = 0;

  for (let i = 0; i < MAX_ARREARS_MONTHS; i++) {
    if (current.getTime() < validFromStart.getTime()) break;
    const paid = paidPeriods?.get(current.getTime()) ?? 0;
    const owedCents = item.amountCents - paid;
    if (owedCents <= 0) break;

    pendingSincePeriod = current;
    periodsOwed += 1;
    totalOwedCents += owedCents;
    current = subtractOneMonth(current);
  }

  return { pendingSincePeriod, periodsOwed, totalOwedCents };
}

export class CostosFijosService {
  static async list() {
    return prisma.costoFijo.findMany({
      where: { isActive: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });
  }

  static async create(input: {
    nombre: string;
    categoria: CostoFijoCategoria;
    amountCents: number;
    validFrom: Date;
    notas?: string;
    isRecurring?: boolean;
  }) {
    return prisma.costoFijo.create({
      data: {
        nombre: input.nombre,
        categoria: input.categoria,
        amountCents: input.amountCents,
        validFrom: input.validFrom,
        notas: input.notas ?? null,
        isRecurring: input.isRecurring ?? true,
      },
    });
  }

  static async update(
    id: string,
    input: {
      nombre?: string;
      categoria?: CostoFijoCategoria;
      amountCents?: number;
      notas?: string;
      isRecurring?: boolean;
    }
  ) {
    return prisma.costoFijo.update({ where: { id }, data: input });
  }

  static async deactivate(id: string) {
    return prisma.costoFijo.update({
      where: { id },
      data: { isActive: false, validTo: new Date() },
    });
  }

  static async sumForMonth(monthStart: Date, monthEnd: Date): Promise<number> {
    // Nota: no filtramos por isActive acá — un costo fijo desactivado después de
    // este período igual estuvo vigente durante él (validFrom/validTo ya reflejan
    // la fecha de baja correctamente, filtrar por isActive además excluía mal
    // períodos pasados).
    // Solo recurrentes: una deuda puntual (isRecurring: false) no es un costo
    // mensual que se repita, no debería inflar la base de todos los meses futuros.
    const items = await prisma.costoFijo.findMany({
      where: {
        isRecurring: true,
        validFrom: { lte: monthEnd },
        OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
      },
    });
    return items.reduce((sum, item) => sum + item.amountCents, 0);
  }

  static async getPaymentStatusForMonth(period: Date, filters?: { categoria?: CostoFijoCategoria }) {
    const start = periodStart(period);
    const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));

    // Sin filtro de isActive acá a propósito: lo que importa es si el costo fijo
    // estuvo vigente durante ESTE período (validFrom/validTo), no si sigue activo
    // hoy — si se dio de baja después, igual corresponde mostrarlo para el mes en
    // que estuvo vigente. El estado activo/inactivo actual se devuelve en cada
    // item (costoFijo.isActive) para que la UI lo use como filtro de visualización.
    const items = await prisma.costoFijo.findMany({
      where: {
        validFrom: { lte: monthEnd },
        OR: [{ validTo: null }, { validTo: { gte: start } }],
        ...(filters?.categoria ? { categoria: filters.categoria } : {}),
      },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });

    // Traemos TODOS los pagos históricos de estos costos fijos (sin filtrar por
    // período) para poder calcular la racha de meses impagos hacia atrás, no solo
    // el período seleccionado.
    const allPayments = await prisma.costoFijoPayment.findMany({
      where: { costoFijoId: { in: items.map((i) => i.id) } },
    });
    const paidByCostoFijoId = new Map<string, Map<number, number>>();
    for (const p of allPayments) {
      const perPeriod = paidByCostoFijoId.get(p.costoFijoId) ?? new Map<number, number>();
      const key = p.period.getTime();
      perPeriod.set(key, (perPeriod.get(key) ?? 0) + p.amountCents);
      paidByCostoFijoId.set(p.costoFijoId, perPeriod);
    }

    return items.map((item) => {
      const paidPeriods = paidByCostoFijoId.get(item.id);

      if (!item.isRecurring) {
        // Deuda puntual: vive en un único período fijo (el mes de validFrom),
        // sin importar qué mes esté navegando el selector — nunca se multiplica
        // por los meses transcurridos.
        const fixedPeriod = periodStart(item.validFrom);
        const paidAmountCents = paidPeriods?.get(fixedPeriod.getTime()) ?? 0;
        const owedCents = item.amountCents - paidAmountCents;
        const isPaid = owedCents <= 0;
        return {
          costoFijo: item,
          period: fixedPeriod,
          paidAmountCents,
          isPaid,
          pendingSincePeriod: isPaid ? null : fixedPeriod,
          periodsOwed: isPaid ? 0 : 1,
          totalOwedCents: isPaid ? 0 : owedCents,
        };
      }

      const arrears = computeArrears(item, start, paidPeriods);
      const paidAmountCents = paidPeriods?.get(start.getTime()) ?? 0;
      return {
        costoFijo: item,
        period: start,
        paidAmountCents,
        isPaid: arrears.pendingSincePeriod === null,
        pendingSincePeriod: arrears.pendingSincePeriod,
        periodsOwed: arrears.periodsOwed,
        totalOwedCents: arrears.totalOwedCents,
      };
    });
  }

  static async payPeriod(params: {
    costoFijoId: string;
    period: Date;
    amountCents: number;
    cashBoxId: string;
    employeeId: string;
    skipCashImpact?: boolean;
  }) {
    assertIntCents(params.amountCents, "amountCents");
    if (params.amountCents <= 0) throw new Error("El monto a pagar debe ser mayor a cero.");

    const start = periodStart(params.period);

    return prisma.$transaction(async (tx) => {
      const costoFijo = await tx.costoFijo.findUnique({ where: { id: params.costoFijoId } });
      if (!costoFijo) throw new Error("Costo fijo no encontrado.");

      const existing = await tx.costoFijoPayment.findMany({
        where: { costoFijoId: params.costoFijoId, period: start },
      });
      const alreadyPaidCents = existing.reduce((sum, p) => sum + p.amountCents, 0);
      if (alreadyPaidCents >= costoFijo.amountCents) {
        throw new Error("Este período ya está pagado.");
      }

      if (!params.skipCashImpact) {
        const grouped = await tx.localCashMovement.groupBy({
          by: ["type"],
          where: { localCashBoxId: params.cashBoxId },
          _sum: { amountCents: true },
        });
        const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
        const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
        if (inSum - outSum < params.amountCents) {
          throw new Error("Saldo insuficiente en la caja/cuenta elegida.");
        }
      }

      const payment = await tx.costoFijoPayment.create({
        data: {
          costoFijoId: params.costoFijoId,
          period: start,
          amountCents: params.amountCents,
          cashBoxId: params.cashBoxId,
          createdByEmployeeId: params.employeeId,
        },
      });

      if (!params.skipCashImpact) {
        await tx.localCashMovement.create({
          data: {
            localCashBoxId: params.cashBoxId,
            type: "OUT",
            sourceType: "COSTO_FIJO_PAYMENT",
            relatedCostoFijoPaymentId: payment.id,
            amountCents: params.amountCents,
            date: payment.paidAt,
            description: `${costoFijo.nombre} — período ${start.toISOString().slice(0, 7)}`,
            createdByEmployeeId: params.employeeId,
          },
        });
      }

      return payment;
    });
  }

  static async getPeriodDetail(costoFijoId: string, period: Date) {
    const start = periodStart(period);
    const [costoFijo, payments] = await Promise.all([
      prisma.costoFijo.findUniqueOrThrow({ where: { id: costoFijoId } }),
      prisma.costoFijoPayment.findMany({
        where: { costoFijoId, period: start },
        include: { cashBox: { select: { id: true, name: true } } },
        orderBy: { paidAt: "asc" },
      }),
    ]);
    const paidAmountCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
    return {
      costoFijo,
      payments,
      totalAmountCents: costoFijo.amountCents,
      paidAmountCents,
      remainingCents: costoFijo.amountCents - paidAmountCents,
    };
  }

  static async updatePayment(
    paymentId: string,
    input: Partial<{ amountCents: number; cashBoxId: string; skipCashImpact: boolean }>,
    updatedByEmployeeId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.costoFijoPayment.findUnique({ where: { id: paymentId } });
      if (!existing) throw new Error("Pago no encontrado.");

      const costoFijo = await tx.costoFijo.findUnique({ where: { id: existing.costoFijoId } });
      if (!costoFijo) throw new Error("Costo fijo no encontrado.");

      const hadMovement = !!(await tx.localCashMovement.findFirst({
        where: { relatedCostoFijoPaymentId: paymentId },
        select: { id: true },
      }));
      const previousSkipCashImpact = !hadMovement;

      await tx.localCashMovement.deleteMany({ where: { relatedCostoFijoPaymentId: paymentId } });

      const amountCents = input.amountCents ?? existing.amountCents;
      const cashBoxId = input.cashBoxId ?? existing.cashBoxId;
      const skipCashImpact = input.skipCashImpact ?? previousSkipCashImpact;

      assertIntCents(amountCents, "amountCents");
      if (amountCents <= 0) throw new Error("El monto a pagar debe ser mayor a cero.");

      const others = await tx.costoFijoPayment.findMany({
        where: { costoFijoId: existing.costoFijoId, period: existing.period, id: { not: paymentId } },
      });
      const othersPaidCents = others.reduce((sum, p) => sum + p.amountCents, 0);
      if (othersPaidCents + amountCents > costoFijo.amountCents) {
        throw new Error("El monto supera lo pendiente de este período.");
      }

      if (!skipCashImpact) {
        const grouped = await tx.localCashMovement.groupBy({
          by: ["type"],
          where: { localCashBoxId: cashBoxId },
          _sum: { amountCents: true },
        });
        const inSum = grouped.find((g) => g.type === "IN")?._sum.amountCents ?? 0;
        const outSum = grouped.find((g) => g.type === "OUT")?._sum.amountCents ?? 0;
        if (inSum - outSum < amountCents) {
          throw new Error("Saldo insuficiente en la caja/cuenta elegida.");
        }
      }

      const updated = await tx.costoFijoPayment.update({
        where: { id: paymentId },
        data: { amountCents, cashBoxId, updatedByEmployeeId, updatedAt: new Date() },
      });

      if (!skipCashImpact) {
        await tx.localCashMovement.create({
          data: {
            localCashBoxId: cashBoxId,
            type: "OUT",
            sourceType: "COSTO_FIJO_PAYMENT",
            relatedCostoFijoPaymentId: updated.id,
            amountCents,
            date: updated.paidAt,
            description: `${costoFijo.nombre} — período ${existing.period.toISOString().slice(0, 7)}`,
            createdByEmployeeId: updatedByEmployeeId,
          },
        });
      }

      return updated;
    });
  }

  static async deletePayment(paymentId: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.costoFijoPayment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new Error("Pago no encontrado.");
      await tx.localCashMovement.deleteMany({ where: { relatedCostoFijoPaymentId: paymentId } });
      await tx.costoFijoPayment.delete({ where: { id: paymentId } });
    });
  }

  static async listPaymentsInRange(params: { from: Date; to: Date }) {
    return prisma.costoFijoPayment.findMany({
      where: { paidAt: { gte: params.from, lte: params.to } },
      include: {
        costoFijo: { select: { nombre: true, categoria: true } },
        cashBox: { select: { name: true } },
        createdByEmployee: { select: { displayName: true } },
      },
      orderBy: { paidAt: "asc" },
    });
  }
}
