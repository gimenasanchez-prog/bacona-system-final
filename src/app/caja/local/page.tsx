import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";
import {
  createLocalCashManualMovementAction,
  controlOpenedEnvelopeAction,
} from "@/modules/caja_local/actions/localCashBoxActions";
import { OpenEnvelopeModal } from "./OpenEnvelopeModal";
import { BulkOpenEnvelopesPanel } from "./BulkOpenEnvelopesPanel";
import { PesosInput } from "@/components/PesosInput";

const SOURCE_TYPE_LABEL: Record<string, string> = {
  ENVELOPE_OPENING: "Apertura de sobre",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  LOCAL_EXPENSE: "Egreso local",
  CHANGE_RETURN: "Vuelto",
};

function TypeBadge(props: { type: string }) {
  const isIn = props.type === "IN";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isIn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {isIn ? "Entrada" : "Salida"}
    </span>
  );
}

export default async function CajaLocalPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "CAJA_LOCAL") redirect("/");

  const sp = await props.searchParams;
  const errorMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const box = await LocalCashBoxService.getActiveLocalCashBox();
  const [balanceCents, envelopeSummary, movements, envelopes, openedEnvelopes] = await Promise.all([
    LocalCashBoxService.getLocalCashBalance(box.id),
    LocalCashBoxService.getEnvelopeCashSummary(),
    LocalCashBoxService.listMovements(box.id),
    LocalCashBoxService.listAvailableEnvelopes(),
    LocalCashBoxService.listOpenedEnvelopes(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Caja BCÑ</div>
          <div className="mt-1 text-sm text-neutral-600">
            Acá ves cuánta plata hay en la caja y todos los movimientos registrados.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/consolidado">
            Consolidado
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/turno">
            Mi turno
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm sm:col-span-1">
          <div className="text-xs text-neutral-500">Caja</div>
          <div className="mt-1 text-base font-semibold">{box.name}</div>
          <div className="mt-3 text-xs text-neutral-500">Plata disponible ahora</div>
          <div className="mt-1 text-2xl font-bold">{formatArsFromCents(balanceCents)}</div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm sm:col-span-2">
          <div className="text-sm font-semibold">Vaciar el sobre en la caja</div>
          <div className="mt-1 text-sm text-neutral-600">
            Seleccioná el sobre, contá el dinero y confirmá el ingreso paso a paso.
          </div>
          <div className="mt-4 flex gap-2">
            <OpenEnvelopeModal
              envelopes={envelopes.map((e) => ({
                id: e.id,
                envelopeCode: e.envelopeCode,
                expectedAmountCents: e.expectedAmountCents,
                cashSession: {
                  businessDate: e.cashSession.businessDate.toISOString(),
                  shift: e.cashSession.shift,
                  employee: { displayName: e.cashSession.employee.displayName },
                },
              }))}
            />
            <BulkOpenEnvelopesPanel
              envelopes={envelopes.map((e) => ({
                id: e.id,
                envelopeCode: e.envelopeCode,
                expectedAmountCents: e.expectedAmountCents,
                cashSession: {
                  businessDate: e.cashSession.businessDate.toISOString(),
                  shift: e.cashSession.shift,
                  employee: { displayName: e.cashSession.employee.displayName },
                },
              }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Efectivo real disponible</div>
        <div className="mt-1 text-xs text-neutral-500">
          Plata física entre la caja y los sobres cerrados todavía no abiertos.
        </div>
        <div className="mt-3 divide-y">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-neutral-700">Caja BCÑ (efectivo en caja)</span>
            <span className="font-semibold">{formatArsFromCents(balanceCents)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-neutral-700">Sobres cerrados sin abrir</span>
              {envelopes.length > 0 && (
                <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                  {envelopes.length}
                </span>
              )}
            </div>
            <span className="font-semibold">{formatArsFromCents(envelopeSummary.closedCents)}</span>
          </div>
          {envelopeSummary.openedPendingCents > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-orange-700">
                Sobres abiertos sin controlar
                <span className="ml-1 text-xs">(ya en caja, pendiente auditoría)</span>
              </span>
              <span className="font-semibold text-orange-700">
                {formatArsFromCents(envelopeSummary.openedPendingCents)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-semibold">Total efectivo real</span>
            <span className="text-lg font-bold">
              {formatArsFromCents(balanceCents + envelopeSummary.closedCents)}
            </span>
          </div>
        </div>
      </div>

      {openedEnvelopes.length > 0 && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-orange-900">
            Sobres abiertos sin controlar ({openedEnvelopes.length})
          </div>
          <div className="mt-1 text-sm text-orange-700">
            Estos sobres fueron abiertos pero no se registró el monto contado. Completá el control.
          </div>
          <div className="mt-3 space-y-3">
            {openedEnvelopes.map((env) => (
              <div key={env.id} className="rounded-lg border border-orange-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold">{env.envelopeCode}</div>
                    <div className="text-xs text-neutral-500">
                      {env.cashSession.employee.displayName} ·{" "}
                      {new Date(env.cashSession.businessDate).toLocaleDateString("es-AR")} ·{" "}
                      {env.cashSession.shift}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Esperado:{" "}
                      <span className="font-medium text-neutral-700">
                        {formatArsFromCents(env.expectedAmountCents)}
                      </span>
                    </div>
                  </div>
                  <form action={controlOpenedEnvelopeAction} className="flex items-end gap-2">
                    <input type="hidden" name="envelopeId" value={env.id} />
                    <div>
                      <div className="mb-1 text-xs text-neutral-500">Monto contado</div>
                      <PesosInput name="actualAmountCents" required min={0} />
                    </div>
                    <button className="rounded-md bg-orange-700 px-3 py-2 text-xs font-medium text-white hover:bg-orange-800">
                      Registrar control
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Anotar entrada o salida de plata</div>
        <div className="mt-1 text-sm text-neutral-600">
          Usalo cuando necesitás anotar plata que entró o salió fuera de lo normal. Queda registrado con nombre y fecha.
        </div>

        <form action={createLocalCashManualMovementAction} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Tipo</div>
            <select name="type" className="w-full rounded-md border px-2 py-2 text-sm" defaultValue="IN">
              <option value="IN">Ingreso</option>
              <option value="OUT">Egreso</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Monto</div>
            <PesosInput name="amountCents" required min={1} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Fecha</div>
            <input name="date" type="date" className="w-full rounded-md border px-2 py-2 text-sm" defaultValue={today} required />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Motivo (opcional)</div>
            <input name="description" type="text" className="w-full rounded-md border px-2 py-2 text-sm" placeholder="Ej: compra de insumos" />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Registrar</button>
          </div>
        </form>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-white">
            <tr className="border-b">
              <th className="px-2 py-2 text-left font-medium">Fecha</th>
              <th className="px-2 py-2 text-left font-medium">Tipo</th>
              <th className="px-2 py-2 text-left font-medium">Origen</th>
              <th className="px-2 py-2 text-left font-medium">Referencia</th>
              <th className="px-2 py-2 text-right font-medium">Monto</th>
              <th className="px-2 py-2 text-left font-medium">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0">
                <td className="px-2 py-2">{new Date(m.date).toLocaleString("es-AR")}</td>
                <td className="px-2 py-2">
                  <TypeBadge type={m.type} />
                </td>
                <td className="px-2 py-2">{SOURCE_TYPE_LABEL[m.sourceType] ?? m.sourceType}</td>
                <td className="px-2 py-2">
                  {m.relatedEnvelope ? (
                    <Link className="font-mono text-xs underline" href={`/caja/sobres/${m.relatedEnvelope.id}`}>
                      {m.relatedEnvelope.envelopeCode}
                    </Link>
                  ) : m.relatedLocalExpense ? (
                    <span className="text-xs">
                      {m.relatedLocalExpense.supplierNameSnapshot}
                      {m.relatedLocalExpense.description
                        ? ` · ${m.relatedLocalExpense.description}`
                        : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(m.amountCents)}</td>
                <td className="px-2 py-2">{m.createdByEmployee.displayName}</td>
              </tr>
            ))}
            {!movements.length ? (
              <tr>
                <td className="px-2 py-6 text-center text-sm text-neutral-600" colSpan={6}>
                  Sin movimientos todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
