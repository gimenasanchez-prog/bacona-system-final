import { formatBusinessDate } from "@/lib/dates";
import { formatArsFromCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { ENVELOPE_OVERDUE_DAYS } from "@/modules/sobres/lib/envelopeStatus";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";
import {
  confirmHandoverAction,
  handoverCustodyAction,
  receiveEnvelopesAction,
} from "@/modules/sobres/actions/envelopeActions";
import { OpenEnvelopesPanel } from "./OpenEnvelopesPanel";

const SHIFT_LABEL: Record<string, string> = { MANIANA: "Mañana", TARDE: "Tarde", NOCHE: "Noche" };

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/** Sobres en Caja BCÑ: quién es la encargada, sobres por recibir, traspasos y apertura. */
export async function EnvelopeCustodySection(props: { employeeId: string | null; isGerencia: boolean }) {
  const [overview, employees] = await Promise.all([
    EnvelopeCustodyService.getCustodyOverview(),
    prisma.employee.findMany({
      where: { isActive: true, role: { in: ["ASOCIADO", "CAJA_LOCAL", "GERENCIA"] } },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);
  const { custodian, toReceive, readyToOpen, withOthers, pendingHandover } = overview;
  const isCustodian = !!custodian && custodian.id === props.employeeId;
  const canHandover = props.isGerencia || isCustodian;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-neutral-500">Encargada de sobres</div>
            <div className="text-base font-semibold">{custodian?.displayName ?? "Sin definir"}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Es la única que recibe y abre sobres. Cuando sale de vacaciones, pasale los sobres a quien la cubre.
            </div>
          </div>
          {canHandover && (
            <form action={handoverCustodyAction} className="flex items-end gap-2">
              <div>
                <div className="mb-1 text-xs text-neutral-500">Pasar sobres a</div>
                <select name="toEmployeeId" required className="rounded-md border px-2 py-2 text-sm" defaultValue="">
                  <option value="" disabled>
                    Elegí…
                  </option>
                  {employees
                    .filter((e) => e.id !== custodian?.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.displayName}
                      </option>
                    ))}
                </select>
              </div>
              <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
                Pasar
              </button>
            </form>
          )}
        </div>
      </div>

      {isCustodian && pendingHandover && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-amber-900">
            {pendingHandover.fromEmployee?.displayName ?? "La encargada anterior"} te pasó{" "}
            {pendingHandover.items.length} sobre{pendingHandover.items.length === 1 ? "" : "s"}
          </div>
          <div className="mt-1 text-sm text-amber-800">
            Marcá los que tenés físicamente y confirmá. Los que no marques quedan a cargo de{" "}
            {pendingHandover.fromEmployee?.displayName ?? "la encargada anterior"}.
          </div>
          <form action={confirmHandoverAction} className="mt-3 space-y-2">
            <input type="hidden" name="handoverId" value={pendingHandover.id} />
            {pendingHandover.items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="envelopeId" value={item.envelopeId} defaultChecked />
                <span className="font-mono text-xs">{item.envelope.envelopeCode}</span>
                <span className="text-neutral-600">
                  · {item.envelope.cashSession.employee.displayName} ·{" "}
                  {formatBusinessDate(item.envelope.cashSession.businessDate)}{" "}
                  {SHIFT_LABEL[item.envelope.cashSession.shift] ?? item.envelope.cashSession.shift}
                </span>
              </label>
            ))}
            <button className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800">
              Confirmar traspaso
            </button>
          </form>
        </div>
      )}

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Sobres por recibir ({toReceive.length})</div>
          {toReceive.length > 0 && (
            <div className="text-sm font-semibold">
              {formatArsFromCents(toReceive.reduce((a, e) => a + (e.declaredAmountCents ?? e.expectedAmountCents), 0))}
            </div>
          )}
        </div>
        <div className="mt-1 text-sm text-neutral-600">
          Sobres sellados que todavía tiene cada cajero.{" "}
          {isCustodian
            ? "Cuando te los den en mano, marcalos y apretá \"Recibí\"."
            : "Los recibe la encargada de sobres."}
        </div>
        {toReceive.length ? (
          <form action={receiveEnvelopesAction} className="mt-3">
            <div className="divide-y rounded-md border">
              {toReceive.map((env) => {
                const days = daysSince(env.depositedAt);
                const overdue = days >= ENVELOPE_OVERDUE_DAYS;
                return (
                  <label
                    key={env.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${overdue ? "bg-red-50" : ""}`}
                  >
                    {isCustodian && <input type="checkbox" name="envelopeId" value={env.id} />}
                    <span className="font-mono text-xs">{env.envelopeCode}</span>
                    <span>Lo tiene {env.cashSession.employee.displayName}</span>
                    <span className="text-neutral-500">
                      {formatBusinessDate(env.cashSession.businessDate)}{" "}
                      {SHIFT_LABEL[env.cashSession.shift] ?? env.cashSession.shift}
                    </span>
                    <span className="ml-auto font-medium">
                      {formatArsFromCents(env.declaredAmountCents ?? env.expectedAmountCents)}
                    </span>
                    <span className={`w-36 text-right text-xs font-medium ${overdue ? "text-red-700" : "text-neutral-500"}`}>
                      {days === 0 ? "hoy" : `hace ${days} día${days === 1 ? "" : "s"}`}
                      {overdue ? " · sin entregar" : ""}
                    </span>
                  </label>
                );
              })}
            </div>
            {isCustodian && (
              <div className="mt-3 flex justify-end">
                <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
                  Recibí los marcados
                </button>
              </div>
            )}
          </form>
        ) : (
          <div className="mt-3 text-sm text-neutral-500">No hay sobres pendientes de entregar.</div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Vaciar sobres en la caja</div>
        <div className="mt-1 mb-3 text-sm text-neutral-600">
          {isCustodian
            ? `Tenés ${readyToOpen.length} sobre${readyToOpen.length === 1 ? "" : "s"} recibido${readyToOpen.length === 1 ? "" : "s"} para abrir, por ${formatArsFromCents(readyToOpen.reduce((a, e) => a + (e.declaredAmountCents ?? e.expectedAmountCents), 0))} en total. Abrí uno o todos juntos.`
            : `Los sobres recibidos los abre ${custodian?.displayName ?? "la encargada de sobres"}.`}
        </div>
        {isCustodian ? (
          <OpenEnvelopesPanel
            envelopes={readyToOpen.map((e) => ({
              id: e.id,
              envelopeCode: e.envelopeCode,
              declaredCents: e.declaredAmountCents ?? e.expectedAmountCents,
              cashSession: {
                businessDate: e.cashSession.businessDate.toISOString(),
                shift: e.cashSession.shift,
                employee: { displayName: e.cashSession.employee.displayName },
              },
            }))}
          />
        ) : (
          <div className="text-sm text-neutral-500">
            {readyToOpen.length} sobre{readyToOpen.length === 1 ? "" : "s"} recibido
            {readyToOpen.length === 1 ? "" : "s"} sin abrir.
          </div>
        )}
      </div>

      {withOthers.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-amber-900">Sobres recibidos en poder de otra persona</div>
          <div className="mt-1 text-sm text-amber-800">
            Quedaron a cargo de alguien que ya no es la encargada (no se confirmaron en un traspaso). Hay que
            ubicarlos y pasarlos a la encargada actual.
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {withOthers.map((env) => (
              <li key={env.id}>
                <span className="font-mono text-xs">{env.envelopeCode}</span> · lo tiene{" "}
                {env.custodianEmployee?.displayName ?? "—"} · {env.cashSession.employee.displayName}{" "}
                {formatBusinessDate(env.cashSession.businessDate)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
