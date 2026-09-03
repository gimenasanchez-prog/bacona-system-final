import ExcelJS from "exceljs";

import type { ReportData } from "./reportesDataService";
import type { ReportType } from "../lib/reportType";

const MONEY_FMT = "#,##0.00";
const DATE_FMT = "dd/mm/yyyy";

function centsToArs(cents: number | null | undefined): number | null {
  return cents == null ? null : cents / 100;
}

function freezeHeaderRow(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
}

export class ReportesExportService {
  static buildWorkbook(data: ReportData, reportType: ReportType = "TODOS"): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const includes = (key: ReportType) => reportType === "TODOS" || reportType === key;

    if (includes("CIERRES")) this.buildCierresSheet(workbook, data);
    if (includes("VENTAS_DIA")) this.buildVentasPorDiaSheet(workbook, data);
    if (includes("VENTAS_DETALLE")) this.buildVentasDetalladasSheet(workbook, data);
    if (includes("EGRESOS")) this.buildEgresosSheet(workbook, data);
    if (includes("EGRESOS_MODULO")) this.buildEgresosModuloSheet(workbook, data);
    if (includes("CUENTAS_CORRIENTES")) this.buildCuentasCorrientesSheet(workbook, data);

    return workbook;
  }

  private static buildCierresSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Cierres de caja");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12, style: { numFmt: DATE_FMT } },
      { header: "Turno", key: "turno", width: 10 },
      { header: "Asociada/o", key: "empleado", width: 22 },
      { header: "Ingresos", key: "ingresos", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Egresos", key: "egresos", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Neto", key: "neto", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Efectivo sobre (real)", key: "sobreReal", width: 18, style: { numFmt: MONEY_FMT } },
      { header: "Efectivo sobre (esperado)", key: "sobreEsperado", width: 20, style: { numFmt: MONEY_FMT } },
      { header: "Código sobre", key: "codigoSobre", width: 18 },
      { header: "Estado sobre", key: "estadoSobre", width: 16 },
    ];

    for (const c of data.cierres) {
      sheet.addRow({
        fecha: new Date(c.businessDate),
        turno: c.shift,
        empleado: c.employee.displayName,
        ingresos: centsToArs(c.totalIncomeCents),
        egresos: centsToArs(c.totalExpensesCents),
        neto: centsToArs(c.totalNetCents),
        sobreReal: centsToArs(c.envelope?.actualAmountCents),
        sobreEsperado: centsToArs(c.envelope?.expectedAmountCents),
        codigoSobre: c.envelope?.envelopeCode ?? "",
        estadoSobre: c.envelope?.status ?? "",
      });
    }

    freezeHeaderRow(sheet);
  }

  private static buildVentasPorDiaSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Ventas por día y método de pago");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12, style: { numFmt: DATE_FMT } },
      { header: "Efectivo", key: "efectivo", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Débito", key: "debito", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Crédito", key: "credito", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Transferencia", key: "transferencia", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "QR", key: "qr", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Cheque", key: "cheque", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Cta. corriente", key: "cc", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Ctas. internas", key: "internas", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Total", key: "total", width: 14, style: { numFmt: MONEY_FMT } },
    ];

    for (const d of data.ventasPorDia) {
      sheet.addRow({
        fecha: d.date,
        efectivo: d.cashCents / 100,
        debito: d.debitCents / 100,
        credito: d.creditCents / 100,
        transferencia: d.transferCents / 100,
        qr: d.qrCents / 100,
        cheque: d.chequeCents / 100,
        cc: d.ccCents / 100,
        internas: d.internalCents / 100,
        total: d.totalCents / 100,
      });
    }

    freezeHeaderRow(sheet);

    sheet.getCell("H1").note =
      '"Cta. corriente" es lo registrado en el cierre de cada turno (igual que en Consolidado de Caja) — ' +
      "puede no coincidir con el módulo de Cuentas Corrientes si hubo ventas con cuenta corriente canceladas " +
      "después del cierre del turno, o cargos directos a la cuenta (que no son ventas del POS).";
  }

  private static buildVentasDetalladasSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Ventas detalladas");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12, style: { numFmt: DATE_FMT } },
      { header: "Tipo de venta", key: "tipoVenta", width: 14 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Cliente", key: "cliente", width: 22 },
      { header: "Mesa", key: "mesa", width: 10 },
      { header: "N° comanda", key: "comanda", width: 12 },
      { header: "Comensales", key: "comensales", width: 10 },
      { header: "Producto", key: "producto", width: 26 },
      { header: "Modificadores", key: "modificadores", width: 30 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Precio unitario", key: "precioUnitario", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Total línea", key: "totalLinea", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Total venta", key: "totalVenta", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Medios de pago", key: "mediosPago", width: 30 },
    ];

    for (const v of data.ventasDetalladas) {
      sheet.addRow({
        fecha: v.date,
        tipoVenta: v.saleType,
        estado: v.status,
        cliente: v.customerName,
        mesa: v.tableLabel,
        comanda: v.comandaNumber,
        comensales: v.coverCount,
        producto: v.productName,
        modificadores: v.modifiers,
        cantidad: v.qty,
        precioUnitario: v.unitPriceCents / 100,
        totalLinea: v.lineTotalCents / 100,
        totalVenta: v.saleTotalCents / 100,
        mediosPago: v.paymentMethods,
      });
    }

    freezeHeaderRow(sheet);
  }

  private static buildEgresosSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Egresos");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12, style: { numFmt: DATE_FMT } },
      { header: "Fuente", key: "fuente", width: 18 },
      { header: "Tipo", key: "tipo", width: 26 },
      { header: "Detalle", key: "detalle", width: 36 },
      { header: "Monto", key: "monto", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Registrado por", key: "registradoPor", width: 20 },
    ];

    for (const e of data.egresos) {
      sheet.addRow({
        fecha: e.date,
        fuente: e.fuente,
        tipo: e.tipo,
        detalle: e.detalle,
        monto: e.amountCents / 100,
        registradoPor: e.registradoPor,
      });
    }

    freezeHeaderRow(sheet);
  }

  private static buildEgresosModuloSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Egresos - Prov, CF, Tarj");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12, style: { numFmt: DATE_FMT } },
      { header: "Fuente", key: "fuente", width: 18 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Entidad", key: "entidad", width: 22 },
      { header: "Detalle", key: "detalle", width: 32 },
      { header: "Vencimiento", key: "vencimiento", width: 14, style: { numFmt: DATE_FMT } },
      { header: "Fecha de compra", key: "fechaCompra", width: 16, style: { numFmt: DATE_FMT } },
      { header: "Monto", key: "monto", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Caja/Cuenta", key: "cajaCuenta", width: 18 },
      { header: "Registrado por", key: "registradoPor", width: 20 },
    ];

    for (const e of data.egresosModulo) {
      sheet.addRow({
        fecha: e.date,
        fuente: e.fuente,
        tipo: e.tipo,
        entidad: e.entidad,
        detalle: e.detalle,
        vencimiento: e.vencimiento,
        fechaCompra: e.fechaCompra,
        monto: e.amountCents / 100,
        cajaCuenta: e.cajaCuenta,
        registradoPor: e.registradoPor,
      });
    }

    freezeHeaderRow(sheet);

    sheet.getCell("B1").note =
      "Incluye pagos a proveedores, costos fijos y tarjetas de crédito por cualquier medio " +
      "(efectivo de caja, transferencia o tarjeta). Los que se pagaron con efectivo de sobre " +
      '(Caja BCN/Gerencia/turno) también aparecen en la hoja "Egresos" — no sumar ambos totales, ' +
      "son dos recortes distintos del mismo universo de plata.";
  }

  private static buildCuentasCorrientesSheet(workbook: ExcelJS.Workbook, data: ReportData) {
    const sheet = workbook.addWorksheet("Cuentas corrientes");
    sheet.columns = [
      { header: "Cliente", key: "cliente", width: 24 },
      { header: "Tipo de cuenta", key: "tipoCuenta", width: 14 },
      { header: "Fecha facturación", key: "billingDate", width: 14, style: { numFmt: DATE_FMT } },
      { header: "Vencimiento", key: "vencimiento", width: 14, style: { numFmt: DATE_FMT } },
      { header: "Período desde", key: "periodFrom", width: 14, style: { numFmt: DATE_FMT } },
      { header: "Período hasta", key: "periodTo", width: 14, style: { numFmt: DATE_FMT } },
      { header: "N° factura ARCA", key: "arcaFacturaNumber", width: 16 },
      { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "IVA exento", key: "ivaExento", width: 10 },
      { header: "IVA discriminado", key: "ivaDiscriminado", width: 14 },
      { header: "IVA", key: "iva", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Retención IVA", key: "retIva", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Retención Ganancias", key: "retGanancias", width: 16, style: { numFmt: MONEY_FMT } },
      { header: "Retención Rentas", key: "retRentas", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Retención SUSS", key: "retSuss", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Retención TISSH", key: "retTissh", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Retención bancaria", key: "retBancaria", width: 16, style: { numFmt: MONEY_FMT } },
      { header: "Comisión bancaria", key: "comisionBancaria", width: 16, style: { numFmt: MONEY_FMT } },
      { header: "Total", key: "total", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Pagada", key: "pagada", width: 10 },
      { header: "Fecha de pago (sistema)", key: "paidAt", width: 18, style: { numFmt: DATE_FMT } },
      { header: "Monto pagado", key: "paidAmount", width: 14, style: { numFmt: MONEY_FMT } },
      { header: "Fecha de pago (informada)", key: "paymentDate", width: 20, style: { numFmt: DATE_FMT } },
      { header: "Referencia de pago", key: "paymentReference", width: 20 },
    ];

    for (const f of data.facturas) {
      sheet.addRow({
        cliente: f.account.customer.displayName,
        tipoCuenta: f.account.accountKind === "TRANSITORIA" ? "Transitoria" : "Corporativa",
        billingDate: f.billingDate,
        vencimiento: f.estimatedPaymentDate,
        periodFrom: f.periodFrom,
        periodTo: f.periodTo,
        arcaFacturaNumber: f.arcaFacturaNumber ?? "",
        subtotal: f.subtotalCents / 100,
        ivaExento: f.ivaExento ? "Sí" : "No",
        ivaDiscriminado: f.ivaDiscriminado ? "Sí" : "No",
        iva: f.ivaAmountCents / 100,
        retIva: f.ivaRetentionCents / 100,
        retGanancias: f.gananciasRetentionCents / 100,
        retRentas: f.rentasRetentionCents / 100,
        retSuss: f.sussRetentionCents / 100,
        retTissh: f.tisshRetentionCents / 100,
        retBancaria: f.bankWithholdingCents / 100,
        comisionBancaria: f.bankFeesCents / 100,
        total: f.totalAmountCents / 100,
        pagada: f.isPaid ? "Sí" : "No",
        paidAt: f.paidAt ?? null,
        paidAmount: f.paidAmountCents / 100,
        paymentDate: f.paymentDate ?? null,
        paymentReference: f.paymentReference ?? "",
      });
    }

    freezeHeaderRow(sheet);
  }
}
