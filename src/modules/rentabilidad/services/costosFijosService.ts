import { CostoFijoCategoria } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIntCents } from "@/lib/money";

function periodStart(period: Date) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
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
  }) {
    return prisma.costoFijo.create({
      data: {
        nombre: input.nombre,
        categoria: input.categoria,
        amountCents: input.amountCents,
        validFrom: input.validFrom,
        notas: input.notas ?? null,
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
    const items = await prisma.costoFijo.findMany({
      where: {
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

    const allPayments = await prisma.costoFijoPayment.findMany({
      where: { period: start, costoFijoId: { in: items.map((i) => i.id) } },
    });
    const paidByCostoFijoId = new Map<string, number>();
    for (const p of allPayments) {
      paidByCostoFijoId.set(p.costoFijoId, (paidByCostoFijoId.get(p.costoFijoId) ?? 0) + p.amountCents);
    }

    return items.map((item) => {
      const paidAmountCents = paidByCostoFijoId.get(item.id) ?? 0;
      return {
        costoFijo: item,
        period: start,
        paidAmountCents,
        isPaid: paidAmountCents >= item.amountCents,
      };
    });
  }

  static async payPeriod(params: {
    costoFijoId: string;
    period: Date;
    amountCents: number;
    cashBoxId: string;
    employeeId: string;
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

      const payment = await tx.costoFijoPayment.create({
        data: {
          costoFijoId: params.costoFijoId,
          period: start,
          amountCents: params.amountCents,
          cashBoxId: params.cashBoxId,
          createdByEmployeeId: params.employeeId,
        },
      });

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

      return payment;
    });
  }
}
