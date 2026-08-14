"use client";

import { useState } from "react";
import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { openAndControlEnvelopeBatchAction } from "@/modules/caja_local/actions/localCashBoxActions";

type Envelope = {
  id: string;
  envelopeCode: string;
  expectedAmountCents: number;
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

export function BulkOpenEnvelopesPanel({
  envelopes,
  localCashBoxId,
  returnTo,
}: {
  envelopes: Envelope[];
  localCashBoxId?: string;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(envelopes.map((e) => [e.id, String(e.expectedAmountCents / 100)]))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(envelopes.map((e) => e.id))
  );
  const [submitting, setSubmitting] = useState(false);

  if (envelopes.length < 2) return null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = envelopes.map((e) => {
    const raw = amounts[e.id] ?? "";
    const actualCents = raw !== "" && !isNaN(parseFloat(raw)) ? Math.round(parseFloat(raw) * 100) : null;
    const diff = actualCents !== null ? actualCents - e.expectedAmountCents : null;
    return { ...e, actualCents, diff, selected: selectedIds.has(e.id) };
  });

  const selectedRows = rows.filter((r) => r.selected);
  const totalExpected = selectedRows.reduce((s, r) => s + r.expectedAmountCents, 0);
  const totalActual = selectedRows.reduce((s, r) => s + (r.actualCents ?? 0), 0);
  const allFilled = selectedRows.length > 0 && selectedRows.every((r) => r.actualCents !== null);

  const batchPayload = selectedRows
    .filter((r) => r.actualCents !== null)
    .map((r) => ({ envelopeId: r.id, actualAmountCents: r.actualCents! }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
      >
        Abrir todos ({envelopes.length})
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Apertura masiva de sobres</div>
          <div className="text-xs text-neutral-500">
            Revisá o ajustá cada monto y confirmá todo junto.
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
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
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? new Set(envelopes.map((x) => x.id)) : new Set())
                  }
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Sobre</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Asociada/o</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Fecha</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600">Turno</th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600">Esperado</th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600">Contado ($)</th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b last:border-b-0 ${!row.selected ? "opacity-40" : ""}`}
              >
                <td className="px-3 py-2">
                  <input type="checkbox" checked={row.selected} onChange={() => toggle(row.id)} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.envelopeCode}</td>
                <td className="px-3 py-2">{row.cashSession.employee.displayName}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatBusinessDate(row.cashSession.businessDate)}
                </td>
                <td className="px-3 py-2">{SHIFT_LABEL[row.cashSession.shift] ?? row.cashSession.shift}</td>
                <td className="px-3 py-2 text-right">{formatArsFromCents(row.expectedAmountCents)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-neutral-400">$</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={amounts[row.id] ?? ""}
                      disabled={!row.selected}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className="w-28 rounded border px-2 py-1 text-right text-sm font-semibold disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium">
                  {row.diff === null ? (
                    <span className="text-neutral-300">—</span>
                  ) : row.diff === 0 ? (
                    <span className="text-green-700">✓</span>
                  ) : (
                    <span className="text-red-700">
                      {row.diff > 0 ? "+" : ""}
                      {formatArsFromCents(row.diff)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr className="border-t">
              <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-neutral-600">
                Total ({selectedIds.size} sobre{selectedIds.size === 1 ? "" : "s"})
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold">
                {formatArsFromCents(totalExpected)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold">
                {formatArsFromCents(totalActual)}
              </td>
              <td className="px-3 py-2 text-right text-xs font-semibold">
                {allFilled && (
                  <span className={totalActual - totalExpected === 0 ? "text-green-700" : "text-red-700"}>
                    {totalActual - totalExpected === 0
                      ? "✓"
                      : `${totalActual > totalExpected ? "+" : ""}${formatArsFromCents(totalActual - totalExpected)}`}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <div className="text-xs text-neutral-500">
          {!allFilled && "Completá todos los montos antes de confirmar."}
        </div>
        <form
          action={openAndControlEnvelopeBatchAction}
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="batch" value={JSON.stringify(batchPayload)} />
          {localCashBoxId && <input type="hidden" name="localCashBoxId" value={localCashBoxId} />}
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <button
            type="submit"
            disabled={!allFilled || submitting || selectedIds.size === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting
              ? "Guardando…"
              : `Confirmar ${selectedIds.size} sobre${selectedIds.size === 1 ? "" : "s"}`}
          </button>
        </form>
      </div>
    </div>
  );
}
