import Link from "next/link";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  ENVELOPE_STATUS_LABEL,
  envelopeDifferenceCents,
} from "@/modules/sobres/lib/envelopeStatus";
import { EnvelopeStatusBadge } from "../EnvelopeStatusBadge";

export default async function SobreDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const envelope = await prisma.envelope.findUnique({
    where: { id },
    include: { cashSession: { include: { employee: true } } },
  });
  if (!envelope) throw new Error("Envelope not found");
  const diff = envelopeDifferenceCents(envelope);

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Detalle sobre</div>
          <div className="mt-1 text-sm text-neutral-600">
            <span className="font-mono">{envelope.envelopeCode}</span> · <EnvelopeStatusBadge envelope={envelope} />
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
            <div>Contado</div>
            <div className="font-semibold">{envelope.actualAmountCents == null ? "—" : formatArsFromCents(envelope.actualAmountCents)}</div>
          </div>
        </div>
      </div>

      {diff != null ? (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${diff === 0 ? "border-green-200 bg-green-50 text-green-800" : diff < 0 ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
        >
          {diff === 0
            ? "El monto contado coincide con el esperado."
            : diff < 0
              ? `Faltan ${formatArsFromCents(-diff)} respecto de lo esperado.`
              : `Sobran ${formatArsFromCents(diff)} respecto de lo esperado.`}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border bg-neutral-50 p-4 text-sm text-neutral-600">
          {ENVELOPE_STATUS_LABEL[envelope.status]}. El sobre se controla al abrirlo y contarlo desde Caja BCÑ o Caja
          Gerencia.
        </div>
      )}

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

