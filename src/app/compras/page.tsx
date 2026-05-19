"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Uom = { id: string; label: string; unit: string; multiplierToBase: string; isDefaultForEntry: boolean };
type InventoryItem = { id: string; name: string; unit: string; displayUnit: string; dimension: string; uoms: Uom[] };
type Purchase = {
  id: string;
  type: "APROVISIONAMIENTO" | "IN_SITU";
  status: string;
  purchasedAt: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  location: { code: string; label: string };
  lines: Array<{
    id: string;
    qty: string;
    entryQty: string | null;
    entryUnit: string | null;
    unitCostCents: number | null;
    inventoryItem: InventoryItem;
  }>;
};

type FormLine = {
  inventoryItemId: string;
  qty: string;
  unit: string;       // entry unit (standard or uom.unit)
  uomId: string;      // "" if not using a UOM presentation
  unitCostCents: string;
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

function toBase(qty: number, entryUnit: string, baseUnit: string): number {
  const m = (METRIC_BASE[entryUnit] ?? 1) / (METRIC_BASE[baseUnit] ?? 1);
  return qty * m;
}

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
  const base = toBase(qty, line.unit, item.unit);
  return `≈ ${base.toFixed(3).replace(/\.?0+$/, "")} ${item.unit}`;
}

function defaultLineUnit(item: InventoryItem): { unit: string; uomId: string } {
  const defaultUom = item.uoms.find((u) => u.isDefaultForEntry);
  if (defaultUom) return { unit: defaultUom.unit, uomId: defaultUom.id };
  return { unit: item.displayUnit ?? item.unit, uomId: "" };
}

export default function ComprasPage() {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [form, setForm] = useState<{
    type: "APROVISIONAMIENTO" | "IN_SITU";
    locationCode: "BACONA" | "SALTA" | "EN_TRANSITO";
    supplierName: string;
    invoiceNumber: string;
    notes: string;
    lines: FormLine[];
  }>({
    type: "IN_SITU",
    locationCode: "BACONA",
    supplierName: "",
    invoiceNumber: "",
    notes: "",
    lines: [{ inventoryItemId: "", qty: "1", unit: "UN", uomId: "", unitCostCents: "" }],
  });

  async function refresh() {
    const [it, pu] = await Promise.all([
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
      apiGet<{ purchases: Purchase[] }>("/api/compras/purchases"),
    ]);
    setItems(it.items);
    setPurchases(pu.purchases);
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

  const canSubmit = useMemo(() => {
    if (!form.lines.length) return false;
    return form.lines.every((l) => l.inventoryItemId && Number(l.qty) > 0);
  }, [form.lines]);

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

  function getUnitOptions(itemId: string): { value: string; label: string; isUom: boolean; uomId?: string }[] {
    const item = items.find((i) => i.id === itemId);
    if (!item) return [];
    const opts: { value: string; label: string; isUom: boolean; uomId?: string }[] = [];
    // Standard units by dimension
    const stdUnits: Record<string, string[]> = { VOLUME: ["ML", "L"], MASS: ["G", "KG"], COUNT: ["UN"] };
    for (const u of stdUnits[item.dimension] ?? ["UN"]) {
      opts.push({ value: `unit:${u}`, label: u, isUom: false });
    }
    // Custom UOM presentations
    for (const uom of item.uoms) {
      opts.push({ value: `uom:${uom.id}`, label: `${uom.label} (${uom.multiplierToBase} ${item.unit})`, isUom: true, uomId: uom.id });
    }
    return opts;
  }

  function onUnitChange(idx: number, value: string) {
    if (value.startsWith("uom:")) {
      const uomId = value.replace("uom:", "");
      const item = items.find((i) => i.id === form.lines[idx]!.inventoryItemId);
      const uom = item?.uoms.find((u) => u.id === uomId);
      updateLine(idx, { uomId, unit: uom?.unit ?? "" });
    } else {
      const unit = value.replace("unit:", "");
      updateLine(idx, { unit, uomId: "" });
    }
  }

  function unitSelectValue(line: FormLine): string {
    return line.uomId ? `uom:${line.uomId}` : `unit:${line.unit}`;
  }

  function lineDisplayQty(l: { qty: string; entryQty: string | null; entryUnit: string | null; inventoryItem: InventoryItem }): string {
    if (l.entryQty && l.entryUnit && l.entryUnit !== l.inventoryItem.unit) {
      return `${l.entryQty} ${l.entryUnit} (${l.qty} ${l.inventoryItem.unit})`;
    }
    return `${l.qty} ${l.inventoryItem.unit}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Compras</div>
          <div className="text-sm text-neutral-600">Aprovisionamiento vs compras in-situ (impactan stock).</div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Ir a stock</Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[520px_1fr]">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Nueva compra (posteada)</div>
          <div className="mt-2 rounded-md border bg-neutral-50 p-3 text-xs text-neutral-700">
            <b>Nota:</b> si registrás <b>APROVISIONAMIENTO</b> en <b>Salta</b> o <b>En tránsito</b>, el stock de
            <b> Bacoña</b> seguirá en 0 hasta el <b>Recibir en Bacoña</b>.
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">
              Tipo
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as "APROVISIONAMIENTO" | "IN_SITU";
                  setForm((p) => ({ ...p, type, locationCode: type === "APROVISIONAMIENTO" ? "SALTA" : "BACONA" }));
                }}
              >
                <option value="IN_SITU">IN_SITU</option>
                <option value="APROVISIONAMIENTO">APROVISIONAMIENTO</option>
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

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">
              Proveedor (opcional)
              <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={form.supplierName}
                onChange={(e) => setForm((p) => ({ ...p, supplierName: e.target.value }))} />
            </label>
            <label className="text-xs text-neutral-700">
              N° factura (opcional)
              <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={form.invoiceNumber}
                onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
            </label>
          </div>

          <label className="mt-3 block text-xs text-neutral-700">
            Notas (opcional)
            <textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm" rows={2}
              value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>

          <div className="mt-4">
            <div className="text-xs font-medium text-neutral-700">Líneas</div>
            <div className="mt-2 space-y-2">
              {form.lines.map((l, idx) => {
                const item = items.find((i) => i.id === l.inventoryItemId);
                const equiv = baseEquivalent(l, items);
                const unitOpts = getUnitOptions(l.inventoryItemId);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_120px_36px]">
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
                      <input
                        type="number"
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Costo (cts)"
                        value={l.unitCostCents}
                        min={0}
                        onChange={(e) => updateLine(idx, { unitCostCents: e.target.value })}
                      />
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
                    {equiv ? (
                      <div className="pl-1 text-xs text-neutral-500">{equiv}</div>
                    ) : null}
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
                    lines: [...p.lines, { inventoryItemId: first?.id ?? "", qty: "1", unit, uomId, unitCostCents: "" }],
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
                    await apiJson("/api/compras/purchases", {
                      method: "POST",
                      body: JSON.stringify({
                        type: form.type,
                        locationCode: form.locationCode,
                        supplierName: form.supplierName || null,
                        invoiceNumber: form.invoiceNumber || null,
                        notes: form.notes || null,
                        lines: form.lines.map((x) => ({
                          inventoryItemId: x.inventoryItemId,
                          qty: Number(x.qty),
                          unit: x.uomId ? null : x.unit,
                          uomId: x.uomId || null,
                          unitCostCents: x.unitCostCents ? Number(x.unitCostCents) : null,
                        })),
                      }),
                    });
                    const first = items[0];
                    const { unit, uomId } = first ? defaultLineUnit(first) : { unit: "UN", uomId: "" };
                    setForm((p) => ({ ...p, supplierName: "", invoiceNumber: "", notes: "", lines: [{ inventoryItemId: first?.id ?? "", qty: "1", unit, uomId, unitCostCents: "" }] }));
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                Postear compra
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
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Ubicación</th>
                  <th className="px-3 py-2 text-left">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(p.purchasedAt).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.type}</div>
                      <div className="text-xs text-neutral-500">{p.invoiceNumber ?? "—"}</div>
                      {p.type === "APROVISIONAMIENTO" && p.location.code !== "BACONA" ? (
                        <button
                          type="button"
                          className="mt-2 rounded-md border bg-white px-2 py-1 text-xs hover:bg-neutral-50"
                          onClick={async () => {
                            try {
                              setError(null);
                              await apiJson(`/api/compras/purchases/${p.id}/receive`, { method: "POST" });
                              await refresh();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Error");
                            }
                          }}
                        >
                          Recibir en Bacoña
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{p.location.label}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        {p.lines.map((l) => (
                          <div key={l.id} className="text-xs text-neutral-700">
                            <b>IN</b> {lineDisplayQty(l)} · {l.inventoryItem.name}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!purchases.length ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-neutral-600" colSpan={4}>Sin compras todavía.</td>
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
