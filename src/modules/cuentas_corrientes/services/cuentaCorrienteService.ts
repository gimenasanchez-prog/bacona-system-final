import { prisma } from "@/lib/prisma";
import { BillingCycle, CcDirectChargeCategory, CuentaCorrienteAccountKind, CuentaCorrienteInvoice, Prisma } from "@prisma/client";

export type BillingPeriod = { from: Date; to: Date };

// Siempre en componentes UTC: así el resultado no depende del huso horario del
// servidor que lo ejecuta (local en dev, UTC en Railway) ni del navegador que
// después lo muestra — la misma fecha calendario da siempre la misma quincena.
export function getPeriodForDate(date: Date, cycle: BillingCycle): BillingPeriod {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (cycle === "MENSUAL") {
    const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    return { from, to };
  }

  // QUINCENAL: Q1 = 1–15, Q2 = 16–fin de mes
  if (day <= 15) {
    const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
    return { from, to };
  } else {
    const from = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
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
  cuentaCorrienteInvoiceId: string | null;
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
  cuentaCorrienteInvoiceId: string | null;
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
  accountKind: CuentaCorrienteAccountKind;
  estimatedPaymentDate: Date | null;
  isActive: boolean;
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

// ─── Facturación manual por selección (solo cuentas TRANSITORIA) ───────────
// A diferencia de las cuentas CORPORATIVA (facturan por quincena/mes calendario),
// una cuenta transitoria factura por selección manual de cargos pendientes —
// Gerencia arma la factura con lo que tilde, sin importar de qué cierre
// comercial vengan ni en qué fecha caigan.

export type PendingCharge = {
  kind: "SALE" | "DIRECT_CHARGE";
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  comercialSaleId: string | null;
  comercialSaleLabel: string | null;
};

export type CreateInvoiceFromSelectionParams = {
  saleIds: string[];
  directChargeIds: string[];
  estimatedPaymentDate: Date;
  ivaExento: boolean;
  ivaDiscriminado: boolean;
  ivaAmountCents: number;
  arcaFacturaNumber?: string;
  notes?: string;
};

export type TransitoriaInvoiceSummary = {
  id: string;
  billingDate: Date;
  estimatedPaymentDate: Date;
  totalAmountCents: number;
  isPaid: boolean;
  paidAmountCents: number;
  arcaFacturaNumber: string | null;
  notes: string | null;
  itemsCount: number;
  hasChequePending: boolean;
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
  static async getAccountsWithBillingState(params?: { includeInactive?: boolean }): Promise<AccountWithBillingState[]> {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    // Cuentas "raíz" (no facturan a través de otra cuenta). Las cuentas satélite
    // (billsToAccountId != null, ej. Posco Enc Arg/Kor) se usan en el POS para
    // elegir tarifa, pero su consumo se consolida acá bajo la cuenta padre.
    const rootAccounts = await prisma.cuentaCorrienteAccount.findMany({
      where: { isActive: params?.includeInactive ? undefined : true, billsToAccountId: null },
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
        cuentaCorrienteInvoiceId: s.cuentaCorrienteInvoiceId,
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
        cuentaCorrienteInvoiceId: c.cuentaCorrienteInvoiceId,
      }));

      // Construir mapa de facturas por período. La clave NO sale del periodFrom
      // guardado en la factura (puede estar mal grabado — ej. un día corrido —
      // y eso es justamente lo que causaba períodos "fantasma" duplicados).
      // En cambio, se ancla a la fecha real de sus propios cargos/ventas ya
      // vinculados (vía cuentaCorrienteInvoiceId): así la factura siempre cae
      // en el mismo bucket que su contenido real, sin importar qué quedó
      // grabado en periodFrom.
      const invoiceAnchorDate = new Map<string, Date>();
      for (const sale of allSales) {
        if (!sale.cuentaCorrienteInvoiceId) continue;
        const prev = invoiceAnchorDate.get(sale.cuentaCorrienteInvoiceId);
        if (!prev || sale.createdAt < prev) invoiceAnchorDate.set(sale.cuentaCorrienteInvoiceId, sale.createdAt);
      }
      for (const charge of allDirectCharges) {
        if (!charge.cuentaCorrienteInvoiceId) continue;
        const prev = invoiceAnchorDate.get(charge.cuentaCorrienteInvoiceId);
        if (!prev || charge.date < prev) invoiceAnchorDate.set(charge.cuentaCorrienteInvoiceId, charge.date);
      }

      const invoiceByPeriodKey = new Map<string, InvoiceSummary>();
      const invoicePeriodKeyById = new Map<string, string>();
      for (const inv of accInvoices) {
        const anchor = invoiceAnchorDate.get(inv.id) ?? inv.periodFrom;
        const key = periodKey(getPeriodForDate(anchor, cycle).from);
        invoicePeriodKeyById.set(inv.id, key);
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

      // Períodos de facturas (mismo anclaje que arriba)
      for (const inv of accInvoices) {
        periodKeys.add(invoicePeriodKeyById.get(inv.id)!);
      }

      // Siempre incluir el período actual
      periodKeys.add(periodKey(currentPeriod.from));

      // Construir PeriodSummary[] para cada período
      const currentKey = periodKey(currentPeriod.from);
      const periods: PeriodSummary[] = Array.from(periodKeys)
        .map((key) => {
          const period = getPeriodForDate(new Date(key + "T12:00:00.000Z"), cycle);
          const invoice = invoiceByPeriodKey.get(key) ?? null;
          // Un cargo/venta ya facturado por OTRA factura nunca se recuenta acá,
          // aunque su fecha caiga dentro de este rango (evita el doble conteo
          // que causaba el período "fantasma").
          const periodSales = allSales.filter(
            (s) =>
              s.createdAt >= period.from &&
              s.createdAt <= period.to &&
              (s.cuentaCorrienteInvoiceId === null || s.cuentaCorrienteInvoiceId === invoice?.id)
          );
          const periodCharges = allDirectCharges.filter(
            (c) =>
              c.date >= period.from &&
              c.date <= period.to &&
              (c.cuentaCorrienteInvoiceId === null || c.cuentaCorrienteInvoiceId === invoice?.id)
          );
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
      const todayDay = now.getUTCDate();
      const endOfCurrentFortnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        todayDay <= 15 ? 15 : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate(),
        23, 59, 59, 999
      ));

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
        accountKind: acc.accountKind,
        estimatedPaymentDate: acc.estimatedPaymentDate,
        isActive: acc.isActive,
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
    // Incluye las cuentas satélite (si las hay) para que la factura sume también
    // lo vendido contra ellas — la cuenta padre es la única unidad de facturación.
    const account = await prisma.cuentaCorrienteAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { satelliteAccounts: { select: { id: true } } },
    });
    const accountIds = [accountId, ...account.satelliteAccounts.map((s) => s.id)];

    // El período nunca se toma tal cual llega del formulario: se recalcula acá
    // a partir del ciclo de facturación de la cuenta, para que su clave siempre
    // coincida con la que usan ventas y cargos directos (evita facturas con
    // fechas desalineadas que generan períodos "fantasma" en el listado).
    const canonicalPeriod = getPeriodForDate(params.periodFrom, account.billingCycle);
    const periodFrom = canonicalPeriod.from;
    const periodTo = canonicalPeriod.to;

    const existing = await prisma.cuentaCorrienteInvoice.findFirst({
      where: {
        accountId: { in: accountIds },
        periodFrom: { lte: periodTo },
        periodTo: { gte: periodFrom },
      },
    });
    if (existing) {
      throw new Error(
        existing.isPaid
          ? "Ya existe una factura pagada que cubre ese período."
          : "Ya existe una factura que cubre ese período."
      );
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
      include: {
        comercialSaleLine: {
          select: { posSale: { select: { payments: { where: { method: "CHEQUE" }, select: { id: true } } } } },
        },
      },
    });

    const subtotalCents =
      sales.reduce((sum, s) => sum + s.payments.reduce((ps, p) => ps + p.amountCents, 0), 0) +
      directCharges.reduce((sum, c) => sum + c.amountCents, 0);

    const totalAmountCents = subtotalCents;

    // Algunos de estos cargos directos pueden venir de una venta comercial
    // cobrada con cheque (ver ComercialSaleService.deliverLine) — el cheque
    // necesita saber a qué factura quedó vinculado su cargo, sea cual sea el
    // tipo de cuenta (corporativa o transitoria).
    const linkedCheques = await CuentaCorrienteService.findLinkedCheques(directCharges);

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

      return CuentaCorrienteService.linkChequesAndApplyExistingCredit(tx, linkedCheques, invoice);
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

  static async getLastPaymentDate(): Promise<Date | null> {
    const result = await prisma.cuentaCorrienteInvoice.aggregate({
      where: { isPaid: true },
      _max: { paidAt: true },
    });
    return result._max.paidAt;
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

  // ─── Facturación manual por selección (cuentas TRANSITORIA) ───────────────

  static async getPendingChargesForAccount(accountId: string): Promise<PendingCharge[]> {
    const [sales, charges] = await Promise.all([
      prisma.posSale.findMany({
        where: {
          cuentaCorrienteAccountId: accountId,
          cuentaCorrienteInvoiceId: null,
          status: { in: ["CONFIRMED", "PAID"] },
        },
        include: {
          payments: { where: { method: "CUENTA_CORRIENTE" }, select: { amountCents: true } },
          comercialSaleLine: {
            select: { comercialSaleId: true, clienteLabel: true, comercialSale: { select: { notes: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ccDirectCharge.findMany({
        where: { cuentaCorrienteAccountId: accountId, cuentaCorrienteInvoiceId: null },
        include: {
          comercialSaleLine: {
            select: { comercialSaleId: true, clienteLabel: true, comercialSale: { select: { notes: true } } },
          },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    const labelFor = (line: { clienteLabel: string; comercialSale: { notes: string | null } } | null) =>
      line ? (line.comercialSale.notes ? `${line.clienteLabel} — ${line.comercialSale.notes}` : line.clienteLabel) : null;

    const saleItems: PendingCharge[] = sales.map((s) => ({
      kind: "SALE",
      id: s.id,
      date: s.createdAt,
      description: s.comercialSaleLine ? `${s.comercialSaleLine.clienteLabel} — venta` : "Venta cuenta corriente",
      amountCents: s.payments.reduce((sum, p) => sum + p.amountCents, 0),
      comercialSaleId: s.comercialSaleLine?.comercialSaleId ?? null,
      comercialSaleLabel: labelFor(s.comercialSaleLine),
    }));

    const chargeItems: PendingCharge[] = charges.map((c) => ({
      kind: "DIRECT_CHARGE",
      id: c.id,
      date: c.date,
      description: c.description,
      amountCents: c.amountCents,
      comercialSaleId: c.comercialSaleLine?.comercialSaleId ?? null,
      comercialSaleLabel: labelFor(c.comercialSaleLine),
    }));

    return [...saleItems, ...chargeItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  static async listInvoicesForAccount(accountId: string): Promise<TransitoriaInvoiceSummary[]> {
    const invoices = await prisma.cuentaCorrienteInvoice.findMany({
      where: { accountId },
      include: {
        sales: { select: { id: true } },
        directCharges: { select: { id: true } },
        cheques: { select: { status: true } },
      },
      orderBy: { billingDate: "desc" },
    });

    return invoices.map((inv) => ({
      id: inv.id,
      billingDate: inv.billingDate,
      estimatedPaymentDate: inv.estimatedPaymentDate,
      totalAmountCents: inv.totalAmountCents,
      isPaid: inv.isPaid,
      paidAmountCents: inv.paidAmountCents,
      arcaFacturaNumber: inv.arcaFacturaNumber,
      notes: inv.notes,
      itemsCount: inv.sales.length + inv.directCharges.length,
      hasChequePending: inv.cheques.some((c) => c.status !== "ACREDITADO" && c.status !== "RECHAZADO"),
    }));
  }

  static async createInvoiceFromSelection(accountId: string, params: CreateInvoiceFromSelectionParams) {
    if (params.saleIds.length === 0 && params.directChargeIds.length === 0) {
      throw new Error("Seleccioná al menos un cargo para facturar.");
    }

    const account = await prisma.cuentaCorrienteAccount.findUniqueOrThrow({ where: { id: accountId } });

    const [sales, directCharges] = await Promise.all([
      prisma.posSale.findMany({
        where: { id: { in: params.saleIds }, cuentaCorrienteAccountId: accountId, cuentaCorrienteInvoiceId: null },
        include: { payments: { where: { method: "CUENTA_CORRIENTE" }, select: { amountCents: true } } },
      }),
      prisma.ccDirectCharge.findMany({
        where: { id: { in: params.directChargeIds }, cuentaCorrienteAccountId: accountId, cuentaCorrienteInvoiceId: null },
        include: {
          comercialSaleLine: {
            select: { posSale: { select: { payments: { where: { method: "CHEQUE" }, select: { id: true } } } } },
          },
        },
      }),
    ]);

    if (sales.length !== params.saleIds.length || directCharges.length !== params.directChargeIds.length) {
      throw new Error("Alguno de los cargos seleccionados ya no está disponible para facturar (puede que ya se haya facturado).");
    }

    const subtotalCents =
      sales.reduce((sum, s) => sum + s.payments.reduce((ps, p) => ps + p.amountCents, 0), 0) +
      directCharges.reduce((sum, c) => sum + c.amountCents, 0);
    if (subtotalCents <= 0) {
      throw new Error("El total a facturar debe ser mayor a cero.");
    }

    // El período de la factura se ancla siempre al de "hoy" (canónico según el
    // ciclo de la cuenta) — no representa un ciclo de consumo real como en las
    // cuentas corporativas, es solo la fecha de emisión. Los cargos ya quedan
    // vinculados 1 a 1 a esta factura vía cuentaCorrienteInvoiceId, así que no
    // se recuentan aunque su fecha real caiga en otra quincena.
    const period = getPeriodForDate(new Date(), account.billingCycle);

    const linkedCheques = await CuentaCorrienteService.findLinkedCheques(directCharges);

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.cuentaCorrienteInvoice.create({
        data: {
          accountId,
          periodFrom: period.from,
          periodTo: period.to,
          estimatedPaymentDate: params.estimatedPaymentDate,
          arcaFacturaNumber: params.arcaFacturaNumber ?? null,
          subtotalCents,
          ivaExento: params.ivaExento,
          ivaDiscriminado: params.ivaDiscriminado,
          ivaAmountCents: params.ivaAmountCents,
          totalAmountCents: subtotalCents,
          notes: params.notes ?? null,
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
      return CuentaCorrienteService.linkChequesAndApplyExistingCredit(tx, linkedCheques, invoice);
    });
  }

  // Busca los cheques asociados a estos cargos directos (los que vienen de una
  // línea de venta comercial cobrada con cheque, ver ComercialSaleService.
  // deliverLine). Sirve tanto para facturación por período (corporativas) como
  // por selección (transitorias) — un cargo con cheque puede aparecer en
  // cualquiera de las dos.
  private static async findLinkedCheques(
    directCharges: { comercialSaleLine?: { posSale?: { payments: { id: string }[] } | null } | null }[]
  ) {
    const chequePaymentIds = directCharges
      .map((c) => c.comercialSaleLine?.posSale?.payments[0]?.id)
      .filter((id): id is string => !!id);
    return chequePaymentIds.length
      ? prisma.cheque.findMany({
          where: { posPaymentId: { in: chequePaymentIds } },
          select: { id: true, status: true, amountCents: true },
        })
      : [];
  }

  // Vincula esos cheques a la factura recién creada y, si alguno ya se había
  // acreditado ANTES de generar esta factura (el orden real puede ser
  // cualquiera), aplica ese crédito ahora mismo — ese acreditamiento ya pasó y
  // nunca va a volver a disparar ChequeService.markAcreditado.
  private static async linkChequesAndApplyExistingCredit(
    tx: Prisma.TransactionClient,
    linkedCheques: { id: string; status: string; amountCents: number }[],
    invoice: CuentaCorrienteInvoice
  ) {
    if (linkedCheques.length === 0) return invoice;

    await tx.cheque.updateMany({
      where: { id: { in: linkedCheques.map((c) => c.id) } },
      data: { cuentaCorrienteInvoiceId: invoice.id },
    });

    let result = invoice;
    for (const cheque of linkedCheques.filter((c) => c.status === "ACREDITADO")) {
      result = await CuentaCorrienteService.addToInvoicePaidAmount(tx, invoice.id, cheque.amountCents);
    }
    return result;
  }

  // Suma un monto al acumulado cobrado de una factura y la marca pagada solo
  // cuando el acumulado alcanza el total — a diferencia de recordPayment (que
  // pisa el valor, pensado para "un solo pago" de cuentas corporativas), esto
  // soporta que una factura de cuenta transitoria se salde con varios cobros
  // parciales (varios cheques, o un cheque + un cobro manual).
  private static async addToInvoicePaidAmount(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    amountCents: number
  ) {
    const inv = await tx.cuentaCorrienteInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const paidAmountCents = inv.paidAmountCents + amountCents;
    const isPaid = paidAmountCents >= inv.totalAmountCents;
    return tx.cuentaCorrienteInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmountCents,
        isPaid,
        paidAt: isPaid ? (inv.paidAt ?? new Date()) : inv.paidAt,
      },
    });
  }

  // Llamado desde ChequeService.markAcreditado cuando el cheque acreditado
  // está vinculado a una factura. No crea LocalCashMovement propio — ese
  // movimiento de caja ya lo crea LocalCashBoxService.reconcileSales al
  // acreditar el cheque; esto solo refleja el estado en Cuentas Corrientes.
  static async applyChequeCredit(invoiceId: string, amountCents: number) {
    return prisma.$transaction((tx) => CuentaCorrienteService.addToInvoicePaidAmount(tx, invoiceId, amountCents));
  }

  // Cobro manual (no cheque) de una factura de cuenta transitoria, ej. cuando
  // un cargo cobrado "a cuenta corriente" finalmente se cobra por transferencia.
  // Suma sobre lo ya acreditado por cheque en vez de pisarlo.
  static async registerPartialPayment(
    invoiceId: string,
    params: {
      amountCents: number;
      paymentDate: Date;
      paymentReference?: string;
      bankAccountId: string;
      bankWithholdingCents?: number;
      bankFeesCents?: number;
      createdByEmployeeId: string;
    }
  ) {
    const bankWithholdingCents = params.bankWithholdingCents ?? 0;
    const bankFeesCents = params.bankFeesCents ?? 0;
    const netAmountCents = params.amountCents - bankWithholdingCents - bankFeesCents;
    if (!Number.isInteger(netAmountCents) || netAmountCents <= 0) {
      throw new Error("El monto neto acreditado debe ser un entero positivo.");
    }

    return prisma.$transaction(async (tx) => {
      const invoice = await CuentaCorrienteService.addToInvoicePaidAmount(tx, invoiceId, params.amountCents);

      await tx.localCashMovement.create({
        data: {
          localCashBoxId: params.bankAccountId,
          type: "IN",
          sourceType: "CC_INVOICE_PAYMENT",
          relatedCuentaCorrienteInvoiceId: invoiceId,
          grossAmountCents: params.amountCents,
          bankWithholdingCents,
          bankFeesCents,
          amountCents: netAmountCents,
          date: params.paymentDate,
          description: `Cobro parcial factura CC ${invoiceId}`,
          createdByEmployeeId: params.createdByEmployeeId,
        },
      });

      if (params.paymentReference) {
        await tx.cuentaCorrienteInvoice.update({
          where: { id: invoiceId },
          data: { paymentReference: params.paymentReference, paymentDate: params.paymentDate },
        });
      }

      return invoice;
    });
  }
}
