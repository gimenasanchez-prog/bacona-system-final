import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import { parseDateRange } from "@/modules/reportes/lib/dateRange";
import { ReportesDataService, ReportRangeTooLargeError } from "@/modules/reportes/services/reportesDataService";

export const dynamic = "force-dynamic";

export default async function ReportesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  const sp = await props.searchParams;
  const { from, to } = parseDateRange(sp);

  let data: Awaited<ReturnType<typeof ReportesDataService.getReportData>> | null = null;
  let errorMsg: string | null = null;

  if (from && to) {
    try {
      data = await ReportesDataService.getReportData({ from, to });
    } catch (err) {
      errorMsg = err instanceof ReportRangeTooLargeError ? err.message : "No se pudo generar el reporte.";
    }
  }

  const exportHref =
    from && to
      ? `/api/reportes/export?from=${typeof sp.from === "string" ? sp.from : ""}&to=${typeof sp.to === "string" ? sp.to : ""}`
      : null;

  const paymentTotals = data
    ? data.ventasPorDia.reduce(
        (acc, d) => ({
          cash: acc.cash + d.cashCents,
          debit: acc.debit + d.debitCents,
          credit: acc.credit + d.creditCents,
          transfer: acc.transfer + d.transferCents,
          qr: acc.qr + d.qrCents,
          cheque: acc.cheque + d.chequeCents,
          cc: acc.cc + d.ccCents,
          internal: acc.internal + d.internalCents,
        }),
        { cash: 0, debit: 0, credit: 0, transfer: 0, qr: 0, cheque: 0, cc: 0, internal: 0 }
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <div>
        <div className="text-lg font-semibold">Reportes</div>
        <div className="mt-1 text-sm text-neutral-600">
          Ventas por método de pago, egresos con dinero de sobres y facturación de cuentas corrientes de un período,
          con export a Excel.
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Desde</div>
            <input
              name="from"
              type="date"
              className="w-full rounded-md border px-2 py-1 text-sm"
              defaultValue={typeof sp.from === "string" ? sp.from : ""}
              required
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Hasta</div>
            <input
              name="to"
              type="date"
              className="w-full rounded-md border px-2 py-1 text-sm"
              defaultValue={typeof sp.to === "string" ? sp.to : ""}
              required
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Ver resumen</button>
          </div>
        </form>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {!from || !to ? (
        <div className="mt-4 text-sm text-neutral-500">Elegí un rango de fechas para ver el resumen y exportar.</div>
      ) : null}

      {data && paymentTotals ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-3">
              Resumen período · {data.cierres.length} {data.cierres.length === 1 ? "cierre" : "cierres"}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Efectivo</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.cash)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Débito</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.debit)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Crédito</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.credit)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Transferencia</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.transfer)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">QR</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.qr)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Cheque</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.cheque)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Cta. corriente</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.cc)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Ctas. internas</span>
                <span className="font-medium">{formatArsFromCents(paymentTotals.internal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span className="text-neutral-500">Total ventas</span>
                <span>{formatArsFromCents(data.totals.ventasTotalCents)}</span>
              </div>
            </div>
            <div className="mt-3 border-t pt-2 text-xs text-neutral-400">
              &quot;Cta. corriente&quot; es lo registrado en el cierre de cada turno (igual que en Consolidado de Caja) — puede no
              coincidir con el módulo de Cuentas Corrientes si hubo ventas con cuenta corriente canceladas después del
              cierre del turno, o cargos directos a la cuenta (que no son ventas del POS).
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-xs text-neutral-500">Egresos con dinero de sobres</div>
              <div className="mt-1 text-lg font-semibold">{formatArsFromCents(data.totals.egresosTotalCents)}</div>
              <div className="mt-1 text-xs text-neutral-500">{data.egresos.length} movimientos</div>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-xs text-neutral-500">Facturado (cuentas corrientes)</div>
              <div className="mt-1 text-lg font-semibold">{formatArsFromCents(data.totals.facturadoTotalCents)}</div>
              <div className="mt-1 text-xs text-neutral-500">{data.facturas.length} facturas</div>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-xs text-neutral-500">Cobrado (cuentas corrientes)</div>
              <div className="mt-1 text-lg font-semibold">{formatArsFromCents(data.totals.cobradoTotalCents)}</div>
            </div>
          </div>

          {exportHref ? (
            <a
              href={exportHref}
              className="inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Exportar a Excel
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
