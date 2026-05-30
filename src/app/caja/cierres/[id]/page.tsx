import Link from "next/link";

import { formatArsFromCents } from "@/lib/money";
import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";

export default async function CierreDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cashSession = await ConsolidatedClosuresService.getCashClosureDetail(id);

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Detalle cierre</div>
          <div className="mt-1 text-sm text-neutral-600">
            {cashSession.employee.displayName} · {new Date(cashSession.businessDate).toLocaleDateString("es-AR")} ·{" "}
            {cashSession.shift}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/consolidado">
            Volver
          </Link>
          {cashSession.envelope ? (
            <Link
              className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
              href={`/caja/sobres/${cashSession.envelope.id}`}
            >
              Ver sobre
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Ingresos</div>
          <div className="mt-1 text-lg font-semibold">{formatArsFromCents(cashSession.totalIncomeCents)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Egresos</div>
          <div className="mt-1 text-lg font-semibold">{formatArsFromCents(cashSession.totalExpensesCents)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Neto</div>
          <div className="mt-1 text-lg font-semibold">{formatArsFromCents(cashSession.totalNetCents)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Detalle (snapshot)</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          <div className="flex items-center justify-between">
            <div>Efectivo</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalCashCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Débito</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalDebitCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Crédito</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalCreditCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Transferencia</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalTransferCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>QR</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalQrCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Cuenta corriente</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalCuentaCorrienteCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Cuentas internas</div>
            <div className="font-semibold">{formatArsFromCents(cashSession.totalCuentasInternasCents)}</div>
          </div>
        </div>
      </div>

      {(() => {
        const ccDetails = cashSession.paymentDetails.filter((d) => d.type === "CUENTA_CORRIENTE");
        const internalDetails = cashSession.paymentDetails.filter((d) => d.type === "CUENTA_INTERNA");
        if (!ccDetails.length && !internalDetails.length) return null;
        return (
          <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Detalle por cuenta</div>
            {ccDetails.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-neutral-500 mb-1">Cuentas corrientes</div>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <tbody>
                      {ccDetails.map((d) => (
                        <tr key={d.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2">{d.referenceName}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatArsFromCents(d.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {internalDetails.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-neutral-500 mb-1">Cuentas internas</div>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <tbody>
                      {internalDetails.map((d) => (
                        <tr key={d.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2">{d.referenceName}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatArsFromCents(d.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {cashSession.localExpenses.length ? (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Egresos locales</div>
          <div className="mt-3 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium">Fecha</th>
                  <th className="px-2 py-2 text-left font-medium">Categoría</th>
                  <th className="px-2 py-2 text-left font-medium">Proveedor</th>
                  <th className="px-2 py-2 text-left font-medium">Pago</th>
                  <th className="px-2 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {cashSession.localExpenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2">{new Date(e.date).toLocaleDateString("es-AR")}</td>
                    <td className="px-2 py-2">{e.category}</td>
                    <td className="px-2 py-2">{e.supplierNameSnapshot}</td>
                    <td className="px-2 py-2">{e.paymentSource}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(e.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

