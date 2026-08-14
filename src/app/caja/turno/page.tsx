import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { closeCashSessionAction } from "@/modules/caja/actions/cashSessionActions";
import { CloseCashSessionButton } from "./CloseCashSessionButton";
import { prisma } from "@/lib/prisma";
import { LocalExpenseModal } from "./LocalExpenseModal";
import { EnvelopeDepositCard } from "./EnvelopeDepositCard";
import { SessionSalesCard } from "./SessionSalesCard";

function LabelValue(props: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{props.label}</div>
      <div className="text-sm font-medium">{props.value}</div>
    </div>
  );
}

function SummaryCard(props: { title: string; amountCents: number; subtle?: boolean }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="text-xs text-neutral-500">{props.title}</div>
      <div className={"mt-1 text-lg font-semibold" + (props.subtle ? " text-neutral-700" : "")}>
        {formatArsFromCents(props.amountCents)}
      </div>
    </div>
  );
}

export default async function CajaTurnoPage() {
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (!cashSessionId) redirect("/caja/abrir");
  const role = (await cookies()).get("bcn_role")?.value ?? null;

  const summary = await CashSessionService.getCashSessionSummary(cashSessionId);
  const [expenses, suppliers, inventoryItems] = await Promise.all([
    prisma.localExpense.findMany({
      where: { cashSessionId },
      include: { supplier: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  const envelope = await prisma.envelope.findUnique({
    where: { cashSessionId },
    select: { envelopeCode: true },
  });

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Tu turno</div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/pos">
            Ir a Ventas
          </Link>
          {role === "GERENCIA" ? (
            <Link
              className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
              href="/caja/consolidado"
            >
              Ver consolidado
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <LabelValue
            label="Fecha"
            value={formatBusinessDate(summary.cashSession.businessDate)}
          />
          <LabelValue
            label="Apertura"
            value={new Date(summary.cashSession.openedAt).toLocaleString("es-AR")}
          />
          <LabelValue
            label="Cierre"
            value={summary.cashSession.closedAt ? new Date(summary.cashSession.closedAt).toLocaleString("es-AR") : "—"}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <SummaryCard title="Total ingreso del turno" amountCents={summary.totals.totalIncomeCents} />
        <SummaryCard title="Egresos (total)" amountCents={summary.totals.totalExpensesCents} subtle />
        <SummaryCard title="Total neto del cierre" amountCents={summary.totals.totalNetCents} />
        <SummaryCard title="Efectivo esperado en sobre" amountCents={summary.totals.expectedEnvelopeAmountCents} />
      </div>

      <div className="mt-4">
        <SessionSalesCard />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Resumen monetario por método</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <LabelValue label="Efectivo" value={formatArsFromCents(summary.totals.EFECTIVO)} />
            <LabelValue label="Débito" value={formatArsFromCents(summary.totals.DEBITO)} />
            <LabelValue label="Crédito" value={formatArsFromCents(summary.totals.CREDITO)} />
            <LabelValue label="Transferencia" value={formatArsFromCents(summary.totals.TRANSFERENCIA)} />
            <LabelValue label="QR" value={formatArsFromCents(summary.totals.QR)} />
            <LabelValue
              label="Cuenta corriente"
              value={formatArsFromCents(summary.totals.CUENTA_CORRIENTE)}
            />
            <LabelValue
              label="Cuentas internas"
              value={formatArsFromCents(summary.totals.CUENTAS_INTERNAS)}
            />
            <LabelValue
              label="Egresos (efectivo del turno)"
              value={formatArsFromCents(summary.totals.totalShiftCashExpensesCents)}
            />
            <LabelValue
              label="Egresos (Caja BCN)"
              value={formatArsFromCents(summary.totals.totalLocalCashExpensesCents)}
            />
          </div>

          {summary.breakdownDetails.cuentaCorriente.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Detalle cuenta corriente</summary>
              <div className="mt-2 space-y-2 text-sm">
                {summary.breakdownDetails.cuentaCorriente.map((d) => (
                  <div key={d.referenceId} className="flex items-center justify-between">
                    <div className="text-neutral-700">{d.referenceName}</div>
                    <div className="font-semibold">{formatArsFromCents(d.amountCents)}</div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {summary.breakdownDetails.cuentasInternas.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Detalle cuentas internas</summary>
              <div className="mt-2 space-y-2 text-sm">
                {summary.breakdownDetails.cuentasInternas.map((d) => (
                  <div key={d.referenceId} className="flex items-center justify-between">
                    <div className="text-neutral-700">{d.referenceName}</div>
                    <div className="font-semibold">{formatArsFromCents(d.amountCents)}</div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Resumen stock del turno</div>
          <div className="mt-2 text-sm text-neutral-600">
            Líneas IN: <b>{summary.stock.linesIn}</b> · Líneas OUT: <b>{summary.stock.linesOut}</b>
          </div>

          {summary.stock.byItem.length ? (
            <div className="mt-3 max-h-[320px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium">Ítem</th>
                    <th className="px-2 py-2 text-left font-medium">Dir</th>
                    <th className="px-2 py-2 text-left font-medium">Ubic.</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-left font-medium">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.stock.byItem.map((r) => (
                    <tr key={`${r.direction}:${r.inventoryItemId}:${r.locationCode}`} className="border-b last:border-b-0">
                      <td className="px-2 py-2">{r.inventoryItemName}</td>
                      <td className="px-2 py-2">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            (r.direction === "OUT"
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700")
                          }
                        >
                          {r.direction}
                        </span>
                      </td>
                      <td className="px-2 py-2">{r.locationCode}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{r.qty}</td>
                      <td className="px-2 py-2">{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              Sin movimientos de stock para este turno todavía.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <EnvelopeDepositCard
          cashSessionId={summary.cashSession.id}
          cashCents={summary.totals.EFECTIVO}
          shiftCashExpensesCents={summary.totals.totalShiftCashExpensesCents}
          expectedEnvelopeAmountCents={summary.totals.expectedEnvelopeAmountCents}
          envelopeCode={envelope?.envelopeCode ?? null}
        />
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Egresos locales del turno</div>
            <div className="mt-1 text-sm text-neutral-600">
              Acá anotás todo lo que se pagó con plata del turno o de la Caja BCÑ: compras, gastos, servicios.
            </div>
          </div>
          <LocalExpenseModal
            cashSessionId={summary.cashSession.id}
            suppliers={suppliers}
            inventoryItems={inventoryItems}
          />
        </div>

        {expenses.length ? (
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
                {expenses.map((e) => (
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
        ) : (
          <div className="mt-3 rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            Sin egresos registrados todavía.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Acciones</div>
            <div className="mt-1 text-sm text-neutral-600">
              Cuando terminás el turno, apretás acá. Antes, asegurate de haber generado el sobre.
            </div>
          </div>
          <form action={closeCashSessionAction} className="flex items-center gap-2">
            <input type="hidden" name="cashSessionId" value={summary.cashSession.id} />
            <CloseCashSessionButton />
          </form>
        </div>
      </div>
    </div>
  );
}

