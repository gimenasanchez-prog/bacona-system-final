"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import {
  confirmEnvelopeDepositAction,
  type ConfirmEnvelopeState,
} from "@/modules/sobres/actions/envelopeActions";

export function EnvelopeDepositCard(props: {
  cashSessionId: string;
  cashCents: number;
  shiftCashExpensesCents: number;
  expectedEnvelopeAmountCents: number;
  envelopeCode: string | null;
}) {
  const router = useRouter();
  const initial: ConfirmEnvelopeState = useMemo(() => ({ error: null, envelopeCode: null }), []);
  const [state, action, pending] = useActionState(confirmEnvelopeDepositAction, initial);

  useEffect(() => {
    if (state.envelopeCode) router.refresh();
  }, [state.envelopeCode, router]);

  const code = props.envelopeCode ?? state.envelopeCode;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold">Plata en el sobre</div>
      <div className="mt-1 text-sm text-neutral-600">
        Es el efectivo que cobraste en el turno menos lo que gastaste en efectivo. Este monto va al sobre físico.
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-xs text-neutral-500">Efectivo cobrado</div>
          <div className="text-sm font-semibold">{formatArsFromCents(props.cashCents)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Gastos en efectivo</div>
          <div className="text-sm font-semibold">{formatArsFromCents(props.shiftCashExpensesCents)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Lo que va al sobre</div>
          <div className="text-sm font-semibold">{formatArsFromCents(props.expectedEnvelopeAmountCents)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border bg-neutral-50 px-3 py-2 text-sm">
        <div className="text-xs text-neutral-500">Código del sobre</div>
        <div className="mt-0.5 font-mono text-sm">{code ?? "— (sin generar)"} </div>
      </div>

      {state.error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <form action={action} className="mt-3 flex items-center justify-end gap-2">
        <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
        <button
          type="submit"
          disabled={pending || !!code}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={(e) => {
            if (code) return;
            if (!confirm("¿Confirmar depósito en sobre? Esto generará un ID único.")) {
              e.preventDefault();
            }
          }}
        >
          {code ? "Sobre generado" : pending ? "Generando..." : "Confirmar depósito"}
        </button>
      </form>
    </div>
  );
}

