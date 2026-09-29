import Link from "next/link";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  ENVELOPE_STATUS_LABEL,
  envelopeCashierDifferenceCents,
  envelopeCustodyDifferenceCents,
} from "@/modules/sobres/lib/envelopeStatus";
import { EnvelopeStatusBadge } from "../EnvelopeStatusBadge";

function DiffBox(props: { title: string; cents: number | null; empty: string }) {
  const { cents } = props;
  const cls =
    cents == null
      ? "bg-neutral-50 text-neutral-600"
      : cents === 0
        ? "border-green-200 bg-green-50 text-green-800"
        : cents < 0
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-blue-200 bg-blue-50 text-blue-800";
  return (
    <div className={`rounded-lg border p-4 text-sm ${cls}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{props.title}</div>
      <div className="mt-1">
        {cents == null
          ? props.empty
          : cents === 0
            ? "Coincide ✓"
            : cents < 0
              ? `Faltan ${formatArsFromCents(-cents)}`
              : `Sobran ${formatArsFromCents(cents)}`}
      </div>
    </div>
  );
}

export default async function SobreDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const envelope = await prisma.envelope.findUnique({
    where: { id },
    include: {
      cashSession: { include: { employee: true } },
      receivedByEmployee: { select: { displayName: true } },
      custodianEmployee: { select: { displayName: true } },
      openedByEmployee: { select: { displayName: true } },
    },
  });
  if (!envelope) throw new Error("Envelope not found");
  const cashierDiff = envelopeCashierDifferenceCents(envelope);
  const custodyDiff = envelopeCustodyDifferenceCents(envelope);
  const holder =
    envelope.status === "CLOSED"
      ? envelope.cashSession.employee.displayName
      : envelope.status === "RECEIVED"
        ? envelope.custodianEmployee?.displayName ?? "—"
        : "Abierto";

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
            <div>Según el sistema</div>
            <div className="font-semibold">{formatArsFromCents(envelope.expectedAmountCents)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Declarado por el cajero</div>
            <div className="font-semibold">
              {envelope.declaredAmountCents == null ? "—" : formatArsFromCents(envelope.declaredAmountCents)}
            </div>
          </div>
          {envelope.firstCountCents != null && envelope.firstCountCents !== envelope.declaredAmountCents ? (
            <div className="flex items-center justify-between">
              <div>Primer conteo</div>
              <div className="font-semibold">{formatArsFromCents(envelope.firstCountCents)}</div>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <div>Contado al abrir</div>
            <div className="font-semibold">
              {envelope.actualAmountCents == null ? "—" : formatArsFromCents(envelope.actualAmountCents)}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>Lo tiene</div>
            <div className="font-semibold">{holder}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>Recibido por</div>
            <div className="font-semibold">
              {envelope.receivedByEmployee
                ? `${envelope.receivedByEmployee.displayName}${envelope.selfReceived ? " (propio)" : ""}`
                : "—"}
            </div>
          </div>
          {envelope.openedByEmployee ? (
            <div className="flex items-center justify-between">
              <div>Abierto por</div>
              <div className="font-semibold">{envelope.openedByEmployee.displayName}</div>
            </div>
          ) : null}
        </div>
        {envelope.countNote ? (
          <div className="mt-3 text-sm text-neutral-600">Motivo del cajero: {envelope.countNote}</div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DiffBox title="Diferencia de cajero" cents={cashierDiff} empty="Sobre sin conteo al cierre (anterior al cambio)." />
        <DiffBox
          title="Diferencia de custodia"
          cents={custodyDiff}
          empty={`${ENVELOPE_STATUS_LABEL[envelope.status]}. Se ve al abrirlo y contarlo en Caja BCÑ.`}
        />
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

