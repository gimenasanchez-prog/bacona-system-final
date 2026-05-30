"use client";

import { deleteCashSessionAction } from "@/modules/consolidado_cierres/actions/consolidatedClosuresActions";

export function DeleteSessionButton(props: {
  cashSessionId: string;
  label: string;
}) {
  return (
    <form
      action={deleteCashSessionAction}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar cierre ${props.label}?\n\nEsta acción no se puede deshacer.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
      <button
        type="submit"
        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        Eliminar
      </button>
    </form>
  );
}
