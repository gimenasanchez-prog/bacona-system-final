"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Uom = { id: string; label: string; unit: string; multiplierToBase: string; isDefaultForEntry: boolean };
type InventoryItem = { id: string; name: string; unit: string; displayUnit: string; dimension: string; uoms: Uom[] };
type Batch = {
  id: string;
  status: string;
  occurredAt: string;
  deviationFlag: boolean;
  deviationReason: string | null;
  location: { code: string; label: string };
  lines: Array<{
    id: string;
    direction: "IN" | "OUT";
    qty: string;
    entryQty: string | null;
    entryUnit: string | null;
    inventoryItem: InventoryItem;
  }>;
};

type FormLine = {
  inventoryItemId: string;
  direction: "IN" | "OUT";
  qty: string;
  unit: string;
  uomId: string;
};

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
  const base = qty * m;
  return `≈ ${base.toFixed(3).replace(/\.?0+$/, "")} ${item.unit}`;
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

export default function ProduccionPage() {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [form, setForm] = useState<{
    locationCode: "BACONA" | "SALTA" | "EN_TRANSITO";
    deviationFlag: boolean;
    deviationReason: string;
    lines: FormLine[];
  }>({
    locationCode: "BACONA",
    deviationFlag: false,
    deviationReason: "",
    lines: [{ inventoryItemId: "", direction: "OUT", qty: "1", unit: "UN", uomId: "" }],
  });

  async function refresh() {
    const [it, ba] = await Promise.all([
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
      apiGet<{ batches: Batch[] }>("/api/produccion/batches"),
    ]);
    setItems(it.items);
    setBatches(ba.batches);
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
          <div className="text-lg font-semibold">Producción</div>
          <div className="text-sm text-neutral-600">Carga rápida para cocina (impacta stock al confirmar).</div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Ir a stock</Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[520px_1fr]">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Nueva producción (confirmada)</div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
            <label className="text-xs text-neutral-700">
              ¿Desvío de receta?
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.deviationFlag ? "SI" : "NO"}
                onChange={(e) => setForm((p) => ({ ...p, deviationFlag: e.target.value === "SI" }))}
              >
                <option value="NO">No</option>
                <option value="SI">Sí</option>
              </select>
            </label>
          </div>

          {form.deviationFlag ? (
            <label className="mt-3 block text-xs text-neutral-700">
              Motivo del desvío (recomendado)
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.deviationReason}
                onChange={(e) => setForm((p) => ({ ...p, deviationReason: e.target.value }))}
                placeholder="Ej: faltó jamón, cambié por..."
              />
            </label>
          ) : null}

          <div className="mt-4">
            <div className="text-xs font-medium text-neutral-700">Líneas (OUT = insumos usados, IN = producido)</div>
            <div className="mt-2 space-y-2">
              {form.lines.map((l, idx) => {
                const item = items.find((i) => i.id === l.inventoryItemId);
                const equiv = baseEquivalent(l, items);
                const unitOpts = item ? getUnitOptions(item) : [];
                return (
                  <div key={idx} className="space-y-1">
                    <div className="grid gap-2 sm:grid-cols-[90px_1fr_90px_100px_36px]">
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={l.direction}
                        onChange={(e) => updateLine(idx, { direction: e.target.value as "IN" | "OUT" })}
                      >
                        <option value="OUT">OUT</option>
                        <option value="IN">IN</option>
                      </select>
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
                  setForm((p) => ({
                    ...p,
                    lines: [...p.lines, { inventoryItemId: first?.id ?? "", direction: "OUT", qty: "1", unit, uomId }],
                  }));
                }}
              >
                + Agregar línea
              </button>
              <button
                type="button"
                className={canSubmit ? "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white" : "rounded-md bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500"}
                disabled={!canSubmit}
                onClick={async () => {
                  try {
                    setError(null);
                    await apiJson("/api/produccion/batches", {
                      method: "POST",
                      body: JSON.stringify({
                        locationCode: form.locationCode,
                        deviationFlag: form.deviationFlag,
                        deviationReason: form.deviationFlag ? (form.deviationReason || null) : null,
                        lines: form.lines.map((x) => ({
                          inventoryItemId: x.inventoryItemId,
                          direction: x.direction,
                          qty: Number(x.qty),
                          unit: x.uomId ? null : x.unit,
                          uomId: x.uomId || null,
                        })),
                      }),
                    });
                    const first = items[0];
                    const { unit, uomId } = first ? defaultLineUnit(first) : { unit: "UN", uomId: "" };
                    setForm((p) => ({ ...p, deviationFlag: false, deviationReason: "", lines: [{ inventoryItemId: first?.id ?? "", direction: "OUT", qty: "1", unit, uomId }] }));
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                Confirmar producción
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
                  <th className="px-3 py-2 text-left">Ubicación</th>
                  <th className="px-3 py-2 text-left">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(b.occurredAt).toLocaleString("es-AR")}
                      {b.deviationFlag ? (
                        <div className="mt-1 text-xs text-amber-700">Desvío: {b.deviationReason ?? "—"}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{b.location.label}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        {b.lines.map((l) => (
                          <div key={l.id} className="text-xs text-neutral-700">
                            <b className={l.direction === "IN" ? "text-emerald-700" : "text-red-700"}>{l.direction}</b>{" "}
                            {lineDisplayQty(l)} · {l.inventoryItem.name}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!batches.length ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-neutral-600" colSpan={3}>Sin producciones todavía.</td>
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
