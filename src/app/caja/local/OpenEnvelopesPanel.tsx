"use client";

import { useState } from "react";
import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { openEnvelopesAction } from "@/modules/caja_local/actions/localCashBoxActions";

type Envelope = {
  id: string;
  envelopeCode: string;
  cashSession: {
    businessDate: string | Date;
    shift: string;
    employee: { displayName: string };
  };
};

const SHIFT_LABEL: Record<string, string> = {
  MANIANA: "Mañana",
  TARDE: "Tarde",
  NOCHE: "Noche",
};

function pesosToCents(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/**
 * Apertura de sobres en Caja BCÑ, uno o todos juntos. Conteo a ciegas: no se muestra cuánto
 * debería haber; la comparación contra lo que declaró el cajero se ve después de confirmar.
 */
export function OpenEnvelopesPanel({ envelopes }: { envelopes: Envelope[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!envelopes.length) {
    return <div className="text-sm text-neutral-500">No hay sobres recibidos para abrir.</div>;
  }

  if (!selectedIds) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedIds(new Set())}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        >
          Abrir sobres
        </button>
        {envelopes.length > 1 && (
          <button
            onClick={() => setSelectedIds(new Set(envelopes.map((e) => e.id)))}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Abrir todos ({envelopes.length})
          </button>
        )}
      </div>
    );
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRows = envelopes.filter((e) => selectedIds.has(e.id));
  const counted = selectedRows.map((e) => pesosToCents(amounts[e.id] ?? ""));
  const allFilled = selectedRows.length > 0 && counted.every((c) => c !== null);
  const totalCounted = counted.reduce<number>((s, c) => s + (c ?? 0), 0);

  const batchPayload = selectedRows.map((e, i) => ({
    envelopeId: e.id,
    actualAmountCents: counted[i] ?? 0,
    notes: notes[e.id]?.trim() || undefined,
  }));

  return (
    <div className="mt-2 rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Abrir y contar sobres</div>
          <div className="text-xs text-neutral-500">
            Marcá los sobres que abrís, contá la plata de cada uno y cargá lo que contaste. Después de confirmar
            te mostramos si coincide con lo que declaró el cajero.
          </div>
        </div>
        <button onClick={() => setSelectedIds(null)} className="text-xs text-neutral-400 hover:text-neutral-600">
          Cancelar
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr className="border-b">
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === envelopes.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < envelopes.length;
                  }}
                  onChange={(e) => setSelectedIds(e.target.checked ? new Set(envelopes.map((x) => x.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Sobre</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Cajero/a</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Fecha</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Turno</th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600">Contado ($)</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Nota (opcional)</th>
            </tr>
          </thead>
          <tbody>
            {envelopes.map((row) => {
              const selected = selectedIds.has(row.id);
              return (
                <tr key={row.id} className={`border-b last:border-b-0 ${!selected ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected} onChange={() => toggle(row.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.envelopeCode}</td>
                  <td className="px-3 py-2">{row.cashSession.employee.displayName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatBusinessDate(row.cashSession.businessDate)}</td>
                  <td className="px-3 py-2">{SHIFT_LABEL[row.cashSession.shift] ?? row.cashSession.shift}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-neutral-400">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amounts[row.id] ?? ""}
                        disabled={!selected}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        className="w-28 rounded border px-2 py-1 text-right text-sm font-semibold disabled:bg-neutral-100"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={notes[row.id] ?? ""}
                      disabled={!selected}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="w-full min-w-32 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr className="border-t">
              <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-neutral-600">
                Total contado ({selectedIds.size} sobre{selectedIds.size === 1 ? "" : "s"})
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold">{formatArsFromCents(totalCounted)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <div className="text-xs text-neutral-500">
          {selectedIds.size === 0
            ? "Marcá al menos un sobre."
            : !allFilled
              ? "Cargá el monto contado de cada sobre marcado."
              : ""}
        </div>
        <form action={openEnvelopesAction} onSubmit={() => setSubmitting(true)}>
          <input type="hidden" name="batch" value={JSON.stringify(batchPayload)} />
          <button
            type="submit"
            disabled={!allFilled || submitting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? "Guardando…" : `Confirmar ${selectedIds.size} sobre${selectedIds.size === 1 ? "" : "s"}`}
          </button>
        </form>
      </div>
    </div>
  );
}
