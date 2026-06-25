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
  pendingInvoicesTotalCents: number;
  overdueInvoicesTotalCents: number;
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

function calcTotal(
  subtotalCents: number,
  ivaAmountCents: number,
  bankWithholdingCents: number,
  bankFeesCents: number,
  ivaRetentionCents: number,
  gananciasRetentionCents: number,
  rentasRetentionCents: number
): number {
  return (
    subtotalCents +
    ivaAmountCents -
    bankWithholdingCents -
    bankFeesCents -
    ivaRetentionCents -
    gananciasRetentionCents -
    rentasRetentionCents
  );
}

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

    const accounts = await prisma.cuentaCorrienteAccount.findMany({
      where: { isActive: true },
      include: {
        customer: { select: { displayName: true } },
        // Traer TODAS las facturas (pagadas y no pagadas)
        invoices: {
          orderBy: { periodFrom: "desc" },
          include: { sales: { select: { id: true } } },
        },
        // Traer TODAS las ventas de CC (sin filtro de fecha ni de factura)
        sales: {
          where: { status: { in: ["CONFIRMED", "PAID"] } },
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
        },
        directCharges: {
          orderBy: { date: "desc" },
        },
      },
      orderBy: { customer: { displayName: "asc" } },
    });

    return accounts.map((acc) => {
      const cycle = acc.billingCycle;
      const currentPeriod = getPeriodForDate(now, cycle);

      // Convertir ventas a UnbilledSale
      const allSales: UnbilledSale[] = acc.sales.map((s) => ({
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

      const allDirectCharges: DirectCharge[] = acc.directCharges.map((c) => ({
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
      for (const inv of acc.invoices) {
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
      for (const inv of acc.invoices) {
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

      // Dashboard chips
      let unbilledTotalCents = 0;
      let pendingInvoicesTotalCents = 0;
      let overdueInvoicesTotalCents = 0;
      let paidAmountActiveCents = 0;
      let totalRetencionesCents = 0;

      for (const p of periods) {
        if (!p.invoice) {
          unbilledTotalCents += p.totalConsumptionCents;
        } else {
          const inv = p.invoice;
          if (!inv.isPaid) {
            const outstanding = inv.totalAmountCents - inv.paidAmountCents;
            if (inv.estimatedPaymentDate <= today) {
              overdueInvoicesTotalCents += outstanding;
            } else {
              pendingInvoicesTotalCents += outstanding;
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
        pendingInvoicesTotalCents,
        overdueInvoicesTotalCents,
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

    const existing = await prisma.cuentaCorrienteInvoice.findFirst({
      where: {
        accountId,
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
        cuentaCorrienteAccountId: accountId,
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
        cuentaCorrienteAccountId: accountId,
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
      bankWithholdingCents?: number;
      bankFeesCents?: number;
      ivaRetentionCents?: number;
      gananciasRetentionCents?: number;
      rentasRetentionCents?: number;
      sussRetentionCents?: number;
      tisshRetentionCents?: number;
    }
  ) {
    return prisma.cuentaCorrienteInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmountCents: params.paidAmountCents,
        paymentDate: params.paymentDate,
        paymentReference: params.paymentReference ?? null,
        ...(params.bankWithholdingCents !== undefined && { bankWithholdingCents: params.bankWithholdingCents }),
        ...(params.bankFeesCents !== undefined && { bankFeesCents: params.bankFeesCents }),
        ...(params.ivaRetentionCents !== undefined && { ivaRetentionCents: params.ivaRetentionCents }),
        ...(params.gananciasRetentionCents !== undefined && { gananciasRetentionCents: params.gananciasRetentionCents }),
        ...(params.rentasRetentionCents !== undefined && { rentasRetentionCents: params.rentasRetentionCents }),
        ...(params.sussRetentionCents !== undefined && { sussRetentionCents: params.sussRetentionCents }),
        ...(params.tisshRetentionCents !== undefined && { tisshRetentionCents: params.tisshRetentionCents }),
      },
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
}
