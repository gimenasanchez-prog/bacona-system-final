"use client";

import { useActionState } from "react";
import { closeStaleSessionAction } from "@/modules/consolidado_cierres/actions/consolidatedClosuresActions";

export function CloseStaleSessionButton(props: { cashSessionId: string; label: string }) {
  const [state, formAction, pending] = useActionState(closeStaleSessionAction, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`¿Cerrar el turno ${props.label}?\n\nSus ventas pasan a figurar en el consolidado.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
      {state?.error ? (
        <div className="mt-1 max-w-xs rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{state.error}</div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "Cerrando…" : "Cerrar turno"}
      </button>
    </form>
  );
}
