import Link from "next/link";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { updateEnvelopeStatusAction } from "@/modules/sobres/actions/envelopeActions";

function StatusBadge(props: { status: string }) {
  const cls =
    props.status === "CONTROLLED"
      ? "bg-green-50 text-green-700"
      : props.status === "NOT_CONTROLLED"
        ? "bg-red-50 text-red-700"
        : props.status === "OPENED"
          ? "bg-yellow-50 text-yellow-700"
          : "bg-neutral-100 text-neutral-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{props.status}</span>;
}

export default async function SobreDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const envelope = await prisma.envelope.findUnique({
    where: { id },
    include: { cashSession: { include: { employee: true } } },
  });
  if (!envelope) throw new Error("Envelope not found");

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Detalle sobre</div>
          <div className="mt-1 text-sm text-neutral-600">
            <span className="font-mono">{envelope.envelopeCode}</span> · <StatusBadge status={envelope.status} />
          </div>
        </div>
        <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/consolidado">
          Volver
        </Link>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="flex items-center justify-between">
            <div>Asociada/o</div>
            <div className="font-semibold">{envelope.cashSession.employee.displayName}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Fecha</div>
            <div className="font-semibold">{formatBusinessDate(envelope.cashSession.businessDate)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Turno</div>
            <div className="font-semibold">{envelope.cashSession.shift}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Esperado</div>
            <div className="font-semibold">{formatArsFromCents(envelope.expectedAmountCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Actual</div>
            <div className="font-semibold">{envelope.actualAmountCents == null ? "—" : formatArsFromCents(envelope.actualAmountCents)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Control / flags</div>
        <form action={updateEnvelopeStatusAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="envelopeId" value={envelope.id} />
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Estado</div>
            <select name="status" className="w-full rounded-md border px-2 py-1 text-sm" defaultValue={envelope.status}>
              <option value="CLOSED">CERRADO</option>
              <option value="OPENED">ABIERTO</option>
              <option value="CONTROLLED">CONTROLADO</option>
              <option value="NOT_CONTROLLED">NO_CONTROLADO</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">Monto actual (centavos, opcional)</div>
            <input
              type="number"
              name="actualAmountCents"
              className="w-full rounded-md border px-2 py-1 text-sm"
              defaultValue={envelope.actualAmountCents ?? undefined}
              min={1}
              step={1}
            />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
              Guardar
            </button>
          </div>
        </form>
      </div>

      <div className="mt-4">
        <Link
          className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
          href={`/caja/cierres/${envelope.cashSessionId}`}
        >
          Ver cierre asociado
        </Link>
      </div>
    </div>
  );
}

