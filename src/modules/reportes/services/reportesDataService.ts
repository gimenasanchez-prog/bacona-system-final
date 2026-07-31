import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";
import { LocalExpenseService } from "@/modules/egresos_locales/services/localExpenseService";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import { SOURCE_TYPE_LABEL, LOCAL_EXPENSE_CATEGORY_LABEL } from "@/modules/caja_local/lib/sourceTypeLabels";

const MAX_CIERRES_ROWS = 5000;

export class ReportRangeTooLargeError extends Error {}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export type SalesByDayRow = {
  dayKey: string;
  date: Date;
  cashCents: number;
  debitCents: number;
  creditCents: number;
  transferCents: number;
  qrCents: number;
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

export type ReportData = Awaited<ReturnType<typeof ReportesDataService.getReportData>>;

export class ReportesDataService {
  static async getReportData(params: { from: Date; to: Date }) {
    const { from, to } = params;

    const [cierres, movimientosCaja, egresosTurno, facturas] = await Promise.all([
      ConsolidatedClosuresService.listCashClosures({
        from,
        to,
        cashSessionStatus: "CLOSED",
        take: MAX_CIERRES_ROWS + 1,
      }),
      LocalCashBoxService.listCashOutMovementsInRange({ from, to }),
      LocalExpenseService.listShiftCashExpensesInRange({ from, to }),
      CuentaCorrienteService.listInvoicesForExport({ from, to }),
    ]);

    if (cierres.length > MAX_CIERRES_ROWS) {
      throw new ReportRangeTooLargeError(
        `El rango elegido tiene más de ${MAX_CIERRES_ROWS} cierres de caja. Acotá el rango de fechas.`
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
          ccCents: 0,
          internalCents: 0,
          totalCents: 0,
        } satisfies SalesByDayRow);
      row.cashCents += c.totalCashCents;
      row.debitCents += c.totalDebitCents;
      row.creditCents += c.totalCreditCents;
      row.transferCents += c.totalTransferCents;
      row.qrCents += c.totalQrCents;
      row.ccCents += c.totalCuentaCorrienteCents;
      row.internalCents += c.totalCuentasInternasCents;
      row.totalCents =
        row.cashCents +
        row.debitCents +
        row.creditCents +
        row.transferCents +
        row.qrCents +
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

    const ventasTotalCents = cierres.reduce((s, c) => s + c.totalIncomeCents, 0);
    const egresosTotalCents = egresos.reduce((s, e) => s + e.amountCents, 0);
    const facturadoTotalCents = facturas.reduce((s, f) => s + f.totalAmountCents, 0);
    const cobradoTotalCents = facturas.reduce((s, f) => s + f.paidAmountCents, 0);

    return {
      from,
      to,
      cierres,
      ventasPorDia,
      egresos,
      facturas,
      totals: { ventasTotalCents, egresosTotalCents, facturadoTotalCents, cobradoTotalCents },
    };
  }
}
