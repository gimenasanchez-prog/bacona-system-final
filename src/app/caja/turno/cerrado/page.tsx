import Link from "next/link";

import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";

const SHIFT_LABEL: Record<string, string> = { MANIANA: "Mañana", TARDE: "Tarde", NOCHE: "Noche" };

/** Pantalla final del cierre guiado: código para escribir en el sobre y a quién entregarlo. */
export default async function TurnoCerradoPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sobre } = await props.searchParams;
  const envelope =
    typeof sobre === "string"
      ? await prisma.envelope.findUnique({
          where: { id: sobre },
          select: {
            envelopeCode: true,
            declaredAmountCents: true,
            status: true,
            cashSession: { select: { businessDate: true, shift: true, employee: { select: { displayName: true } } } },
          },
        })
      : null;
  const custodian = envelope ? await EnvelopeCustodyService.getActiveCustodian() : null;

  return (
    <div className="mx-auto w-full max-w-lg p-4">
      <div className="rounded-lg border bg-white p-6 text-center shadow-sm">
        <div className="text-2xl">✓</div>
        <div className="mt-1 text-lg font-semibold">Turno cerrado</div>

        {envelope ? (
          <>
            <div className="mt-4 text-sm text-neutral-600">Escribí este código en el sobre:</div>
            <div className="mt-1 rounded-md border-2 border-dashed border-neutral-400 px-4 py-3 font-mono text-2xl font-bold tracking-wider">
              {envelope.envelopeCode}
            </div>
            <div className="mt-3 text-sm text-neutral-700">
              {envelope.cashSession.employee.displayName} · {formatBusinessDate(envelope.cashSession.businessDate)}{" "}
              {SHIFT_LABEL[envelope.cashSession.shift] ?? envelope.cashSession.shift}
              {envelope.declaredAmountCents != null ? (
                <>
                  {" "}
                  · <b>{formatArsFromCents(envelope.declaredAmountCents)}</b>
                </>
              ) : null}
            </div>
            <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {envelope.status === "RECEIVED"
                ? "El sobre queda a tu cargo como encargada de sobres."
                : `Guardá el sobre y entregáselo en mano a ${custodian?.displayName ?? "la encargada de sobres"}. Hasta que ella lo marque como recibido, es tu responsabilidad.`}
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm text-neutral-600">No hubo efectivo para depositar en sobre.</div>
        )}

        <Link href="/" className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
