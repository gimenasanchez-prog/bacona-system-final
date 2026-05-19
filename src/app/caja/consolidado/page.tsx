import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { formatArsFromCents } from "@/lib/money";
import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";
import { updateEnvelopeStatusAction } from "@/modules/sobres/actions/envelopeActions";

function EnvelopeBadge(props: { status: string | null }) {
  const status = props.status ?? "—";
  const cls =
    status === "CONTROLLED"
      ? "bg-green-50 text-green-700"
      : status === "NOT_CONTROLLED"
        ? "bg-red-50 text-red-700"
        : status === "OPENED"
          ? "bg-yellow-50 text-yellow-700"
          : status === "CLOSED"
            ? "bg-neutral-100 text-neutral-700"
            : "bg-neutral-100 text-neutral-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export default async function ConsolidadoCierresPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") redirect("/");

  const sp = await props.searchParams;
  const from = typeof sp.from === "string" && sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = typeof sp.to === "string" && sp.to ? new Date(`${sp.to}T23:59:59`) : undefined;
  const shift =
    sp.shift === "MANIANA" || sp.shift === "TARDE" || sp.shift === "NOCHE" ? (sp.shift as any) : undefined;
  const cashSessionStatus = sp.status === "OPEN" || sp.status === "CLOSED" ? (sp.status as any) : "CLOSED";
  const envelopeStatus =
    sp.envelopeStatus === "CLOSED" ||
    sp.envelopeStatus === "OPENED" ||
    sp.envelopeStatus === "CONTROLLED" ||
    sp.envelopeStatus === "NOT_CONTROLLED"
      ? (sp.envelopeStatus as any)
      : undefined;
  const employeeId = typeof sp.employeeId === "string" && sp.employeeId ? sp.employeeId : undefined;

  const [employees, rows] = await Promise.all([
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
  ]);

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

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-6">
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Desde</div>
            <input name="from" type="date" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={typeof sp.from === "string" ? sp.from : ""} />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <div className="text-xs text-neutral-500">Hasta</div>
            <input name="to" type="date" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={typeof sp.to === "string" ? sp.to : ""} />
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
              <option value="CLOSED">Cerrado</option>
              <option value="OPENED">Abierto</option>
              <option value="CONTROLLED">Controlado</option>
              <option value="NOT_CONTROLLED">No controlado</option>
            </select>
          </div>
          <div className="sm:col-span-6 flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Filtrar</button>
          </div>
        </form>
      </div>

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
                <td className="px-2 py-2">{new Date(r.businessDate).toLocaleDateString("es-AR")}</td>
                <td className="px-2 py-2">{r.shift}</td>
                <td className="px-2 py-2">{r.employee.displayName}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalIncomeCents)}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalExpensesCents)}</td>
                <td className="px-2 py-2 text-right font-semibold">{formatArsFromCents(r.totalNetCents)}</td>
                <td className="px-2 py-2 text-right font-semibold">
                  {formatArsFromCents(r.envelope?.expectedAmountCents ?? 0)}
                </td>
                <td className="px-2 py-2 font-mono text-xs">{r.envelope?.envelopeCode ?? "—"}</td>
                <td className="px-2 py-2">
                  <EnvelopeBadge status={r.envelope?.status ?? null} />
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

                    {r.envelope ? (
                      <form action={updateEnvelopeStatusAction} className="flex items-center gap-1">
                        <input type="hidden" name="envelopeId" value={r.envelope.id} />
                        <select
                          name="status"
                          className="rounded-md border px-2 py-1 text-xs"
                          defaultValue={r.envelope.status}
                        >
                          <option value="CLOSED">CERRADO</option>
                          <option value="OPENED">ABIERTO</option>
                          <option value="CONTROLLED">CONTROLADO</option>
                          <option value="NOT_CONTROLLED">NO_CONTROLADO</option>
                        </select>
                        <button className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white">
                          Guardar
                        </button>
                      </form>
                    ) : null}
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

