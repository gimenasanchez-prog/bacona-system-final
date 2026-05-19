"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Uom = { id: string; label: string; unit: string; multiplierToBase: string; isDefaultForEntry: boolean };
type InventoryItem = { id: string; name: string; unit: string; displayUnit: string; dimension: string; uoms: Uom[] };
type LossEvent = {
  id: string;
  reasonType: string;
  occurredAt: string;
  notes: string | null;
  location: { code: string; label: string };
  lines: Array<{
    id: string;
    qty: string;
    entryQty: string | null;
    entryUnit: string | null;
    inventoryItem: InventoryItem;
  }>;
};

type FormLine = { inventoryItemId: string; qty: string; unit: string; uomId: string };

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? res.statusText);
  return json as T;
}

const METRIC_BASE: Record<string, number> = { ML: 1, L: 1000, G: 1, KG: 1000, UN: 1 };

function baseEquivalent(line: FormLine, items: InventoryItem[]): string {
  const item = items.find((i) => i.id === line.inventoryItemId);
  if (!item || !line.qty || Number(line.qty) <= 0) return "";
  const qty = Number(line.qty);
  if (line.uomId) {
    const uom = item.uoms.find((u) => u.id === line.uomId);
    if (!uom) return "";
    const base = qty * Number(uom.multiplierToBase);
    return `≈ ${base.toFixed(3).replace(/\.?0+$/, "")} ${item.unit}`;
  }
  if (line.unit === item.unit) return "";
  const m = (METRIC_BASE[line.unit] ?? 1) / (METRIC_BASE[item.unit] ?? 1);
  return `≈ ${(qty * m).toFixed(3).replace(/\.?0+$/, "")} ${item.unit}`;
}

function defaultLineUnit(item: InventoryItem): { unit: string; uomId: string } {
  const defaultUom = item.uoms.find((u) => u.isDefaultForEntry);
  if (defaultUom) return { unit: defaultUom.unit, uomId: defaultUom.id };
  return { unit: item.displayUnit ?? item.unit, uomId: "" };
}

function getUnitOptions(item: InventoryItem): { value: string; label: string }[] {
  const stdUnits: Record<string, string[]> = { VOLUME: ["ML", "L"], MASS: ["G", "KG"], COUNT: ["UN"] };
  const opts: { value: string; label: string }[] = [];
  for (const u of stdUnits[item.dimension] ?? ["UN"]) {
    opts.push({ value: `unit:${u}`, label: u });
  }
  for (const uom of item.uoms) {
    opts.push({ value: `uom:${uom.id}`, label: `${uom.label} (${uom.multiplierToBase} ${item.unit})` });
  }
  return opts;
}

function lineDisplayQty(l: { qty: string; entryQty: string | null; entryUnit: string | null; inventoryItem: InventoryItem }): string {
  if (l.entryQty && l.entryUnit && l.entryUnit !== l.inventoryItem.unit) {
    return `${l.entryQty} ${l.entryUnit} (${l.qty} ${l.inventoryItem.unit})`;
  }
  return `${l.qty} ${l.inventoryItem.unit}`;
}

export default function MermasPage() {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lossEvents, setLossEvents] = useState<LossEvent[]>([]);

  const [form, setForm] = useState<{
    reasonType: "DURING_PRODUCTION" | "DURING_SALE_PREP" | "SPOILED" | "OTHER";
    locationCode: "BACONA" | "SALTA" | "EN_TRANSITO";
    notes: string;
    lines: FormLine[];
  }>({
    reasonType: "SPOILED",
    locationCode: "BACONA",
    notes: "",
    lines: [{ inventoryItemId: "", qty: "1", unit: "UN", uomId: "" }],
  });

  async function refresh() {
    const [it, le] = await Promise.all([
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
      apiGet<{ lossEvents: LossEvent[] }>("/api/mermas/loss-events"),
    ]);
    setItems(it.items);
    setLossEvents(le.lossEvents);
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => {
        if (l.inventoryItemId) return l;
        const first = it.items[0];
        if (!first) return l;
        const { unit, uomId } = defaultLineUnit(first);
        return { ...l, inventoryItemId: first.id, unit, uomId };
      }),
    }));
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, []);

  const canSubmit = useMemo(
    () => form.lines.length > 0 && form.lines.every((l) => l.inventoryItemId && Number(l.qty) > 0),
    [form.lines]
  );

  function updateLine(idx: number, patch: Partial<FormLine>) {
    setForm((p) => {
      const next = [...p.lines];
      next[idx] = { ...next[idx]!, ...patch };
      return { ...p, lines: next };
    });
  }

  function onItemChange(idx: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) { updateLine(idx, { inventoryItemId: itemId }); return; }
    const { unit, uomId } = defaultLineUnit(item);
    updateLine(idx, { inventoryItemId: itemId, unit, uomId });
  }

  function onUnitChange(idx: number, value: string) {
    if (value.startsWith("uom:")) {
      const uomId = value.replace("uom:", "");
      const item = items.find((i) => i.id === form.lines[idx]!.inventoryItemId);
      const uom = item?.uoms.find((u) => u.id === uomId);
      updateLine(idx, { uomId, unit: uom?.unit ?? "" });
    } else {
      updateLine(idx, { unit: value.replace("unit:", ""), uomId: "" });
    }
  }

  function unitSelectValue(line: FormLine): string {
    return line.uomId ? `uom:${line.uomId}` : `unit:${line.unit}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Mermas / Pérdidas</div>
          <div className="text-sm text-neutral-600">Salida de stock con motivo (auditable).</div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Ir a stock</Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[520px_1fr]">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Registrar merma</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">
              Motivo
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.reasonType}
                onChange={(e) => setForm((p) => ({ ...p, reasonType: e.target.value as any }))}
              >
                <option value="DURING_PRODUCTION">Durante producción</option>
                <option value="DURING_SALE_PREP">Durante preparación venta</option>
                <option value="SPOILED">Mal estado / vencido</option>
                <option value="OTHER">Otro</option>
              </select>
            </label>
            <label className="text-xs text-neutral-700">
              Ubicación
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.locationCode}
                onChange={(e) => setForm((p) => ({ ...p, locationCode: e.target.value as any }))}
              >
                <option value="BACONA">Bacona</option>
                <option value="SALTA">Salta</option>
                <option value="EN_TRANSITO">En tránsito</option>
              </select>
            </label>
          </div>

          <label className="mt-3 block text-xs text-neutral-700">
            Notas (opcional)
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Ej: se quemó, vencido, cayó al piso..."
            />
          </label>

          <div className="mt-4">
            <div className="text-xs font-medium text-neutral-700">Ítems</div>
            <div className="mt-2 space-y-2">
              {form.lines.map((l, idx) => {
                const item = items.find((i) => i.id === l.inventoryItemId);
                const equiv = baseEquivalent(l, items);
                const unitOpts = item ? getUnitOptions(item) : [];
                return (
                  <div key={idx} className="space-y-1">
                    <div className="grid gap-2 sm:grid-cols-[1fr_90px_100px_36px]">
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={l.inventoryItemId}
                        onChange={(e) => onItemChange(idx, e.target.value)}
                      >
                        <option value="">— Ítem —</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>{it.name} ({it.displayUnit})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={l.qty}
                        min={0}
                        step="0.001"
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      />
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={unitSelectValue(l)}
                        onChange={(e) => onUnitChange(idx, e.target.value)}
                        disabled={!l.inventoryItemId}
                      >
                        {unitOpts.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border text-sm hover:bg-neutral-50"
                        onClick={() => setForm((p) => ({ ...p, lines: p.lines.filter((_, i) => i !== idx) }))}
                        disabled={form.lines.length <= 1}
                        title="Quitar línea"
                      >
                        ×
                      </button>
                    </div>
                    {equiv ? <div className="pl-1 text-xs text-neutral-500">{equiv}</div> : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => {
                  const first = items[0];
                  const { unit, uomId } = first ? defaultLineUnit(first) : { unit: "UN", uomId: "" };
                  setForm((p) => ({ ...p, lines: [...p.lines, { inventoryItemId: first?.id ?? "", qty: "1", unit, uomId }] }));
                }}
              >
                + Agregar ítem
              </button>
              <button
                type="button"
                className={canSubmit ? "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white" : "rounded-md bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500"}
                disabled={!canSubmit}
                onClick={async () => {
                  try {
                    setError(null);
                    await apiJson("/api/mermas/loss-events", {
                      method: "POST",
                      body: JSON.stringify({
                        reasonType: form.reasonType,
                        locationCode: form.locationCode,
                        notes: form.notes || null,
                        lines: form.lines.map((x) => ({
                          inventoryItemId: x.inventoryItemId,
                          qty: Number(x.qty),
                          unit: x.uomId ? null : x.unit,
                          uomId: x.uomId || null,
                        })),
                      }),
                    });
                    const first = items[0];
                    const { unit, uomId } = first ? defaultLineUnit(first) : { unit: "UN", uomId: "" };
                    setForm((p) => ({ ...p, notes: "", lines: [{ inventoryItemId: first?.id ?? "", qty: "1", unit, uomId }] }));
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                Registrar merma
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Historial</div>
          <div className="mt-2 max-h-[520px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {lossEvents.map((le) => (
                  <tr key={le.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(le.occurredAt).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{le.reasonType}</div>
                      <div className="text-xs text-neutral-500">{le.location.label}</div>
                      {le.notes ? <div className="mt-1 text-xs text-neutral-600">{le.notes}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        {le.lines.map((l) => (
                          <div key={l.id} className="text-xs text-neutral-700">
                            <b>OUT</b> {lineDisplayQty(l)} · {l.inventoryItem.name}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!lossEvents.length ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-neutral-600" colSpan={3}>Sin mermas todavía.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
