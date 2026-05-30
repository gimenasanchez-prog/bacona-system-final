"use client";

import { useActionState } from "react";
import { deleteCashSessionAction } from "@/modules/consolidado_cierres/actions/consolidatedClosuresActions";

export function DeleteSessionButton(props: { cashSessionId: string; label: string }) {
  const [state, formAction, pending] = useActionState(deleteCashSessionAction, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar cierre ${props.label}?\n\nEsta acción no se puede deshacer.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
      {state?.error ? (
        <div className="mt-1 max-w-xs rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {state.error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
    </form>
  );
}
