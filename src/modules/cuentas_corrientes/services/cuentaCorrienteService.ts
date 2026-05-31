import { prisma } from "@/lib/prisma";
import { BillingCycle } from "@prisma/client";

export type BillingPeriod = { from: Date; to: Date };

function getCurrentPeriod(cycle: BillingCycle, now: Date): BillingPeriod {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (cycle === "MENSUAL") {
    // Acumula todo el mes; cierre al fin de Q2
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

export type UnbilledSale = {
  id: string;
  totalCents: number;
  ccAmountCents: number;
  createdAt: Date;
  items: { qty: number; productName: string }[];
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

export type AccountWithBillingState = {
  id: string;
  customerId: string;
  customerName: string;
  planCode: string | null;
  billingCycle: BillingCycle;
  currentPeriod: BillingPeriod;
  unbilledSales: UnbilledSale[];
  unbilledTotalCents: number;
  pendingInvoices: InvoiceSummary[];
  overdueInvoices: InvoiceSummary[];
};

export type CreateInvoiceParams = {
  periodFrom: Date;
  periodTo: Date;
  estimatedPaymentDate: Date;
  arcaFacturaNumber?: string;
  ivaExento: boolean;
  ivaDiscriminado: boolean;
  ivaAmountCents: number;
  bankWithholdingCents: number;
  bankFeesCents: number;
  ivaRetentionCents: number;
  gananciasRetentionCents: number;
  rentasRetentionCents: number;
  notes?: string;
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
    items: { qty: number; productName: string; unitPriceCents: number; lineTotalCents: number }[];
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

export class CuentaCorrienteService {
  static async getAccountsWithBillingState(): Promise<AccountWithBillingState[]> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const accounts = await prisma.cuentaCorrienteAccount.findMany({
      where: { isActive: true },
      include: {
        customer: { select: { displayName: true } },
        invoices: {
          where: { isPaid: false },
          orderBy: { estimatedPaymentDate: "asc" },
          include: { sales: { select: { id: true } } },
        },
        // Traer TODAS las sin invoice — filtrar por período en memoria
        sales: {
          where: {
            status: { in: ["CONFIRMED", "PAID"] },
            cuentaCorrienteInvoiceId: null,
          },
          include: {
            items: { select: { qty: true, product: { select: { name: true } } } },
            payments: {
              where: { method: "CUENTA_CORRIENTE" },
              select: { amountCents: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { customer: { displayName: "asc" } },
    });

    return accounts.map((acc) => {
      const currentPeriod = getCurrentPeriod(acc.billingCycle, now);

      // Filtrar por período activo en memoria
      const unbilledSales: UnbilledSale[] = acc.sales
        .filter((s) => s.createdAt >= currentPeriod.from && s.createdAt <= currentPeriod.to)
        .map((s) => ({
          id: s.id,
          totalCents: s.totalCents,
          ccAmountCents: s.payments.reduce((sum, p) => sum + p.amountCents, 0),
          createdAt: s.createdAt,
          items: s.items.map((i) => ({ qty: i.qty, productName: i.product.name })),
        }));

      const unbilledTotalCents = unbilledSales.reduce((sum, s) => sum + s.ccAmountCents, 0);

      const pendingInvoices: InvoiceSummary[] = [];
      const overdueInvoices: InvoiceSummary[] = [];

      for (const inv of acc.invoices) {
        const summary: InvoiceSummary = {
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
        if (inv.estimatedPaymentDate <= today) {
          overdueInvoices.push(summary);
        } else {
          pendingInvoices.push(summary);
        }
      }

      return {
        id: acc.id,
        customerId: acc.customerId,
        customerName: acc.customer.displayName,
        planCode: acc.planCode,
        billingCycle: acc.billingCycle,
        currentPeriod,
        unbilledSales,
        unbilledTotalCents,
        pendingInvoices,
        overdueInvoices,
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

    const subtotalCents = sales.reduce(
      (sum, s) => sum + s.payments.reduce((ps, p) => ps + p.amountCents, 0),
      0
    );

    const totalAmountCents = calcTotal(
      subtotalCents,
      params.ivaAmountCents,
      params.bankWithholdingCents,
      params.bankFeesCents,
      params.ivaRetentionCents,
      params.gananciasRetentionCents,
      params.rentasRetentionCents
    );

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
          bankWithholdingCents: params.bankWithholdingCents,
          bankFeesCents: params.bankFeesCents,
          ivaRetentionCents: params.ivaRetentionCents,
          gananciasRetentionCents: params.gananciasRetentionCents,
          rentasRetentionCents: params.rentasRetentionCents,
          totalAmountCents,
          notes: params.notes ?? null,
        },
      });

      if (sales.length > 0) {
        await tx.posSale.updateMany({
          where: { id: { in: sales.map((s) => s.id) } },
          data: { cuentaCorrienteInvoiceId: invoice.id },
        });
      }

      return invoice;
    });
  }

  static async recordPayment(
    invoiceId: string,
    params: { paidAmountCents: number; paymentDate: Date; paymentReference?: string }
  ) {
    return prisma.cuentaCorrienteInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmountCents: params.paidAmountCents,
        paymentDate: params.paymentDate,
        paymentReference: params.paymentReference ?? null,
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

    const bankWithholdingCents = data.bankWithholdingCents ?? current.bankWithholdingCents;
    const bankFeesCents = data.bankFeesCents ?? current.bankFeesCents;
    const ivaAmountCents = data.ivaAmountCents ?? current.ivaAmountCents;
    const ivaRetentionCents = data.ivaRetentionCents ?? current.ivaRetentionCents;
    const gananciasRetentionCents = data.gananciasRetentionCents ?? current.gananciasRetentionCents;
    const rentasRetentionCents = data.rentasRetentionCents ?? current.rentasRetentionCents;

    const totalAmountCents = calcTotal(
      current.subtotalCents,
      ivaAmountCents,
      bankWithholdingCents,
      bankFeesCents,
      ivaRetentionCents,
      gananciasRetentionCents,
      rentasRetentionCents
    );

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
      await tx.cuentaCorrienteInvoice.delete({ where: { id: invoiceId } });
    });
  }
}
