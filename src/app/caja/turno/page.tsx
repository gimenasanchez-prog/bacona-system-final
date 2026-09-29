import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { closeCashSessionAction, transferOpenTableAction } from "@/modules/caja/actions/cashSessionActions";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";
import { CloseCashSessionButton } from "./CloseCashSessionButton";
import { prisma } from "@/lib/prisma";
import { LocalExpenseModal } from "./LocalExpenseModal";
import { EnvelopeDepositCard } from "./EnvelopeDepositCard";
import { SessionSalesCard } from "./SessionSalesCard";

const SHIFT_LABEL: Record<string, string> = { MANIANA: "Mañana", TARDE: "Tarde", NOCHE: "Noche" };

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

export default async function CajaTurnoPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { aviso, error } = await props.searchParams;
  const errorMsg = typeof error === "string" ? error : null;
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
  const [envelope, countState, custodian, openTables] = await Promise.all([
    prisma.envelope.findUnique({
      where: { cashSessionId },
      select: {
        envelopeCode: true,
        status: true,
        declaredAmountCents: true,
        expectedAmountCents: true,
        firstCountCents: true,
        countNote: true,
        selfReceived: true,
      },
    }),
    prisma.cashSession.findUnique({ where: { id: cashSessionId }, select: { envelopeFirstCountCents: true } }),
    EnvelopeCustodyService.getActiveCustodian(),
    CashSessionService.listOpenTableSales(cashSessionId),
  ]);
  const firstCountDone = countState?.envelopeFirstCountCents != null;

  const isOpen = summary.cashSession.status === "OPEN";
  // "Primero contar, después ver": el efectivo esperado se muestra recién después del primer conteo.
  const revealCash = !isOpen || !!envelope || firstCountDone;
  const hidden = <span className="text-neutral-400">Se ve después de contar el sobre</span>;
  const stale = isOpen && CashSessionService.isStale(summary.cashSession.openedAt);
  const turnoLabel = `${formatBusinessDate(summary.cashSession.businessDate)} (${SHIFT_LABEL[summary.cashSession.shift] ?? summary.cashSession.shift})`;

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      {isOpen && aviso === "cerrar-antes-de-salir" ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Cerrá tu turno antes de salir.</b> Este turno tiene ventas o egresos cargados: si salís sin cerrarlo, no
          aparece en el consolidado. Bajá hasta &quot;Cerrar turno&quot;.
        </div>
      ) : null}
      {isOpen && aviso === "turno-pendiente" ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Tenés un turno anterior sin cerrar: {turnoLabel}.</b> Lo abrimos para que lo cierres primero. Después
          podés abrir el turno de hoy.
        </div>
      ) : null}
      {stale && aviso !== "turno-pendiente" ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <b>Este turno es del {turnoLabel} y sigue abierto.</b> No se pueden cargar ventas nuevas en un turno viejo.
          Cerralo y abrí el turno de hoy.
        </div>
      ) : null}
      {errorMsg ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMsg}</div>
      ) : null}
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

      {revealCash ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <SummaryCard title="Total ingreso del turno" amountCents={summary.totals.totalIncomeCents} />
          <SummaryCard title="Egresos (total)" amountCents={summary.totals.totalExpensesCents} subtle />
          <SummaryCard title="Total neto del cierre" amountCents={summary.totals.totalNetCents} />
          <SummaryCard title="Efectivo esperado en sobre" amountCents={summary.totals.expectedEnvelopeAmountCents} />
        </div>
      ) : null}

      <div className="mt-4">
        <SessionSalesCard />
      </div>

      {isOpen && openTables.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-amber-900">
            Mesas abiertas ({openTables.length})
          </div>
          <div className="mt-1 text-sm text-amber-800">
            Antes de cerrar, cobrá cada mesa desde Ventas o pasala al turno siguiente: la cobra y la pone en su
            sobre quien esté en ese turno.
          </div>
          <div className="mt-3 divide-y rounded-md border border-amber-200 bg-white">
            {openTables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">Mesa {t.table?.label ?? "—"}</span>{" "}
                  <span className="text-neutral-600">· {formatArsFromCents(t.totalCents)}</span>
                  {t.payments.length ? (
                    <span className="ml-2 text-xs text-red-700">Tiene un cobro parcial: terminá de cobrarla</span>
                  ) : null}
                </div>
                {t.payments.length ? null : (
                  <form action={transferOpenTableAction}>
                    <input type="hidden" name="saleId" value={t.id} />
                    <button className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
                      Pasar al turno siguiente
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Resumen monetario por método</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <LabelValue label="Efectivo" value={revealCash ? formatArsFromCents(summary.totals.EFECTIVO) : hidden} />
            <LabelValue label="Débito" value={formatArsFromCents(summary.totals.DEBITO)} />
            <LabelValue label="Crédito" value={formatArsFromCents(summary.totals.CREDITO)} />
            <LabelValue label="Transferencia" value={formatArsFromCents(summary.totals.TRANSFERENCIA)} />
            <LabelValue label="QR" value={formatArsFromCents(summary.totals.QR)} />
            <LabelValue label="Cheque" value={formatArsFromCents(summary.totals.CHEQUE)} />
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
          firstCountDone={firstCountDone}
          envelope={envelope}
          custodianName={custodian?.displayName ?? null}
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
              Cuando terminás el turno, apretás acá. Antes, contá el efectivo, sellá el sobre y resolvé las mesas abiertas.
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

