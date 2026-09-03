import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";
import { LocalExpenseService } from "@/modules/egresos_locales/services/localExpenseService";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";
import { CostosFijosService } from "@/modules/rentabilidad/services/costosFijosService";
import { CreditCardService } from "@/modules/egresos_proveedores/services/creditCardService";
import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";
import { SOURCE_TYPE_LABEL, LOCAL_EXPENSE_CATEGORY_LABEL } from "@/modules/caja_local/lib/sourceTypeLabels";
import { SUPPLIER_PAYMENT_METHOD_LABEL } from "@/modules/egresos_proveedores/lib/supplierPaymentMethodLabels";
import { COSTO_FIJO_CATEGORIA_LABEL } from "@/modules/rentabilidad/lib/costoFijoCategoriaLabels";
import { formatArsFromCents } from "@/lib/money";
import { type ReportType } from "@/modules/reportes/lib/reportType";

const MAX_CIERRES_ROWS = 5000;
const MAX_SALES_FOR_EXPORT = 15000;
const MAX_VENTA_ITEM_ROWS = 40000;

export class ReportRangeTooLargeError extends Error {}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const SALE_TYPE_LABEL: Record<string, string> = {
  MOSTRADOR: "Mostrador",
  MESA: "Mesa",
  RESERVA: "Reserva",
  COMERCIAL: "Comercial",
};

const SALE_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmada",
  PAID: "Pagada",
};

const POS_PAYMENT_METHOD_LABEL: Record<string, string> = {
  CREDITO: "Crédito",
  DEBITO: "Débito",
  TRANSFERENCIA: "Transferencia",
  QR: "QR",
  CHEQUE: "Cheque",
  CUENTA_CORRIENTE: "Cta. corriente",
  CUENTAS_INTERNAS: "Ctas. internas",
  EFECTIVO: "Efectivo",
};

export type SalesByDayRow = {
  dayKey: string;
  date: Date;
  cashCents: number;
  debitCents: number;
  creditCents: number;
  transferCents: number;
  qrCents: number;
  chequeCents: number;
  ccCents: number;
  internalCents: number;
  totalCents: number;
};

export type EgresoRow = {
  date: Date;
  fuente: string;
  tipo: string;
  detalle: string;
  amountCents: number;
  registradoPor: string;
};

export type EgresoModuloRow = {
  date: Date;
  fuente: "Proveedores" | "Costos fijos" | "Tarjetas de crédito";
  tipo: string;
  entidad: string;
  detalle: string;
  vencimiento: Date | null;
  fechaCompra: Date | null;
  amountCents: number;
  cajaCuenta: string;
  registradoPor: string;
};

export type VentaDetalladaRow = {
  date: Date;
  saleId: string;
  saleType: string;
  status: string;
  customerName: string;
  tableLabel: string;
  comandaNumber: string;
  coverCount: number | null;
  productName: string;
  modifiers: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  saleTotalCents: number;
  paymentMethods: string;
};

export type ReportData = Awaited<ReturnType<typeof ReportesDataService.getReportData>>;

export class ReportesDataService {
  static async getReportData(params: { from: Date; to: Date; reportType?: ReportType }) {
    const { from, to } = params;
    const reportType = params.reportType ?? "TODOS";
    const includes = (key: ReportType) => reportType === "TODOS" || reportType === key;

    const [cierres, movimientosCaja, egresosTurno, facturas, pagosProveedores, pagosCostosFijos, pagosTarjetas, ventasDetalle] =
      await Promise.all([
        ConsolidatedClosuresService.listCashClosures({
          from,
          to,
          cashSessionStatus: "CLOSED",
          take: MAX_CIERRES_ROWS + 1,
        }),
        LocalCashBoxService.listCashOutMovementsInRange({ from, to }),
        LocalExpenseService.listShiftCashExpensesInRange({ from, to }),
        CuentaCorrienteService.listInvoicesForExport({ from, to }),
        SupplierPayableService.listPaymentsInRange({ from, to }),
        CostosFijosService.listPaymentsInRange({ from, to }),
        CreditCardService.listStatementPaymentsInRange({ from, to }),
        PosSaleService.listSalesForExport({ from, to, take: MAX_SALES_FOR_EXPORT + 1 }),
      ]);

    // Los topes solo bloquean el reporte si esos datos realmente van a exportarse —
    // pedir solo "Cierres de caja" en un rango con muchísimas ventas no debería fallar.
    if ((includes("CIERRES") || includes("VENTAS_DIA")) && cierres.length > MAX_CIERRES_ROWS) {
      throw new ReportRangeTooLargeError(
        `El rango elegido tiene más de ${MAX_CIERRES_ROWS} cierres de caja. Acotá el rango de fechas.`
      );
    }
    if (includes("VENTAS_DETALLE") && ventasDetalle.length > MAX_SALES_FOR_EXPORT) {
      throw new ReportRangeTooLargeError(
        `El rango elegido tiene más de ${MAX_SALES_FOR_EXPORT} ventas. Acotá el rango de fechas.`
      );
    }

    const byDay = new Map<string, SalesByDayRow>();
    for (const c of cierres) {
      const key = dayKey(new Date(c.businessDate));
      const row =
        byDay.get(key) ??
        ({
          dayKey: key,
          date: new Date(c.businessDate),
          cashCents: 0,
          debitCents: 0,
          creditCents: 0,
          transferCents: 0,
          qrCents: 0,
          chequeCents: 0,
          ccCents: 0,
          internalCents: 0,
          totalCents: 0,
        } satisfies SalesByDayRow);
      row.cashCents += c.totalCashCents;
      row.debitCents += c.totalDebitCents;
      row.creditCents += c.totalCreditCents;
      row.transferCents += c.totalTransferCents;
      row.qrCents += c.totalQrCents;
      row.chequeCents += c.totalChequeCents;
      row.ccCents += c.totalCuentaCorrienteCents;
      row.internalCents += c.totalCuentasInternasCents;
      row.totalCents =
        row.cashCents +
        row.debitCents +
        row.creditCents +
        row.transferCents +
        row.qrCents +
        row.chequeCents +
        row.ccCents +
        row.internalCents;
      byDay.set(key, row);
    }
    const ventasPorDia = Array.from(byDay.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const egresosCaja: EgresoRow[] = movimientosCaja.map((m) => ({
      date: m.date,
      fuente: m.localCashBox.name,
      tipo: SOURCE_TYPE_LABEL[m.sourceType] ?? m.sourceType,
      detalle: m.description ?? "",
      amountCents: m.amountCents,
      registradoPor: m.createdByEmployee.displayName,
    }));
    const egresosTurnoRows: EgresoRow[] = egresosTurno.map((e) => ({
      date: e.date,
      fuente: "Efectivo de turno",
      tipo: LOCAL_EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
      detalle: e.description ? `${e.supplierNameSnapshot} — ${e.description}` : e.supplierNameSnapshot,
      amountCents: e.amountCents,
      registradoPor: e.createdByEmployee.displayName,
    }));
    const egresos = [...egresosCaja, ...egresosTurnoRows].sort((a, b) => a.date.getTime() - b.date.getTime());

    const egresosProveedores: EgresoModuloRow[] = pagosProveedores.map((p) => ({
      date: p.date,
      fuente: "Proveedores",
      tipo: SUPPLIER_PAYMENT_METHOD_LABEL[p.method] ?? p.method,
      entidad: p.supplier.name,
      detalle: p.notes ?? "",
      vencimiento: p.payable?.dueDate ?? null,
      fechaCompra: p.payable?.sourcePurchase?.purchasedAt ?? p.payable?.createdAt ?? null,
      amountCents: p.amountCents,
      cajaCuenta: p.method === "TARJETA_CREDITO" ? (p.creditCard?.name ?? "") : (p.cashBox?.name ?? ""),
      registradoPor: p.createdByEmployee.displayName,
    }));
    const egresosCostosFijos: EgresoModuloRow[] = pagosCostosFijos.map((p) => ({
      date: p.paidAt,
      fuente: "Costos fijos",
      tipo: COSTO_FIJO_CATEGORIA_LABEL[p.costoFijo.categoria] ?? p.costoFijo.categoria,
      entidad: p.costoFijo.nombre,
      detalle: `Período ${p.period.toISOString().slice(0, 7)}`,
      vencimiento: null,
      fechaCompra: null,
      amountCents: p.amountCents,
      cajaCuenta: p.cashBox.name,
      registradoPor: p.createdByEmployee.displayName,
    }));
    const egresosTarjetas: EgresoModuloRow[] = pagosTarjetas.map((p) => ({
      date: p.paidAt,
      fuente: "Tarjetas de crédito",
      tipo: "Pago de resumen",
      entidad: p.creditCard.name,
      detalle: `Período ${p.period.toISOString().slice(0, 7)}${p.notes ? ` — ${p.notes}` : ""}`,
      vencimiento: new Date(Date.UTC(p.period.getUTCFullYear(), p.period.getUTCMonth(), p.creditCard.dueDay)),
      fechaCompra: null,
      amountCents: p.totalAmountCents,
      cajaCuenta: p.cashBox.name,
      registradoPor: p.createdByEmployee.displayName,
    }));
    const egresosModulo = [...egresosProveedores, ...egresosCostosFijos, ...egresosTarjetas].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    const ventasDetalladas: VentaDetalladaRow[] = ventasDetalle.flatMap((sale) => {
      const customerName =
        sale.customer?.displayName ??
        sale.customerNameFreeText ??
        sale.cuentaCorrienteAccount?.customer?.displayName ??
        "Consumidor final";
      const paymentMethods = sale.payments
        .map((p) => `${POS_PAYMENT_METHOD_LABEL[p.method] ?? p.method} ${formatArsFromCents(p.amountCents)}`)
        .join("; ");
      const coverCount = (sale.externalRefs as any)?.coverCount ?? null;

      return sale.items.map((item) => ({
        date: sale.createdAt,
        saleId: sale.id,
        saleType: SALE_TYPE_LABEL[sale.saleType] ?? sale.saleType,
        status: SALE_STATUS_LABEL[sale.status] ?? sale.status,
        customerName,
        tableLabel: sale.table?.label ?? "",
        comandaNumber: sale.comandaNumber ?? "",
        coverCount,
        productName: item.product.name,
        modifiers: item.modifiers.map((m) => m.modifierOption.name).join(", "),
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        saleTotalCents: sale.totalCents,
        paymentMethods,
      }));
    });

    if (includes("VENTAS_DETALLE") && ventasDetalladas.length > MAX_VENTA_ITEM_ROWS) {
      throw new ReportRangeTooLargeError(
        `El rango elegido tiene más de ${MAX_VENTA_ITEM_ROWS} líneas de venta. Acotá el rango de fechas.`
      );
    }

    const ventasTotalCents = cierres.reduce((s, c) => s + c.totalIncomeCents, 0);
    const egresosTotalCents = egresos.reduce((s, e) => s + e.amountCents, 0);
    const egresosModuloTotalCents = egresosModulo.reduce((s, e) => s + e.amountCents, 0);
    const facturadoTotalCents = facturas.reduce((s, f) => s + f.totalAmountCents, 0);
    const cobradoTotalCents = facturas.reduce((s, f) => s + f.paidAmountCents, 0);

    return {
      from,
      to,
      cierres,
      ventasPorDia,
      egresos,
      egresosModulo,
      facturas,
      ventasDetalladas,
      totals: {
        ventasTotalCents,
        egresosTotalCents,
        egresosModuloTotalCents,
        facturadoTotalCents,
        cobradoTotalCents,
        ventasDetalladasSaleCount: ventasDetalle.length,
        ventasDetalladasLineCount: ventasDetalladas.length,
      },
    };
  }
}
