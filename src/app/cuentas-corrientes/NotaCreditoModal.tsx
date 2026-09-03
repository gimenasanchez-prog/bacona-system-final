"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createCcCreditNoteAction,
  type CcCreditNoteState,
} from "@/modules/cuentas_corrientes/actions/ccCreditNoteActions";

export type NotaCreditoTarget =
  | { type: "invoice"; invoiceId: string }
  | { type: "directCharge"; chargeId: string };

export function NotaCreditoModal({ target, label, onClose, onSuccess }: {
  target: NotaCreditoTarget;
  label: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialState: CcCreditNoteState = useMemo(() => ({ error: null, createdId: null }), []);
  const [state, action, pending] = useActionState(createCcCreditNoteAction, initialState);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [ivaExento, setIvaExento] = useState(true);
  const [ivaDiscriminado, setIvaDiscriminado] = useState(false);

  useEffect(() => {
    if (state.createdId) onSuccess();
  }, [state.createdId, onSuccess]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-neutral-800">Nota de crédito</div>
            <div className="text-xs text-neutral-400 mt-0.5">{label}</div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
        </div>
        <form action={action} className="px-6 py-4 space-y-3">
          <input type="hidden" name="targetType" value={target.type} />
          <input type="hidden" name="targetId" value={target.type === "invoice" ? target.invoiceId : target.chargeId} />
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" name="date" defaultValue={today} className="w-full rounded border px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Descripción <span className="text-red-500">(obligatoria)</span></label>
            <input
              type="text"
              name="description"
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Ej: Descuento por reclamo, corrección de importe"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Motivo <span className="text-red-500">(obligatorio)</span></label>
            <textarea
              name="motive"
              rows={2}
              className="w-full rounded border px-3 py-2 text-sm resize-none"
              placeholder="Ej: Cliente reclamó por un error en el pedido."
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto a acreditar (en pesos)</label>
            <input
              type="number"
              name="amountCents"
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Ej: 2000"
              min={0.01}
              step={0.01}
              required
            />
            <div className="text-xs text-neutral-400 mt-1">Reduce lo adeudado sin borrar el cargo o la factura original.</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Número de NC ARCA <span className="text-neutral-400">(opcional)</span></label>
            <input
              type="text"
              name="arcaFacturaNumber"
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Ej: 00001-000045"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="ivaExento"
                checked={ivaExento}
                onChange={(e) => setIvaExento(e.target.checked)}
                className="rounded"
              />
              IVA Exento
            </label>
            {!ivaExento && (
              <div className="space-y-2 pl-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name="ivaDiscriminado"
                    checked={ivaDiscriminado}
                    onChange={(e) => setIvaDiscriminado(e.target.checked)}
                    className="rounded"
                  />
                  IVA Discriminado
                </label>
                {ivaDiscriminado && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Monto IVA ($)</label>
                    <input
                      type="number"
                      name="ivaAmountCents"
                      min={0}
                      step={0.01}
                      defaultValue="0.00"
                      className="w-full rounded border px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {state.error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Guardando..." : "Registrar nota de crédito"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
