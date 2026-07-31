import { prisma } from "@/lib/prisma";

function monthBounds(month: Date): {
  start: Date;
  end: Date;
  daysInMonth: number;
} {
  const y = month.getFullYear();
  const m = month.getMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return { start, end, daysInMonth };
}

export class RentabilidadService {
  static async getAnalisisMensual(month: Date) {
    const { start, end, daysInMonth } = monthBounds(month);

    // POS revenue
    const posAgg = await prisma.posSale.aggregate({
      _sum: { totalCents: true },
      where: {
        status: { in: ["CONFIRMED", "PAID"] },
        cashSession: { businessDate: { gte: start, lte: end } },
      },
    });
    const posRevenue = posAgg._sum.totalCents ?? 0;

    // CC revenue (invoices issued this month)
    const ccAgg = await prisma.cuentaCorrienteInvoice.aggregate({
      _sum: { totalAmountCents: true },
      where: { billingDate: { gte: start, lte: end } },
    });
    const ccRevenue = ccAgg._sum.totalAmountCents ?? 0;
    const ingresoReal = posRevenue + ccRevenue;

    // COGS from sale items × category margin %
    const saleItems = await prisma.posSaleItem.findMany({
      where: {
        sale: {
          status: { in: ["CONFIRMED", "PAID"] },
          cashSession: { businessDate: { gte: start, lte: end } },
        },
      },
      include: {
        product: {
          include: {
            category: { include: { margenConfig: true } },
          },
        },
      },
    });

    let cogsEstimado = 0;
    let cogsCoveredRevenue = 0;
    for (const item of saleItems) {
      const pct = item.product.category.margenConfig?.cogsPercent;
      if (pct != null) {
        cogsEstimado += Math.round(item.lineTotalCents * (Number(pct) / 100));
        cogsCoveredRevenue += item.lineTotalCents;
      }
    }
    // Effective COGS % based on categorized revenue
    const cogsEffPct = cogsCoveredRevenue > 0 ? cogsEstimado / cogsCoveredRevenue : 0;

    // Variable costs
    const varAgg = await prisma.localExpense.aggregate({
      _sum: { amountCents: true },
      where: { date: { gte: start, lte: end } },
    });
    const costosVariables = varAgg._sum.amountCents ?? 0;

    // Fixed costs (monthly amounts active this month)
    const fixedItems = await prisma.costoFijo.findMany({
      where: {
        isActive: true,
        validFrom: { lte: end },
        OR: [{ validTo: null }, { validTo: { gte: start } }],
      },
    });
    const costosFijos = fixedItems.reduce((s, f) => s + f.amountCents, 0);

    // Break-even: R_eq = (F + V) / (1 - cogsEff)
    const denominador = 1 - cogsEffPct;
    const puntoEquilibrio =
      denominador > 0.01
        ? Math.round((costosFijos + costosVariables) / denominador)
        : null;
    const targetDiario =
      puntoEquilibrio != null
        ? Math.round(puntoEquilibrio / daysInMonth)
        : null;
    const brecha =
      puntoEquilibrio != null ? ingresoReal - puntoEquilibrio : null;
    const pctEquilibrio =
      puntoEquilibrio != null && puntoEquilibrio > 0
        ? Math.round((ingresoReal / puntoEquilibrio) * 100)
        : null;

    return {
      posRevenue,
      ccRevenue,
      ingresoReal,
      cogsEstimado,
      cogsEffPct: Math.round(cogsEffPct * 10000) / 100, // e.g. 35.50
      costosVariables,
      costosFijos,
      puntoEquilibrio,
      targetDiario,
      brecha,
      pctEquilibrio,
      daysInMonth,
    };
  }

  static async getBrechaDiaria(month: Date) {
    const { start, end } = monthBounds(month);
    const analisis = await RentabilidadService.getAnalisisMensual(month);

    const sessions = await prisma.cashSession.findMany({
      where: { businessDate: { gte: start, lte: end } },
      include: {
        sales: {
          where: { status: { in: ["CONFIRMED", "PAID"] } },
          select: { totalCents: true },
        },
      },
    });

    const dayMap: Record<string, number> = {};
    for (const session of sessions) {
      const key = session.businessDate.toISOString().slice(0, 10);
      dayMap[key] =
        (dayMap[key] ?? 0) +
        session.sales.reduce((s, sale) => s + sale.totalCents, 0);
    }

    const series = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ingresoReal]) => ({
        date,
        ingresoReal,
        targetDiario: analisis.targetDiario ?? 0,
        brecha: ingresoReal - (analisis.targetDiario ?? 0),
      }));

    return { series, targetDiario: analisis.targetDiario };
  }

  static async getPalancas(month: Date) {
    const { start, end } = monthBounds(month);
    const a = await RentabilidadService.getAnalisisMensual(month);

    const grossMargin = a.ingresoReal - a.cogsEstimado;

    const txCount = await prisma.posSale.count({
      where: {
        status: { in: ["CONFIRMED", "PAID"] },
        cashSession: { businessDate: { gte: start, lte: end } },
      },
    });
    const avgTicket = txCount > 0 ? Math.round(a.posRevenue / txCount) : 0;

    const DELTA = 0.1;

    return [
      {
        key: "precio",
        label: "Precio promedio de venta",
        valorActual: avgTicket,
        unidad: "ARS/venta",
        descripcion: `Ticket promedio sobre ${txCount} transacciones POS`,
        impacto: "Si subís el precio promedio un 10%",
        deltaMensual: Math.round(grossMargin * DELTA),
      },
      {
        key: "volumen",
        label: "Transacciones mensuales",
        valorActual: txCount,
        unidad: "ventas",
        descripcion: "Cantidad de ventas POS confirmadas",
        impacto: "Si atendés un 10% más de clientes",
        deltaMensual: Math.round(grossMargin * DELTA),
      },
      {
        key: "costos_variables",
        label: "Egresos operativos variables",
        valorActual: a.costosVariables,
        unidad: "ARS/mes",
        descripcion: "Egresos locales del período",
        impacto: "Si reducís los egresos variables un 10%",
        deltaMensual: Math.round(a.costosVariables * DELTA),
      },
      {
        key: "costos_fijos",
        label: "Costos fijos mensuales",
        valorActual: a.costosFijos,
        unidad: "ARS/mes",
        descripcion: "Alquiler, salarios, servicios fijos",
        impacto: "Si reducís los costos fijos un 10%",
        deltaMensual: Math.round(a.costosFijos * DELTA),
      },
    ];
  }

  static async getEscenarios(nextMonth: Date) {
    const { start: nextStart, end: nextEnd } = monthBounds(nextMonth);

    // Trailing 3 months
    const trailingStart = new Date(
      Date.UTC(nextMonth.getFullYear(), nextMonth.getMonth() - 3, 1)
    );
    const trailingEnd = new Date(
      Date.UTC(nextMonth.getFullYear(), nextMonth.getMonth(), 0, 23, 59, 59, 999)
    );

    const [posTrailing, ccTrailing, varTrailing] = await Promise.all([
      prisma.posSale.aggregate({
        _sum: { totalCents: true },
        where: {
          status: { in: ["CONFIRMED", "PAID"] },
          cashSession: { businessDate: { gte: trailingStart, lte: trailingEnd } },
        },
      }),
      prisma.cuentaCorrienteInvoice.aggregate({
        _sum: { totalAmountCents: true },
        where: { billingDate: { gte: trailingStart, lte: trailingEnd } },
      }),
      prisma.localExpense.aggregate({
        _sum: { amountCents: true },
        where: { date: { gte: trailingStart, lte: trailingEnd } },
      }),
    ]);

    const avgRevenue = Math.round(
      ((posTrailing._sum.totalCents ?? 0) +
        (ccTrailing._sum.totalAmountCents ?? 0)) /
        3
    );
    const avgVarCosts = Math.round(
      (varTrailing._sum.amountCents ?? 0) / 3
    );

    // Fixed costs for next month
    const fixedItems = await prisma.costoFijo.findMany({
      where: {
        isActive: true,
        validFrom: { lte: nextEnd },
        OR: [{ validTo: null }, { validTo: { gte: nextStart } }],
      },
    });
    const costosFijos = fixedItems.reduce((s, f) => s + f.amountCents, 0);

    // COGS eff % from last month
    const lastMonth = new Date(
      Date.UTC(nextMonth.getFullYear(), nextMonth.getMonth() - 1, 1)
    );
    const lastAnalisis = await RentabilidadService.getAnalisisMensual(lastMonth);
    const cogsEffPct = lastAnalisis.cogsEffPct / 100;

    const buildScenario = (revMult: number, varMult: number) => {
      const revenue = Math.round(avgRevenue * revMult);
      const cogs = Math.round(revenue * cogsEffPct);
      const varCosts = Math.round(avgVarCosts * varMult);
      const totalCosts = cogs + varCosts + costosFijos;
      const resultado = revenue - totalCosts;
      return { revenue, cogs, varCosts, costosFijos, totalCosts, resultado };
    };

    const denominador = 1 - cogsEffPct;
    const puntoEquilibrio =
      denominador > 0.01
        ? Math.round((costosFijos + avgVarCosts) / denominador)
        : null;

    return {
      avgRevenue,
      avgVarCosts,
      costosFijos,
      conservador: buildScenario(0.8, 1.0),
      base: buildScenario(1.0, 1.0),
      optimista: buildScenario(1.2, 1.0),
      puntoEquilibrio,
    };
  }
}
