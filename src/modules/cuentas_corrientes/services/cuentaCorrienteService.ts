import { prisma } from "@/lib/prisma";
import { BillingCycle, CcDirectChargeCategory } from "@prisma/client";

export type BillingPeriod = { from: Date; to: Date };

function getPeriodForDate(date: Date, cycle: BillingCycle): BillingPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (cycle === "MENSUAL") {
    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }

  // QUINCENAL: Q1 = 1–15, Q2 = 16–fin de mes
  if (day <= 15) {
    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 15, 23, 59, 59, 999);
    return { from, to };
  } else {
    const from = new Date(year, month, 16, 0, 0, 0, 0);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
}

function periodKey(from: Date): string {
  return from.toISOString().split("T")[0];
}

export type UnbilledSale = {
  id: string;
  totalCents: number;
  ccAmountCents: number;
  createdAt: Date;
  comandaNumber: string | null;
  items: { qty: number; productName: string; modifiers: string[] }[];
};

export type DirectCharge = {
  id: string;
  date: Date;
  description: string;
  motive: string;
  category: CcDirectChargeCategory;
  amountCents: number;
  comandaNumber: string | null;
  createdAt: Date;
};

export type InvoiceSummary = {
  id: string;
  periodFrom: Date;
  periodTo: Date;
  billingDate: Date;
  estimatedPaymentDate: Date;
  arcaFacturaNumber: string | null;
  subtotalCents: number;
  ivaExento: boolean;
  ivaDiscriminado: boolean;
  ivaAmountCents: number;
  bankWithholdingCents: number;
  bankFeesCents: number;
  ivaRetentionCents: number;
  gananciasRetentionCents: number;
  rentasRetentionCents: number;
  sussRetentionCents: number;
  tisshRetentionCents: number;
  totalAmountCents: number;
  isPaid: boolean;
  paidAt: Date | null;
  paidAmountCents: number;
  paymentDate: Date | null;
  paymentReference: string | null;
  digitalInvoiceUrl: string | null;
  notes: string | null;
  salesCount: number;
};

export type PeriodSummary = {
  period: BillingPeriod;
  isCurrentPeriod: boolean;
  sales: UnbilledSale[];
  directCharges: DirectCharge[];
  totalConsumptionCents: number;
  invoice: InvoiceSummary | null;
};

export type AccountWithBillingState = {
  id: string;
  customerId: string;
  customerName: string;
  planCode: string | null;
  billingCycle: BillingCycle;
  currentPeriod: BillingPeriod;
  periods: PeriodSummary[];
  // Dashboard chips
  unbilledTotalCents: number;
  unbilledClosedCents: number;      // períodos cerrados sin facturar (listos)
  unbilledOpenCents: number;        // período actual abierto sin facturar
  pendingInvoicesTotalCents: number;
  pendingDueSoonCents: number;      // vence dentro de esta quincena calendario
  pendingDueLaterCents: number;     // vence en quincena siguiente o más
  overdueInvoicesTotalCents: number;
  cobradoCents: number;             // paidAmountCents de facturas isPaid=true
  retencionesCobradoCents: number;  // retenciones impositivas en facturas pagadas
  paidAmountActiveCents: number;
  totalRetencionesCents: number;
};

export type CreateInvoiceParams = {
  periodFrom: Date;
  periodTo: Date;
  estimatedPaymentDate: Date;
  arcaFacturaNumber?: string;
  ivaExento: boolean;
  ivaDiscriminado: boolean;
  ivaAmountCents: number;
  notes?: string;
  digitalInvoiceUrl?: string | null;
};

export type InvoiceDetail = {
  invoice: {
    id: string;
    periodFrom: Date;
    periodTo: Date;
    billingDate: Date;
    estimatedPaymentDate: Date;
    arcaFacturaNumber: string | null;
    subtotalCents: number;
    ivaExento: boolean;
    ivaDiscriminado: boolean;
    ivaAmountCents: number;
    bankWithholdingCents: number;
    bankFeesCents: number;
    ivaRetentionCents: number;
    gananciasRetentionCents: number;
    rentasRetentionCents: number;
    totalAmountCents: number;
    isPaid: boolean;
    paidAt: Date | null;
    paidAmountCents: number;
    paymentDate: Date | null;
    paymentReference: string | null;
    digitalInvoiceUrl: string | null;
    notes: string | null;
  };
  account: {
    customerName: string;
    planCode: string | null;
    billingCycle: BillingCycle;
  };
  sales: {
    id: string;
    createdAt: Date;
    totalCents: number;
    ccAmountCents: number;
    items: { qty: number; productName: string; unitPriceCents: number; lineTotalCents: number; modifiers: string[] }[];
  }[];
};

function buildInvoiceSummary(inv: {
  id: string;
  periodFrom: Date;
  periodTo: Date;
  billingDate: Date;
  estimatedPaymentDate: Date;
  arcaFacturaNumber: string | null;
  subtotalCents: number;
  ivaExento: boolean;
  ivaDiscriminado: boolean;
  ivaAmountCents: number;
  bankWithholdingCents: number;
  bankFeesCents: number;
  ivaRetentionCents: number;
  gananciasRetentionCents: number;
  rentasRetentionCents: number;
  sussRetentionCents: number;
  tisshRetentionCents: number;
  totalAmountCents: number;
  isPaid: boolean;
  paidAt: Date | null;
  paidAmountCents: number;
  paymentDate: Date | null;
  paymentReference: string | null;
  digitalInvoiceUrl: string | null;
  notes: string | null;
  sales: { id: string }[];
}): InvoiceSummary {
  return {
    id: inv.id,
    periodFrom: inv.periodFrom,
    periodTo: inv.periodTo,
    billingDate: inv.billingDate,
    estimatedPaymentDate: inv.estimatedPaymentDate,
    arcaFacturaNumber: inv.arcaFacturaNumber,
    subtotalCents: inv.subtotalCents,
    ivaExento: inv.ivaExento,
    ivaDiscriminado: inv.ivaDiscriminado,
    ivaAmountCents: inv.ivaAmountCents,
    bankWithholdingCents: inv.bankWithholdingCents,
    bankFeesCents: inv.bankFeesCents,
    ivaRetentionCents: inv.ivaRetentionCents,
    gananciasRetentionCents: inv.gananciasRetentionCents,
    rentasRetentionCents: inv.rentasRetentionCents,
    sussRetentionCents: inv.sussRetentionCents,
    tisshRetentionCents: inv.tisshRetentionCents,
    totalAmountCents: inv.totalAmountCents,
    isPaid: inv.isPaid,
    paidAt: inv.paidAt,
    paidAmountCents: inv.paidAmountCents,
    paymentDate: inv.paymentDate,
    paymentReference: inv.paymentReference,
    digitalInvoiceUrl: inv.digitalInvoiceUrl,
    notes: inv.notes,
    salesCount: inv.sales.length,
  };
}

export class CuentaCorrienteService {
  static async getAccountsWithBillingState(): Promise<AccountWithBillingState[]> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Cuentas "raíz" (no facturan a través de otra cuenta). Las cuentas satélite
    // (billsToAccountId != null, ej. Posco Enc Arg/Kor) se usan en el POS para
    // elegir tarifa, pero su consumo se consolida acá bajo la cuenta padre.
    const rootAccounts = await prisma.cuentaCorrienteAccount.findMany({
      where: { isActive: true, billsToAccountId: null },
      include: {
        customer: { select: { displayName: true } },
        satelliteAccounts: { select: { id: true } },
      },
      orderBy: { customer: { displayName: "asc" } },
    });

    const accountIdGroups = rootAccounts.map((acc) => ({
      acc,
      accountIds: [acc.id, ...acc.satelliteAccounts.map((s) => s.id)],
    }));
    const allAccountIds = accountIdGroups.flatMap((g) => g.accountIds);

    const [allInvoicesFlat, allSalesFlat, allDirectChargesFlat] = await Promise.all([
      // Traer TODAS las facturas (pagadas y no pagadas), de la cuenta raíz y sus satélites
      prisma.cuentaCorrienteInvoice.findMany({
        where: { accountId: { in: allAccountIds } },
        orderBy: { periodFrom: "desc" },
        include: { sales: { select: { id: true } } },
      }),
      // Traer TODAS las ventas de CC (sin filtro de fecha ni de factura), de la cuenta raíz y sus satélites
      prisma.posSale.findMany({
        where: {
          cuentaCorrienteAccountId: { in: allAccountIds },
          status: { in: ["CONFIRMED", "PAID"] },
        },
        include: {
          items: {
            select: {
              qty: true,
              product: { select: { name: true } },
              modifiers: { include: { modifierOption: { select: { name: true } } } },
            },
          },
          payments: {
            where: { method: "CUENTA_CORRIENTE" },
            select: { amountCents: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ccDirectCharge.findMany({
        where: { cuentaCorrienteAccountId: { in: allAccountIds } },
        orderBy: { date: "desc" },
      }),
    ]);

    return accountIdGroups.map(({ acc, accountIds }) => {
      const cycle = acc.billingCycle;
      const currentPeriod = getPeriodForDate(now, cycle);

      const accInvoices = allInvoicesFlat.filter((inv) => accountIds.includes(inv.accountId));
      const accSalesRaw = allSalesFlat.filter(
        (s) => s.cuentaCorrienteAccountId && accountIds.includes(s.cuentaCorrienteAccountId)
      );
      const accDirectChargesRaw = allDirectChargesFlat.filter((c) => accountIds.includes(c.cuentaCorrienteAccountId));

      // Convertir ventas a UnbilledSale
      const allSales: UnbilledSale[] = accSalesRaw.map((s) => ({
        id: s.id,
        totalCents: s.totalCents,
        ccAmountCents: s.payments.reduce((sum, p) => sum + p.amountCents, 0),
        createdAt: s.createdAt,
        comandaNumber: s.comandaNumber,
        items: s.items.map((i) => ({
          qty: i.qty,
          productName: i.product.name,
          modifiers: i.modifiers.map((m) => m.modifierOption.name),
        })),
      }));

      const allDirectCharges: DirectCharge[] = accDirectChargesRaw.map((c) => ({
        id: c.id,
        date: c.date,
        description: c.description,
        motive: c.motive,
        category: c.category,
        amountCents: c.amountCents,
        comandaNumber: c.comandaNumber,
        createdAt: c.createdAt,
      }));

      // Construir mapa de facturas por período (key = periodFrom ISO date)
      const invoiceByPeriodKey = new Map<string, InvoiceSummary>();
      for (const inv of accInvoices) {
        const key = periodKey(inv.periodFrom);
        // Si hay múltiples facturas para el mismo período (edge case), guardar la más reciente
        if (!invoiceByPeriodKey.has(key)) {
          invoiceByPeriodKey.set(key, buildInvoiceSummary(inv));
        }
      }

      // Construir set de todos los períodos con actividad
      const periodKeys = new Set<string>();

      // Períodos de ventas
      for (const sale of allSales) {
        const p = getPeriodForDate(sale.createdAt, cycle);
        periodKeys.add(periodKey(p.from));
      }

      // Períodos de cargos directos
      for (const charge of allDirectCharges) {
        const p = getPeriodForDate(charge.date, cycle);
        periodKeys.add(periodKey(p.from));
      }

      // Períodos de facturas
      for (const inv of accInvoices) {
        periodKeys.add(periodKey(inv.periodFrom));
      }

      // Siempre incluir el período actual
      periodKeys.add(periodKey(currentPeriod.from));

      // Construir PeriodSummary[] para cada período
      const currentKey = periodKey(currentPeriod.from);
      const periods: PeriodSummary[] = Array.from(periodKeys)
        .map((key) => {
          const period = getPeriodForDate(new Date(key + "T12:00:00.000Z"), cycle);
          const periodSales = allSales.filter(
            (s) => s.createdAt >= period.from && s.createdAt <= period.to
          );
          const periodCharges = allDirectCharges.filter(
            (c) => c.date >= period.from && c.date <= period.to
          );
          const invoice = invoiceByPeriodKey.get(key) ?? null;
          const totalConsumptionCents =
            periodSales.reduce((s, x) => s + x.ccAmountCents, 0) +
            periodCharges.reduce((s, x) => s + x.amountCents, 0);
          return {
            period,
            isCurrentPeriod: key === currentKey,
            sales: periodSales,
            directCharges: periodCharges,
            totalConsumptionCents,
            invoice,
          };
        })
        // Ordenar más reciente primero
        .sort((a, b) => b.period.from.getTime() - a.period.from.getTime());

      // Fin de la quincena calendario actual (para split de ADEUDADO)
      const todayDay = now.getDate();
      const endOfCurrentFortnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        todayDay <= 15 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        23, 59, 59, 999
      );

      // Dashboard chips
      let unbilledTotalCents = 0;
      let unbilledClosedCents = 0;
      let unbilledOpenCents = 0;
      let pendingInvoicesTotalCents = 0;
      let pendingDueSoonCents = 0;
      let pendingDueLaterCents = 0;
      let overdueInvoicesTotalCents = 0;
      let cobradoCents = 0;
      let retencionesCobradoCents = 0;
      let paidAmountActiveCents = 0;
      let totalRetencionesCents = 0;

      for (const p of periods) {
        if (!p.invoice) {
          unbilledTotalCents += p.totalConsumptionCents;
          if (p.isCurrentPeriod) {
            unbilledOpenCents += p.totalConsumptionCents;
          } else {
            unbilledClosedCents += p.totalConsumptionCents;
          }
        } else {
          const inv = p.invoice;
          if (!inv.isPaid) {
            const outstanding = inv.totalAmountCents - inv.paidAmountCents;
            if (inv.estimatedPaymentDate <= today) {
              overdueInvoicesTotalCents += outstanding;
            } else {
              pendingInvoicesTotalCents += outstanding;
              if (inv.estimatedPaymentDate <= endOfCurrentFortnight) {
                pendingDueSoonCents += outstanding;
              } else {
                pendingDueLaterCents += outstanding;
              }
            }
            if (inv.paidAmountCents > 0) {
              paidAmountActiveCents += inv.paidAmountCents;
            }
            totalRetencionesCents +=
              inv.bankWithholdingCents +
              inv.bankFeesCents +
              inv.ivaRetentionCents +
              inv.gananciasRetentionCents +
              inv.rentasRetentionCents;
          } else {
            cobradoCents += inv.paidAmountCents;
            retencionesCobradoCents +=
              inv.ivaRetentionCents +
              inv.gananciasRetentionCents +
              inv.rentasRetentionCents +
              inv.sussRetentionCents +
              inv.tisshRetentionCents;
          }
        }
      }

      return {
        id: acc.id,
        customerId: acc.customerId,
        customerName: acc.customer.displayName,
        planCode: acc.planCode,
        billingCycle: acc.billingCycle,
        currentPeriod,
        periods,
        unbilledTotalCents,
        unbilledClosedCents,
        unbilledOpenCents,
        pendingInvoicesTotalCents,
        pendingDueSoonCents,
        pendingDueLaterCents,
        overdueInvoicesTotalCents,
        cobradoCents,
        retencionesCobradoCents,
        paidAmountActiveCents,
        totalRetencionesCents,
      };
    });
  }

  static async getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
    const inv = await prisma.cuentaCorrienteInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        account: { include: { customer: { select: { displayName: true } } } },
        sales: {
          include: {
            items: {
              select: {
                qty: true,
                unitPriceCents: true,
                lineTotalCents: true,
                product: { select: { name: true } },
                modifiers: { include: { modifierOption: { select: { name: true } } } },
              },
            },
            payments: {
              where: { method: "CUENTA_CORRIENTE" },
              select: { amountCents: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return {
      invoice: {
        id: inv.id,
        periodFrom: inv.periodFrom,
        periodTo: inv.periodTo,
        billingDate: inv.billingDate,
        estimatedPaymentDate: inv.estimatedPaymentDate,
        arcaFacturaNumber: inv.arcaFacturaNumber,
        subtotalCents: inv.subtotalCents,
        ivaExento: inv.ivaExento,
        ivaDiscriminado: inv.ivaDiscriminado,
        ivaAmountCents: inv.ivaAmountCents,
        bankWithholdingCents: inv.bankWithholdingCents,
        bankFeesCents: inv.bankFeesCents,
        ivaRetentionCents: inv.ivaRetentionCents,
        gananciasRetentionCents: inv.gananciasRetentionCents,
        rentasRetentionCents: inv.rentasRetentionCents,
        totalAmountCents: inv.totalAmountCents,
        isPaid: inv.isPaid,
        paidAt: inv.paidAt,
        paidAmountCents: inv.paidAmountCents,
        paymentDate: inv.paymentDate,
        paymentReference: inv.paymentReference,
        digitalInvoiceUrl: inv.digitalInvoiceUrl,
        notes: inv.notes,
      },
      account: {
        customerName: inv.account.customer.displayName,
        planCode: inv.account.planCode,
        billingCycle: inv.account.billingCycle,
      },
      sales: inv.sales.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        totalCents: s.totalCents,
        ccAmountCents: s.payments.reduce((sum, p) => sum + p.amountCents, 0),
        items: s.items.map((i) => ({
          qty: i.qty,
          productName: i.product.name,
          unitPriceCents: i.unitPriceCents,
          lineTotalCents: i.lineTotalCents,
          modifiers: i.modifiers.map((m) => m.modifierOption.name),
        })),
      })),
    };
  }

  static async createInvoice(accountId: string, params: CreateInvoiceParams) {
    const { periodFrom, periodTo } = params;

    // Incluye las cuentas satélite (si las hay) para que la factura sume también
    // lo vendido contra ellas — la cuenta padre es la única unidad de facturación.
    const account = await prisma.cuentaCorrienteAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { satelliteAccounts: { select: { id: true } } },
    });
    const accountIds = [accountId, ...account.satelliteAccounts.map((s) => s.id)];

    const existing = await prisma.cuentaCorrienteInvoice.findFirst({
      where: {
        accountId: { in: accountIds },
        isPaid: false,
        periodFrom: { lte: periodTo },
        periodTo: { gte: periodFrom },
      },
    });
    if (existing) {
      throw new Error("Ya existe una factura que cubre ese período.");
    }

    const sales = await prisma.posSale.findMany({
      where: {
        cuentaCorrienteAccountId: { in: accountIds },
        status: { in: ["CONFIRMED", "PAID"] },
        cuentaCorrienteInvoiceId: null,
        createdAt: { gte: periodFrom, lte: periodTo },
      },
      include: {
        payments: {
          where: { method: "CUENTA_CORRIENTE" },
          select: { amountCents: true },
        },
      },
    });

    const directCharges = await prisma.ccDirectCharge.findMany({
      where: {
        cuentaCorrienteAccountId: { in: accountIds },
        cuentaCorrienteInvoiceId: null,
        date: { gte: periodFrom, lte: periodTo },
      },
    });

    const subtotalCents =
      sales.reduce((sum, s) => sum + s.payments.reduce((ps, p) => ps + p.amountCents, 0), 0) +
      directCharges.reduce((sum, c) => sum + c.amountCents, 0);

    const totalAmountCents = subtotalCents;

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.cuentaCorrienteInvoice.create({
        data: {
          accountId,
          periodFrom,
          periodTo,
          estimatedPaymentDate: params.estimatedPaymentDate,
          arcaFacturaNumber: params.arcaFacturaNumber ?? null,
          subtotalCents,
          ivaExento: params.ivaExento,
          ivaDiscriminado: params.ivaDiscriminado,
          ivaAmountCents: params.ivaAmountCents,
          totalAmountCents,
          notes: params.notes ?? null,
          digitalInvoiceUrl: params.digitalInvoiceUrl ?? null,
        },
      });

      if (sales.length > 0) {
        await tx.posSale.updateMany({
          where: { id: { in: sales.map((s) => s.id) } },
          data: { cuentaCorrienteInvoiceId: invoice.id },
        });
      }

      if (directCharges.length > 0) {
        await tx.ccDirectCharge.updateMany({
          where: { id: { in: directCharges.map((c) => c.id) } },
          data: { cuentaCorrienteInvoiceId: invoice.id },
        });
      }

      return invoice;
    });
  }

  static async recordPayment(
    invoiceId: string,
    params: {
      paidAmountCents: number;
      paymentDate: Date;
      paymentReference?: string;
      bankAccountId: string;
      bankWithholdingCents?: number;
      bankFeesCents?: number;
      ivaRetentionCents?: number;
      gananciasRetentionCents?: number;
      rentasRetentionCents?: number;
      sussRetentionCents?: number;
      tisshRetentionCents?: number;
      createdByEmployeeId: string;
    }
  ) {
    const bankWithholdingCents = params.bankWithholdingCents ?? 0;
    const bankFeesCents = params.bankFeesCents ?? 0;
    const netAmountCents = params.paidAmountCents - bankWithholdingCents - bankFeesCents;
    if (!Number.isInteger(netAmountCents) || netAmountCents <= 0) {
      throw new Error("El monto neto acreditado debe ser un entero positivo.");
    }

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.cuentaCorrienteInvoice.update({
        where: { id: invoiceId },
        data: {
          isPaid: true,
          paidAt: new Date(),
          paidAmountCents: params.paidAmountCents,
          paymentDate: params.paymentDate,
          paymentReference: params.paymentReference ?? null,
          bankWithholdingCents,
          bankFeesCents,
          ...(params.ivaRetentionCents !== undefined && { ivaRetentionCents: params.ivaRetentionCents }),
          ...(params.gananciasRetentionCents !== undefined && { gananciasRetentionCents: params.gananciasRetentionCents }),
          ...(params.rentasRetentionCents !== undefined && { rentasRetentionCents: params.rentasRetentionCents }),
          ...(params.sussRetentionCents !== undefined && { sussRetentionCents: params.sussRetentionCents }),
          ...(params.tisshRetentionCents !== undefined && { tisshRetentionCents: params.tisshRetentionCents }),
        },
      });

      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.bankAccountId,
          type: "IN",
          sourceType: "CC_INVOICE_PAYMENT",
          relatedCuentaCorrienteInvoiceId: invoiceId,
          grossAmountCents: params.paidAmountCents,
          bankWithholdingCents,
          bankFeesCents,
          amountCents: netAmountCents,
          date: params.paymentDate,
          description: `Pago factura CC ${invoiceId}`,
          createdByEmployeeId: params.createdByEmployeeId,
        },
      });

      return invoice;
    });
  }

  static async toggleInvoicePaid(invoiceId: string) {
    const inv = await prisma.cuentaCorrienteInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    return prisma.cuentaCorrienteInvoice.update({
      where: { id: invoiceId },
      data: {
        isPaid: !inv.isPaid,
        paidAt: inv.isPaid ? null : new Date(),
      },
    });
  }

  static async updateInvoice(
    invoiceId: string,
    data: Partial<{
      estimatedPaymentDate: Date;
      arcaFacturaNumber: string | null;
      ivaExento: boolean;
      ivaDiscriminado: boolean;
      ivaAmountCents: number;
      bankWithholdingCents: number;
      bankFeesCents: number;
      ivaRetentionCents: number;
      gananciasRetentionCents: number;
      rentasRetentionCents: number;
      digitalInvoiceUrl: string | null;
      notes: string | null;
    }>
  ) {
    const current = await prisma.cuentaCorrienteInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    const totalAmountCents = current.subtotalCents;

    return prisma.cuentaCorrienteInvoice.update({
      where: { id: invoiceId },
      data: { ...data, totalAmountCents },
    });
  }

  static async voidInvoice(invoiceId: string) {
    const inv = await prisma.cuentaCorrienteInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (inv.isPaid || inv.paidAmountCents > 0) {
      throw new Error("No se puede anular una factura con pago registrado.");
    }

    return prisma.$transaction(async (tx) => {
      await tx.posSale.updateMany({
        where: { cuentaCorrienteInvoiceId: invoiceId },
        data: { cuentaCorrienteInvoiceId: null },
      });
      await tx.ccDirectCharge.updateMany({
        where: { cuentaCorrienteInvoiceId: invoiceId },
        data: { cuentaCorrienteInvoiceId: null },
      });
      await tx.cuentaCorrienteInvoice.delete({ where: { id: invoiceId } });
    });
  }

  static async listInvoicesForExport(params: { from: Date; to: Date }) {
    return prisma.cuentaCorrienteInvoice.findMany({
      where: {
        billingDate: { gte: params.from, lte: params.to },
      },
      include: {
        account: { include: { customer: { select: { displayName: true } } } },
      },
      orderBy: { billingDate: "asc" },
    });
  }
}
