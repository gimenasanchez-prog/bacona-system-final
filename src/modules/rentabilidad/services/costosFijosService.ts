import { CostoFijoCategoria, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";
import { HoursService } from "@/modules/horas/services/hoursService";

function periodStart(period: Date) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
}

function subtractOneMonth(period: Date) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() - 1, 1));
}

const MAX_ARREARS_MONTHS = 36;

// Monto "objetivo" del mes para un costo fijo: el `amountCents` fijo cargado,
// salvo que el ítem esté `linkedToHoras` (hoy solo "Sueldos Operativos"), en
// cuyo caso se ignora ese campo (queda sin usar) y se lee en vivo lo que el
// módulo de Horas dice que se debe a los empleados operativos.
//
// Sueldos operativos se pagan mes VENCIDO: lo que Costos Fijos pide pagar en
// el período X es lo que se acumuló en Horas durante el mes ANTERIOR (X - 1),
// no en X. Ej.: lo trabajado en agosto se paga como costo fijo de septiembre.
async function getTargetAmountCents(
  item: { amountCents: number; linkedToHoras: boolean },
  period: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (!item.linkedToHoras) return item.amountCents;
  return HoursService.totalOwedForPeriod(subtractOneMonth(periodStart(period)), db);
}

// Calcula la racha CONSECUTIVA de meses impagos que termina en `referenceStart`
// (el período elegido en el selector). Corta ni bien encuentra un mes saldado o
// al llegar antes de `validFrom` — no "resucita" deuda vieja ya saldada antes de
// una recaída posterior. Para costos fijos normales usa el `amountCents` ACTUAL
// del costo fijo para meses pasados (no hay historial de montos, aproximación
// aceptada para priorizar pagos, no para contabilidad exacta); para ítems
// `linkedToHoras` el monto de cada mes se recalcula en vivo desde Horas (ahí sí
// es exacto, ya que Horas mantiene un valor real por mes).
async function computeArrears(
  item: { id: string; amountCents: number; validFrom: Date; linkedToHoras: boolean },
  referenceStart: Date,
  paidPeriods: Map<number, number> | undefined
): Promise<{ pendingSincePeriod: Date | null; periodsOwed: number; totalOwedCents: number; currentPeriodAmountCents: number }> {
  const validFromStart = periodStart(item.validFrom);
  let current = referenceStart;
  let pendingSincePeriod: Date | null = null;
  let periodsOwed = 0;
  let totalOwedCents = 0;
  let currentPeriodAmountCents = 0;

  for (let i = 0; i < MAX_ARREARS_MONTHS; i++) {
    if (current.getTime() < validFromStart.getTime()) break;
    const targetCents = await getTargetAmountCents(item, current);
    if (current.getTime() === referenceStart.getTime()) currentPeriodAmountCents = targetCents;
    const paid = paidPeriods?.get(current.getTime()) ?? 0;
    const owedCents = targetCents - paid;
    if (owedCents <= 0) break;

    pendingSincePeriod = current;
    periodsOwed += 1;
    totalOwedCents += owedCents;
    current = subtractOneMonth(current);
  }

  return { pendingSincePeriod, periodsOwed, totalOwedCents, currentPeriodAmountCents };
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
    let total = 0;
    for (const item of items) {
      total += await getTargetAmountCents(item, monthStart);
    }
    return total;
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

    return Promise.all(
      items.map(async (item) => {
        const paidPeriods = paidByCostoFijoId.get(item.id);

        if (!item.isRecurring) {
          // Deuda puntual: vive en un único período fijo (el mes de validFrom),
          // sin importar qué mes esté navegando el selector — nunca se multiplica
          // por los meses transcurridos. (No aplica a ítems linkedToHoras.)
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

        const arrears = await computeArrears(item, start, paidPeriods);
        const paidAmountCents = paidPeriods?.get(start.getTime()) ?? 0;
        return {
          costoFijo: { ...item, amountCents: arrears.currentPeriodAmountCents },
          period: start,
          paidAmountCents,
          isPaid: arrears.pendingSincePeriod === null,
          pendingSincePeriod: arrears.pendingSincePeriod,
          periodsOwed: arrears.periodsOwed,
          totalOwedCents: arrears.totalOwedCents,
        };
      })
    );
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

      const targetCents = await getTargetAmountCents(costoFijo, start, tx);

      const existing = await tx.costoFijoPayment.findMany({
        where: { costoFijoId: params.costoFijoId, period: start },
      });
      const alreadyPaidCents = existing.reduce((sum, p) => sum + p.amountCents, 0);
      if (alreadyPaidCents >= targetCents) {
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

      // Si este ítem lee su monto de Horas y con este pago quedó saldado el mes
      // completo, congelar a todos los empleados operativos del mes de Horas
      // que este pago está saldando (el ANTERIOR al período del costo fijo,
      // ya que se paga mes vencido) — reemplaza al viejo botón "Marcar pagado".
      if (costoFijo.linkedToHoras && alreadyPaidCents + params.amountCents >= targetCents) {
        await HoursService.freezeAllForPeriod(subtractOneMonth(start), params.employeeId, tx);
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
    const totalAmountCents = await getTargetAmountCents(costoFijo, start);
    return {
      costoFijo,
      payments,
      totalAmountCents,
      paidAmountCents,
      remainingCents: totalAmountCents - paidAmountCents,
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
      const targetCents = await getTargetAmountCents(costoFijo, existing.period, tx);
      if (othersPaidCents + amountCents > targetCents) {
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

      if (costoFijo.linkedToHoras && othersPaidCents + amountCents >= targetCents) {
        await HoursService.freezeAllForPeriod(subtractOneMonth(existing.period), updatedByEmployeeId, tx);
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
