"use client";

import { transferToCajaGerenciaAction } from "@/modules/caja_local/actions/localCashBoxActions";
import { formatArsFromCents } from "@/lib/money";

export function EntregarGerenciaButton({ balanceCents }: { balanceCents: number }) {
  return (
    <form
      action={transferToCajaGerenciaAction}
      onSubmit={(e) => {
        if (!confirm(`¿Confirmás la entrega de ${formatArsFromCents(balanceCents)} a gerencia? La caja quedará en $0.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Entregar a gerencia
      </button>
    </form>
  );
}
