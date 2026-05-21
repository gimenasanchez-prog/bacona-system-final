"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import {
  createLocalExpenseAction,
  type CreateLocalExpenseState,
} from "@/modules/egresos_locales/actions/localExpenseActions";

type Supplier = { id: string; name: string };
type InventoryItem = { id: string; name: string; unit: string };

export function LocalExpenseModal(props: {
  cashSessionId: string;
  suppliers: Supplier[];
  inventoryItems: InventoryItem[];
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const initialState: CreateLocalExpenseState = useMemo(() => ({ error: null, createdId: null }), []);
  const [state, action, pending] = useActionState(createLocalExpenseAction, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (state.createdId) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdId]);

  return (
    <>
      <button
        type="button"
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        onClick={() => setOpen(true)}
      >
        Registrar egreso local
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Registrar Egreso Local</div>
                <div className="mt-1 text-sm text-neutral-600">Se calcula e impacta del lado servidor.</div>
              </div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="cashSessionId" value={props.cashSessionId} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium">Categoría</label>
                  <select name="category" className="w-full rounded-md border px-3 py-2 text-sm" required>
                    <option value="APROVISIONAMIENTO_COMIDA_LOCAL">Aprovisionamiento Comida (local)</option>
                    <option value="APROVISIONAMIENTO_BEBIDAS_LOCAL">Aprovisionamiento Bebidas (local)</option>
                    <option value="GAS">Gas</option>
                    <option value="MANTENIMIENTO">Mantenimiento</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium">Fecha</label>
                  <input
                    type="date"
                    name="date"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    defaultValue={today}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium">Proveedor</label>
                  <select name="supplierId" className="w-full rounded-md border px-3 py-2 text-sm" required>
                    <option value="">—</option>
                    {props.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium">Monto (centavos)</label>
                  <input
                    type="number"
                    name="amountCents"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    defaultValue={0}
                    min={1}
                    step={1}
                    required
                  />
                  <div className="text-xs text-neutral-600">Se muestra en ARS al guardar.</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium">Descripción (opcional)</label>
                <input
                  type="text"
                  name="description"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Detalle / justificación"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium">Método de pago</label>
                <select name="paymentSource" className="w-full rounded-md border px-3 py-2 text-sm" defaultValue="SHIFT_CASH">
                  <option value="SHIFT_CASH">Efectivo del turno</option>
                  <option value="LOCAL_CASH">Caja BCN</option>
                </select>
              </div>

              <div className="rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="affectsStock" />
                  Vincular a ingreso de stock (opcional)
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Ítem</label>
                    <select name="inventoryItemId" className="w-full rounded-md border px-3 py-2 text-sm">
                      <option value="">—</option>
                      {props.inventoryItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Cantidad</label>
                    <input
                      type="text"
                      name="qty"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Ej: 1 o 0.250"
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-neutral-600">
                  Si marcás “vincular” pero dejás ítem o cantidad vacíos, no se genera movimiento de stock.
                </div>
              </div>

              {state.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {state.error}
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-neutral-600">
                  Al guardar, el monto se registra en centavos. {formatArsFromCents(0)}
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Guardar egreso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

