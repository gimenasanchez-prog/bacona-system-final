"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import { submitEnvelopeCountAction, type EnvelopeCountState } from "@/modules/sobres/actions/envelopeActions";

type SealedEnvelope = {
  envelopeCode: string;
  status: string;
  declaredAmountCents: number | null;
  expectedAmountCents: number;
  firstCountCents: number | null;
  countNote: string | null;
  selfReceived: boolean;
};

function DifferenceText({ cents }: { cents: number }) {
  if (cents === 0) return <span className="font-semibold text-green-700">coincide ✓</span>;
  return (
    <span className={`font-semibold ${cents < 0 ? "text-red-700" : "text-blue-700"}`}>
      {cents < 0 ? `faltan ${formatArsFromCents(-cents)}` : `sobran ${formatArsFromCents(cents)}`}
    </span>
  );
}

/**
 * Sobre del turno con "primero contar, después ver": el cajero carga lo que contó sin ver el
 * esperado; después el sistema le dice si coincide y, si no, cuánto falta o sobra.
 */
export function EnvelopeDepositCard(props: {
  cashSessionId: string;
  cashCents: number;
  shiftCashExpensesCents: number;
  firstCountDone: boolean;
  envelope: SealedEnvelope | null;
  custodianName: string | null;
}) {
  const router = useRouter();
  const initial: EnvelopeCountState = useMemo(() => ({ error: null, result: null }), []);
  const [state, action, pending] = useActionState(submitEnvelopeCountAction, initial);

  useEffect(() => {
    if (state.result?.status === "SEALED" || state.result?.status === "NO_ENVELOPE") router.refresh();
  }, [state.result, router]);

  if (props.envelope) {
    const env = props.envelope;
    const declared = env.declaredAmountCents;
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Sobre sellado</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div>
            <div className="text-xs text-neutral-500">Código (escribilo en el sobre)</div>
            <div className="font-mono text-sm font-semibold">{env.envelopeCode}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Metiste en el sobre</div>
            <div className="text-sm font-semibold">{declared == null ? "—" : formatArsFromCents(declared)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Según el sistema</div>
            <div className="text-sm font-semibold">{formatArsFromCents(env.expectedAmountCents)}</div>
            <div className="text-xs text-neutral-500">
              Efectivo {formatArsFromCents(props.cashCents)} − gastos {formatArsFromCents(props.shiftCashExpensesCents)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Resultado</div>
            <div className="text-sm">
              {declared == null ? "—" : <DifferenceText cents={declared - env.expectedAmountCents} />}
            </div>
          </div>
        </div>
        {env.firstCountCents != null && declared != null && env.firstCountCents !== declared ? (
          <div className="mt-2 text-xs text-neutral-500">Primer conteo: {formatArsFromCents(env.firstCountCents)}</div>
        ) : null}
        {env.countNote ? <div className="mt-1 text-xs text-neutral-600">Motivo: {env.countNote}</div> : null}
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {env.selfReceived || env.status === "RECEIVED"
            ? "El sobre queda recibido a tu nombre como encargada de sobres."
            : `Guardá el sobre y entregáselo en mano a ${props.custodianName ?? "la encargada de sobres"}. Hasta que ella lo marque como recibido, queda a tu cargo.`}
        </div>
      </div>
    );
  }

  const result = state.result;
  const showRecount = props.firstCountDone || result?.status === "MISMATCH" || result?.status === "NEEDS_NOTE";

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold">Contar el efectivo y sellar el sobre</div>
      <div className="mt-1 text-sm text-neutral-600">
        Contá la plata del cajón y cargá cuánto metés en el sobre. Después te mostramos si coincide con el sistema.
      </div>

      {result?.status === "NO_ENVELOPE" ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          No hay efectivo para depositar: no hace falta sobre. Ya podés cerrar el turno.
        </div>
      ) : null}

      {result?.status === "MISMATCH" || result?.status === "NEEDS_NOTE" ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div>
            No coincide con el sistema: <DifferenceText cents={result.differenceCents} />.
          </div>
          <div className="mt-1">
            Revisá si falta cargar algún egreso en efectivo, si algún cobro con tarjeta, QR o transferencia quedó
            como efectivo (o al revés), y volvé a contar.
          </div>
          {result.status === "NEEDS_NOTE" ? (
            <div className="mt-1 font-medium">
              Si después de revisar sigue sin coincidir, escribí el motivo para poder sellar el sobre.
            </div>
          ) : null}
        </div>
      ) : props.firstCountDone ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Tu primer conteo no coincidió. Revisá y volvé a contar.
        </div>
      ) : null}

      {state.error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      ) : null}

      {result?.status !== "NO_ENVELOPE" ? (
        <form action={action} className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">{showRecount ? "Nuevo conteo ($)" : "Efectivo contado ($)"}</div>
            <input
              key={showRecount ? "recount" : "first"}
              name="countedPesos"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {showRecount ? (
            <div className="space-y-1">
              <div className="text-xs text-neutral-500">Motivo si sigue sin coincidir</div>
              <input name="note" type="text" className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          ) : (
            <div />
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Guardando..." : showRecount ? "Volver a comprobar" : "Comprobar"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
