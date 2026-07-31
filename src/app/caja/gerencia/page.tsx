import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";
import { createLocalCashManualMovementAction } from "@/modules/caja_local/actions/localCashBoxActions";
import { OpenEnvelopeModal } from "../local/OpenEnvelopeModal";
import { BulkOpenEnvelopesPanel } from "../local/BulkOpenEnvelopesPanel";
import { PesosInput } from "@/components/PesosInput";

const PAGE_SIZE = 20;

const SOURCE_TYPE_LABEL: Record<string, string> = {
  ENVELOPE_OPENING: "Apertura de sobre",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  LOCAL_EXPENSE: "Egreso local",
  CHANGE_RETURN: "Vuelto",
  RETIRO_GERENCIA: "Retiro de gerencia",
  SUPPLIER_PAYMENT: "Pago a proveedor",
  COSTO_FIJO_PAYMENT: "Pago de costo fijo",
};

function TypeBadge(props: { type: string }) {
  const isIn = props.type === "IN";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isIn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {isIn ? "Entrada" : "Salida"}
    </span>
  );
}

export default async function CajaGerenciaPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") redirect("/");

  const sp = await props.searchParams;
  const errorMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;
  const pageParam = typeof sp.page === "string" ? parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const box = await LocalCashBoxService.getCajaByName("Caja Gerencia");
  const [balanceCents, envelopeSummary, movementsPage, envelopes] = await Promise.all([
    LocalCashBoxService.getLocalCashBalance(box.id),
    LocalCashBoxService.getEnvelopeCashSummary(),
    LocalCashBoxService.listMovements(box.id, { page, pageSize: PAGE_SIZE }),
    LocalCashBoxService.listAvailableEnvelopes(),
  ]);
  const { movements, total } = movementsPage;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const today = new Date().toISOString().slice(0, 10);
  const returnTo = "/caja/gerencia";

  const envelopeProps = envelopes.map((e) => ({
    id: e.id,
    envelopeCode: e.envelopeCode,
    expectedAmountCents: e.expectedAmountCents,
    cashSession: {
      businessDate: e.cashSession.businessDate.toISOString(),
      shift: e.cashSession.shift,
      employee: { displayName: e.cashSession.employee.displayName },
    },
  }));

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Caja Gerencia</div>
          <div className="mt-1 text-sm text-neutral-600">
            Efectivo acumulado de sobres y entregas del personal.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/consolidado">
            Consolidado
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
          <div className="text-sm font-semibold">Apertura de sobres</div>
          <div className="mt-1 text-sm text-neutral-600">
            Abrí sobres uno por uno o todos juntos. El efectivo va a Caja Gerencia.
          </div>
          <div className="mt-4 flex gap-2">
            <OpenEnvelopeModal
              envelopes={envelopeProps}
              localCashBoxId={box.id}
              returnTo={returnTo}
            />
            <BulkOpenEnvelopesPanel
              envelopes={envelopeProps}
              localCashBoxId={box.id}
              returnTo={returnTo}
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
            <span className="text-sm text-neutral-700">Caja Gerencia (efectivo en caja)</span>
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

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Anotar entrada o salida de plata</div>
        <div className="mt-1 text-sm text-neutral-600">
          Usalo cuando necesitás anotar plata que entró o salió fuera de lo normal.
        </div>

        <form action={createLocalCashManualMovementAction} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="localCashBoxId" value={box.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
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
            <input name="description" type="text" className="w-full rounded-md border px-2 py-2 text-sm" placeholder="Ej: pago de sueldos" />
          </div>
          <label className="sm:col-span-4 flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" name="isRetiroGerencia" value="1" />
            Es un retiro de gerencia (queda categorizado como tal, no un ajuste genérico)
          </label>
          <div className="sm:col-span-4 flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Registrar</button>
          </div>
        </form>
        <div className="mt-2 text-xs text-neutral-500">
          Para pagar a un proveedor o un costo fijo específico usá el{" "}
          <a href="/egresos" className="underline">módulo de Egresos</a> — queda registrado contra la deuda del proveedor o el costo fijo correspondiente.
        </div>
      </div>

      <div className="mt-4 text-sm font-semibold">Historial de movimientos</div>
      <div className="mt-2 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-white">
            <tr className="border-b">
              <th className="px-2 py-2 text-left font-medium">Fecha</th>
              <th className="px-2 py-2 text-left font-medium">Tipo</th>
              <th className="px-2 py-2 text-left font-medium">Origen</th>
              <th className="px-2 py-2 text-left font-medium">Referencia</th>
              <th className="px-2 py-2 text-left font-medium">Motivo</th>
              <th className="px-2 py-2 text-right font-medium">Monto</th>
              <th className="px-2 py-2 text-right font-medium">Saldo caja</th>
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
                <td className="px-2 py-2 text-xs">{m.description ?? "—"}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(m.amountCents)}</td>
                <td className="px-2 py-2 text-right">{formatArsFromCents(m.balanceAfterCents)}</td>
                <td className="px-2 py-2">{m.createdByEmployee.displayName}</td>
              </tr>
            ))}
            {!movements.length ? (
              <tr>
                <td className="px-2 py-6 text-center text-sm text-neutral-600" colSpan={8}>
                  Sin movimientos todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
            <Link
              className={`rounded-md border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-neutral-50"}`}
              href={`/caja/gerencia?page=${page - 1}`}
            >
              Anterior
            </Link>
            <span className="text-neutral-600">
              Página {page} de {totalPages}
            </span>
            <Link
              className={`rounded-md border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-neutral-50"}`}
              href={`/caja/gerencia?page=${page + 1}`}
            >
              Siguiente
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
