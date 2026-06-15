"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createCcDirectChargeAction,
  type CcDirectChargeState,
} from "@/modules/cuentas_corrientes/actions/ccDirectChargeActions";

const CATEGORY_LABELS: Record<string, string> = {
  CONSUMO_OLVIDADO: "Consumo olvidado",
  SERVICIO_ESPECIAL: "Servicio especial",
  CORRECCION: "Corrección",
  OTRO: "Otro",
};

type Account = { id: string; customerName: string };

export function CargosDirectosModal({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);

  const initialState: CcDirectChargeState = useMemo(() => ({ error: null, createdId: null }), []);
  const [state, action, pending] = useActionState(createCcDirectChargeAction, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (state.createdId) {
      setOpen(false);
      onCreated();
    }
  }, [state.createdId, onCreated]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
      >
        + Cargo directo a CC
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-base font-semibold">Cargo directo a cuenta corriente</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Para consumos olvidados, servicios especiales o correcciones. El monto impacta en el período según la fecha elegida.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-2 py-1 text-sm text-neutral-500"
              >
                Cerrar
              </button>
            </div>

            <form action={action} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium">Cuenta corriente</label>
                <select
                  name="cuentaCorrienteAccountId"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>— Seleccioná una cuenta —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.customerName}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Fecha del consumo</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={today}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    required
                  />
                  <div className="text-xs text-neutral-400">Determina en qué período cae el cargo</div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">Categoría</label>
                  <select name="category" className="w-full rounded-md border px-3 py-2 text-sm" required>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Descripción <span className="text-red-500">(obligatoria)</span></label>
                <input
                  type="text"
                  name="description"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Almuerzo grupal 12/06, Servicio catering evento"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Motivo <span className="text-red-500">(obligatorio)</span></label>
                <textarea
                  name="motive"
                  rows={2}
                  className="w-full rounded-md border px-3 py-2 text-sm resize-none"
                  placeholder="Ej: El personal no registró la venta en el momento. / Servicio especial acordado con el cliente."
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Monto (en pesos)</label>
                <input
                  type="number"
                  name="amountCents"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: 15000"
                  min={1}
                  step={1}
                  required
                />
                <div className="text-xs text-neutral-400">Ingresá el importe en pesos. Se guarda en centavos internamente.</div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">N° de comanda <span className="text-neutral-400">(opcional)</span></label>
                <input
                  type="text"
                  name="comandaNumber"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: 042"
                />
              </div>

              {state.error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {state.error}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Registrar cargo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
