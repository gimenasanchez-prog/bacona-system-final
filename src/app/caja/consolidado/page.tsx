import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate, getCurrentMonthRange } from "@/lib/dates";
import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";
import { ENVELOPE_STATUS_LABEL } from "@/modules/sobres/lib/envelopeStatus";
import { EnvelopeStatusBadge } from "../sobres/EnvelopeStatusBadge";
import { CloseStaleSessionButton } from "./CloseStaleSessionButton";
import { DeleteSessionButton } from "./DeleteSessionButton";

const SHIFT_LABEL: Record<string, string> = {
  MANIANA: "Mañana",
  TARDE: "Tarde",
  NOCHE: "Noche",
};

function DiffCell({ cents }: { cents: number | null }) {
  if (cents == null) return <span className="text-neutral-300">—</span>;
  if (cents === 0) return <span className="text-green-700">✓</span>;
  return (
    <span className={`font-medium ${cents < 0 ? "text-red-700" : "text-blue-700"}`}>
      {cents < 0 ? `Faltan ${formatArsFromCents(-cents)}` : `Sobran ${formatArsFromCents(cents)}`}
    </span>
  );
}

export default async function ConsolidadoCierresPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  const sp = await props.searchParams;
  const defaultRange = getCurrentMonthRange();
  const fromStr = typeof sp.from === "string" && sp.from ? sp.from : defaultRange.from;
  const toStr = typeof sp.to === "string" && sp.to ? sp.to : defaultRange.to;
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T23:59:59`);
  const shift =
    sp.shift === "MANIANA" || sp.shift === "TARDE" || sp.shift === "NOCHE" ? (sp.shift as any) : undefined;
  const cashSessionStatus = sp.status === "OPEN" || sp.status === "CLOSED" ? (sp.status as any) : "CLOSED";
  const envelopeStatus =
    sp.envelopeStatus === "CLOSED" ||
    sp.envelopeStatus === "RECEIVED" ||
    sp.envelopeStatus === "OPENED" ||
    sp.envelopeStatus === "CONTROLLED" ||
    sp.envelopeStatus === "NOT_CONTROLLED"
      ? (sp.envelopeStatus as any)
      : undefined;
  const employeeId = typeof sp.employeeId === "string" && sp.employeeId ? sp.employeeId : undefined;

  const [employees, rows, internalBreakdown, differenceBreakdown, staleOpenSessions] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    ConsolidatedClosuresService.listCashClosures({
      from,
      to,
      shift,
      employeeId,
      cashSessionStatus,
      envelopeStatus,
    }),
    ConsolidatedClosuresService.getInternalAccountBreakdown({
      from,
      to,
      shift,
      employeeId,
      cashSessionStatus,
      envelopeStatus,
    }),
    ConsolidatedClosuresService.getEnvelopeDifferenceBreakdown({
      from,
      to,
      shift,
      employeeId,
      cashSessionStatus,
      envelopeStatus,
    }),
    ConsolidatedClosuresService.listStaleOpenSessions(),
  ]);
  const staleWithPayments = staleOpenSessions.filter((s) => s.paidCents > 0 || s.expensesCount > 0);

  const totals =
    rows.length > 0
      ? {
          income: rows.reduce((s, r) => s + r.totalIncomeCents, 0),
          expenses: rows.reduce((s, r) => s + r.totalExpensesCents, 0),
          net: rows.reduce((s, r) => s + r.totalNetCents, 0),
          cash: rows.reduce((s, r) => s + r.totalCashCents, 0),
          debit: rows.reduce((s, r) => s + r.totalDebitCents, 0),
          credit: rows.reduce((s, r) => s + r.totalCreditCents, 0),
          transfer: rows.reduce((s, r) => s + r.totalTransferCents, 0),
          qr: rows.reduce((s, r) => s + r.totalQrCents, 0),
          cheque: rows.reduce((s, r) => s + r.totalChequeCents, 0),
          cc: rows.reduce((s, r) => s + r.totalCuentaCorrienteCents, 0),
          internal: rows.reduce((s, r) => s + r.totalCuentasInternasCents, 0),
          envelope: rows.reduce(
            (s, r) => s + (r.envelope?.actualAmountCents ?? r.envelope?.expectedAmountCents ?? 0),
            0
          ),
          cashierShortfall: differenceBreakdown.reduce((s, b) => s + Math.max(0, -(b.cashierDifferenceCents ?? 0)), 0),
          cashierSurplus: differenceBreakdown.reduce((s, b) => s + Math.max(0, b.cashierDifferenceCents ?? 0), 0),
          custodyShortfall: differenceBreakdown.reduce((s, b) => s + Math.max(0, -(b.custodyDifferenceCents ?? 0)), 0),
          custodySurplus: differenceBreakdown.reduce((s, b) => s + Math.max(0, b.custodyDifferenceCents ?? 0), 0),
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Consolidado de Cierres de Caja</div>
          <div className="mt-1 text-sm text-neutral-600">Histórico de cierres + sobres asociados.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/local">
            Caja BCÑ
          </Link>
        </div>
      </div>

      {staleOpenSessions.length > 0 ? (
        <details className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <summary className="cursor-pointer">
            <b>
              {staleOpenSessions.length} {staleOpenSessions.length === 1 ? "turno quedó abierto" : "turnos quedaron abiertos"}
            </b>
            {staleWithPayments.length > 0 ? (
              <>
                {" "}
                · {staleWithPayments.length} con cobros por{" "}
                <b>{formatArsFromCents(staleWithPayments.reduce((a, s) => a + s.paidCents, 0))}</b> que no suman al
                consolidado hasta cerrarlos
              </>
            ) : null}{" "}
            <span className="text-xs">(ver detalle ▾)</span>
          </summary>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {staleOpenSessions.map((s) => (
                <tr key={s.id} className="border-t border-amber-200">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatBusinessDate(s.businessDate)}</td>
                  <td className="py-1.5 pr-2">{SHIFT_LABEL[s.shift] ?? s.shift}</td>
                  <td className="py-1.5 pr-2">{s.employeeName}</td>
                  <td className="py-1.5 pr-2 text-right">{s.paidCents > 0 ? formatArsFromCents(s.paidCents) : "sin cobros"}</td>
                  <td className="py-1.5 pl-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs hover:bg-amber-100" href={`/caja/cierres/${s.id}`}>
                        Ver
                      </Link>
                      {role === "GERENCIA" ? (
                        <CloseStaleSessionButton
                          cashSessionId={s.id}
                          label={`${formatBusinessDate(s.businessDate)} ${SHIFT_LABEL[s.shift] ?? s.shift} — ${s.employeeName}`}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-6">
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Desde</div>
            <input name="from" type="date" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={fromStr} />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Hasta</div>
            <input name="to" type="date" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={toStr} />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Turno</div>
            <select name="shift" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={shift ?? ""}>
              <option value="">—</option>
              <option value="MANIANA">Mañana</option>
              <option value="TARDE">Tarde</option>
              <option value="NOCHE">Noche</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Asociada/o</div>
            <select name="employeeId" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={employeeId ?? ""}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Estado cierre</div>
            <select name="status" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={cashSessionStatus}>
              <option value="CLOSED">Cerrado</option>
              <option value="OPEN">Abierto</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Estado sobre</div>
            <select name="envelopeStatus" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={envelopeStatus ?? ""}>
              <option value="">—</option>
              <option value="CLOSED">{ENVELOPE_STATUS_LABEL.CLOSED}</option>
              <option value="RECEIVED">{ENVELOPE_STATUS_LABEL.RECEIVED}</option>
              <option value="OPENED">{ENVELOPE_STATUS_LABEL.OPENED}</option>
              <option value="CONTROLLED">{ENVELOPE_STATUS_LABEL.CONTROLLED}</option>
              <option value="NOT_CONTROLLED">{ENVELOPE_STATUS_LABEL.NOT_CONTROLLED}</option>
            </select>
          </div>
          <div className="sm:col-span-6 flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Filtrar</button>
          </div>
        </form>
      </div>

      {totals ? (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-3">
            Resumen período · {rows.length} {rows.length === 1 ? "cierre" : "cierres"}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs text-neutral-500">Ingresos</div>
              <div className="text-lg font-semibold">{formatArsFromCents(totals.income)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Egresos</div>
              <div className="text-lg font-semibold">{formatArsFromCents(totals.expenses)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Neto</div>
              <div className="text-lg font-semibold">{formatArsFromCents(totals.net)}</div>
            </div>
          </div>
          <div className="border-t pt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Efectivo</span>
              <span className="font-medium">{formatArsFromCents(totals.cash)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Débito</span>
              <span className="font-medium">{formatArsFromCents(totals.debit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Crédito</span>
              <span className="font-medium">{formatArsFromCents(totals.credit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Transferencia</span>
              <span className="font-medium">{formatArsFromCents(totals.transfer)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">QR</span>
              <span className="font-medium">{formatArsFromCents(totals.qr)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Cheque</span>
              <span className="font-medium">{formatArsFromCents(totals.cheque)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Cta. corriente</span>
              <span className="font-medium">{formatArsFromCents(totals.cc)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Efectivo sobres</span>
              <span className="font-medium">{formatArsFromCents(totals.envelope)}</span>
            </div>
          </div>
          {internalBreakdown.length > 0 ? (
            <details className="mt-2 border-t pt-2 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="text-neutral-500">
                  Ctas. internas <span className="text-xs text-neutral-400">(ver detalle ▾)</span>
                </span>
                <span className="font-medium">{formatArsFromCents(totals.internal)}</span>
              </summary>
              <div className="mt-2 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {internalBreakdown.map((b) => (
                      <tr key={b.employeeId ?? b.employeeName} className="border-b last:border-b-0">
                        <td className="px-3 py-1.5">{b.employeeName}</td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {formatArsFromCents(b.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-sm">
              <span className="text-neutral-500">Ctas. internas</span>
              <span className="font-medium">{formatArsFromCents(totals.internal)}</span>
            </div>
          )}
          {differenceBreakdown.length > 0 && (
            <details className="mt-2 border-t pt-2 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="text-neutral-500">
                  Diferencias de sobres <span className="text-xs text-neutral-400">(ver detalle ▾)</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 text-xs font-medium sm:flex-row sm:gap-3 sm:text-sm">
                  <span>
                    Cajeros: <span className="text-red-700">faltan {formatArsFromCents(totals.cashierShortfall)}</span> ·{" "}
                    <span className="text-blue-700">sobran {formatArsFromCents(totals.cashierSurplus)}</span>
                  </span>
                  <span>
                    Custodia: <span className="text-red-700">faltan {formatArsFromCents(totals.custodyShortfall)}</span> ·{" "}
                    <span className="text-blue-700">sobran {formatArsFromCents(totals.custodySurplus)}</span>
                  </span>
                </span>
              </summary>
              <div className="mt-1 text-xs text-neutral-500">
                Cajero: lo que declaró meter en el sobre al cerrar vs. lo que dice el sistema. Custodia: lo contado al
                abrir vs. lo que declaró el cajero.
              </div>
              <div className="mt-2 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-neutral-500">
                      <th className="px-3 py-1.5 text-left font-medium">Fecha</th>
                      <th className="px-3 py-1.5 text-left font-medium">Turno</th>
                      <th className="px-3 py-1.5 text-left font-medium">Cajero/a</th>
                      <th className="px-3 py-1.5 text-left font-medium">Sobre</th>
                      <th className="px-3 py-1.5 text-right font-medium">Sistema</th>
                      <th className="px-3 py-1.5 text-right font-medium">Declarado</th>
                      <th className="px-3 py-1.5 text-right font-medium">Dif. cajero</th>
                      <th className="px-3 py-1.5 text-right font-medium">Contado al abrir</th>
                      <th className="px-3 py-1.5 text-right font-medium">Dif. custodia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differenceBreakdown.map((b) => (
                      <tr key={b.envelopeId} className="border-b align-top last:border-b-0">
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatBusinessDate(b.businessDate)}</td>
                        <td className="px-3 py-1.5">{SHIFT_LABEL[b.shift] ?? b.shift}</td>
                        <td className="px-3 py-1.5">
                          {b.employeeName}
                          {b.countNote ? <div className="text-xs text-neutral-500">Motivo: {b.countNote}</div> : null}
                          {b.firstCountCents != null &&
                          b.declaredAmountCents != null &&
                          b.firstCountCents !== b.declaredAmountCents ? (
                            <div className="text-xs text-amber-700">
                              Primer conteo {formatArsFromCents(b.firstCountCents)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{b.envelopeCode}</td>
                        <td className="px-3 py-1.5 text-right">{formatArsFromCents(b.expectedAmountCents)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {b.declaredAmountCents == null ? "—" : formatArsFromCents(b.declaredAmountCents)}
                        </td>
                        <td className="px-3 py-1.5 text-right"><DiffCell cents={b.cashierDifferenceCents} /></td>
                        <td className="px-3 py-1.5 text-right">
                          {b.actualAmountCents == null ? "—" : formatArsFromCents(b.actualAmountCents)}
                          {b.openedByName ? <div className="text-xs text-neutral-500">{b.openedByName}</div> : null}
                        </td>
                        <td className="px-3 py-1.5 text-right"><DiffCell cents={b.custodyDifferenceCents} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      ) : null}

      <div className="mt-4 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-white">
            <tr className="border-b">
              <th className="px-2 py-2 text-left font-medium">Fecha</th>
              <th className="px-2 py-2 text-left font-medium">Turno</th>
              <th className="px-2 py-2 text-left font-medium">Asociada/o</th>
              <th className="px-2 py-2 text-right font-medium">Ingresos</th>
              <th className="px-2 py-2 text-right font-medium">Egresos</th>
              <th className="px-2 py-2 text-right font-medium">Neto</th>
              <th className="px-2 py-2 text-right font-medium">Efectivo (sobre)</th>
              <th className="px-2 py-2 text-left font-medium">ID sobre</th>
              <th className="px-2 py-2 text-left font-medium">Estado sobre</th>
              <th className="px-2 py-2 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-2 py-2">{formatBusinessDate(r.businessDate)}</td>
                <td className="px-2 py-2">{r.shift}</td>
                <td className="px-2 py-2">{r.employee.displayName}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalIncomeCents)}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalExpensesCents)}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalNetCents)}</td>
                <td className="px-2 py-2 text-right">
                  <div className="font-semibold">
                    {formatArsFromCents(
                      r.envelope?.actualAmountCents ?? r.envelope?.expectedAmountCents ?? 0
                    )}
                  </div>
                  {r.envelope && r.envelope.actualAmountCents == null && (
                    <div className="text-xs text-neutral-400">esperado</div>
                  )}
                  {r.envelope?.actualAmountCents != null &&
                    r.envelope.actualAmountCents !== r.envelope.expectedAmountCents && (
                      <div className="text-xs text-orange-600">
                        esperado {formatArsFromCents(r.envelope.expectedAmountCents)}
                      </div>
                    )}
                </td>
                <td className="px-2 py-2 font-mono text-xs">{r.envelope?.envelopeCode ?? "—"}</td>
                <td className="px-2 py-2">
                  <EnvelopeStatusBadge envelope={r.envelope} />
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Link className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50" href={`/caja/cierres/${r.id}`}>
                      Ver cierre
                    </Link>
                    {r.envelope ? (
                      <Link className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50" href={`/caja/sobres/${r.envelope.id}`}>
                        Ver sobre
                      </Link>
                    ) : null}

                    <DeleteSessionButton
                      cashSessionId={r.id}
                      label={`${formatBusinessDate(r.businessDate)} ${r.shift} — ${r.employee.displayName}`}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-2 py-6 text-center text-sm text-neutral-600" colSpan={10}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

