"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatArsFromCents } from "@/lib/money";

type Uom = { id: string; label: string; unit: string; multiplierToBase: string; isDefaultForEntry: boolean };
type InventoryItem = { id: string; name: string; unit: string; displayUnit: string; dimension: string; uoms: Uom[] };
type SupplierPaymentInfo = {
  method: "EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO";
  installments: number | null;
  cashBox: { name: string } | null;
  creditCard: { name: string } | null;
};
type Purchase = {
  id: string;
  type: "APROVISIONAMIENTO" | "IN_SITU";
  status: string;
  purchasedAt: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceTotalCents: number | null;
  location: { code: string; label: string };
  lines: Array<{
    id: string;
    qty: string;
    entryQty: string | null;
    entryUnit: string | null;
    unitCostCents: number | null;
    inventoryItem: InventoryItem;
  }>;
  payable: {
    totalAmountCents: number;
    paidAmountCents: number;
    status: "PENDING" | "PARTIAL" | "PAID";
    payments: SupplierPaymentInfo[];
  } | null;
};
type Supplier = { id: string; name: string };
type CashBox = { id: string; name: string; kind: "EFECTIVO" | "CUENTA_BANCARIA" };
type CreditCard = { id: string; name: string };

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

function ars(v: string): number {
  return Math.round(Number(v || "0") * 100);
}

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO_CAJA: "Efectivo de caja",
  TRANSFERENCIA: "Transferencia",
  TARJETA_CREDITO: "Tarjeta de crédito",
};

function paymentStatusLabel(p: Purchase): string {
  if (!p.payable) return "—";
  const remaining = p.payable.totalAmountCents - p.payable.paidAmountCents;
  if (p.payable.status !== "PAID") {
    const prefix = p.payable.status === "PARTIAL" ? "Parcial, resta" : "Pendiente";
    return `${prefix} ${formatArsFromCents(remaining)}`;
  }
  const lastPayment = p.payable.payments[p.payable.payments.length - 1];
  if (!lastPayment) return "Pagado";
  const methodLabel = METHOD_LABEL[lastPayment.method] ?? lastPayment.method;
  const source = lastPayment.cashBox?.name ?? lastPayment.creditCard?.name;
  const cuotas = lastPayment.method === "TARJETA_CREDITO" && lastPayment.installments && lastPayment.installments > 1
    ? ` (${lastPayment.installments} cuotas)`
    : "";
  return `Pagado — ${methodLabel}${source ? ` ${source}` : ""}${cuotas}`;
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);

  const [form, setForm] = useState<{
    type: "APROVISIONAMIENTO" | "IN_SITU";
    locationCode: "BACONA" | "SALTA" | "EN_TRANSITO";
    supplierId: string;
    invoiceNumber: string;
    invoiceTotalArs: string;
    notes: string;
    purchasedAt: string;
    paymentMode: "PENDING" | "PAID_NOW";
    paymentMethod: "EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO";
    cashBoxId: string;
    creditCardId: string;
    installments: string;
    affectsStock: boolean;
    lines: FormLine[];
  }>({
    type: "IN_SITU",
    locationCode: "BACONA",
    supplierId: "",
    invoiceNumber: "",
    invoiceTotalArs: "",
    notes: "",
    purchasedAt: new Date().toISOString().slice(0, 10),
    paymentMode: "PENDING",
    paymentMethod: "EFECTIVO_CAJA",
    cashBoxId: "",
    creditCardId: "",
    installments: "1",
    affectsStock: false,
    lines: [{ inventoryItemId: "", qty: "1", unit: "UN", uomId: "", unitCostCents: "" }],
  });

  async function refresh() {
    const [it, pu, sup, cb, cc] = await Promise.all([
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
      apiGet<{ purchases: Purchase[] }>("/api/compras/purchases"),
      apiGet<{ items: Supplier[] }>("/api/proveedores"),
      apiGet<{ items: CashBox[] }>("/api/egresos/cuentas?kind=EFECTIVO").catch(() => ({ items: [] })),
      apiGet<{ items: CreditCard[] }>("/api/egresos/tarjetas").catch(() => ({ items: [] })),
    ]);
    setItems(it.items);
    setPurchases(pu.purchases);
    setSuppliers(sup.items);
    const [cbBanco] = await Promise.all([
      apiGet<{ items: CashBox[] }>("/api/egresos/cuentas?kind=CUENTA_BANCARIA").catch(() => ({ items: [] })),
    ]);
    setCashBoxes([...cb.items, ...cbBanco.items]);
    setCreditCards(cc.items);
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
    if (!form.supplierId) return false;
    if (!form.invoiceTotalArs || ars(form.invoiceTotalArs) <= 0) return false;
    if (form.affectsStock) {
      if (!form.lines.length) return false;
      return form.lines.every((l) => l.inventoryItemId && Number(l.qty) > 0);
    }
    return true;
  }, [form.supplierId, form.invoiceTotalArs, form.affectsStock, form.lines]);

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
          <div className="text-sm text-neutral-600">Factura y estado de pago por proveedor. El impacto en stock es opcional.</div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Ir a stock</Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[520px_1fr]">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Nueva compra (posteada)</div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">
              Proveedor
              <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={form.supplierId}
                onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))}>
                <option value="">— Elegir proveedor —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-700">
              N° factura (opcional)
              <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={form.invoiceNumber}
                onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
            </label>
            <label className="text-xs text-neutral-700">
              Fecha de compra
              <input type="date" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={form.purchasedAt}
                onChange={(e) => setForm((p) => ({ ...p, purchasedAt: e.target.value }))} />
            </label>
          </div>

          <label className="mt-3 block text-xs text-neutral-700">
            Notas (opcional)
            <textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm" rows={2}
              value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>

          <div className="mt-3 rounded-md border bg-neutral-50 p-3">
            <div className="text-xs font-medium text-neutral-700">¿Cómo se paga?</div>
            <div className="mt-2 flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={form.paymentMode === "PENDING"} onChange={() => setForm((p) => ({ ...p, paymentMode: "PENDING" }))} />
                Queda pendiente
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={form.paymentMode === "PAID_NOW"} onChange={() => setForm((p) => ({ ...p, paymentMode: "PAID_NOW" }))} />
                Contado ahora
              </label>
            </div>

            <label className="mt-2 block text-xs text-neutral-700">
              Monto total de la factura ($)
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.invoiceTotalArs}
                onChange={(e) => setForm((p) => ({ ...p, invoiceTotalArs: e.target.value }))}
              />
            </label>

            {form.paymentMode === "PAID_NOW" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <select className="rounded-md border px-2 py-2 text-sm" value={form.paymentMethod}
                  onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as typeof p.paymentMethod, cashBoxId: "", creditCardId: "" }))}>
                  <option value="EFECTIVO_CAJA">Efectivo de caja</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA_CREDITO">Tarjeta de crédito</option>
                </select>
                {form.paymentMethod !== "TARJETA_CREDITO" ? (
                  <select className="rounded-md border px-2 py-2 text-sm" value={form.cashBoxId}
                    onChange={(e) => setForm((p) => ({ ...p, cashBoxId: e.target.value }))}>
                    <option value="">Elegir caja/cuenta...</option>
                    {cashBoxes
                      .filter((b) => (form.paymentMethod === "EFECTIVO_CAJA" ? b.kind === "EFECTIVO" : b.kind === "CUENTA_BANCARIA"))
                      .map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                  </select>
                ) : (
                  <>
                    <select className="rounded-md border px-2 py-2 text-sm" value={form.creditCardId}
                      onChange={(e) => setForm((p) => ({ ...p, creditCardId: e.target.value }))}>
                      <option value="">Elegir tarjeta...</option>
                      {creditCards.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input type="number" min={1} max={24} className="rounded-md border px-2 py-2 text-sm" placeholder="Cuotas"
                      value={form.installments} onChange={(e) => setForm((p) => ({ ...p, installments: e.target.value }))} />
                  </>
                )}
              </div>
            )}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-neutral-700">
            <input type="checkbox" checked={form.affectsStock} onChange={(e) => setForm((p) => ({ ...p, affectsStock: e.target.checked }))} />
            Esta compra también actualiza stock
          </label>

          {form.affectsStock && (
            <div className="mt-3">
              <div className="rounded-md border bg-neutral-50 p-3 text-xs text-neutral-700">
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

              <div className="mt-3">
                <div className="text-xs font-medium text-neutral-700">Líneas</div>
                <div className="mt-2 space-y-2">
                  {form.lines.map((l, idx) => {
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
                            placeholder="Costo ($, referencial)"
                            value={l.unitCostCents}
                            min={0}
                            step="0.01"
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

                <button
                  type="button"
                  className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
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
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={canSubmit ? "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white" : "rounded-md bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500"}
              disabled={!canSubmit}
              onClick={async () => {
                try {
                  setError(null);
                  if (!form.supplierId) throw new Error("Elegí un proveedor.");
                  const invoiceTotalCents = ars(form.invoiceTotalArs);
                  if (!invoiceTotalCents) throw new Error("Ingresá el monto total de la factura.");
                  const selectedSupplier = suppliers.find((s) => s.id === form.supplierId);
                  const payment =
                    form.paymentMode === "PENDING"
                      ? { mode: "PENDING" as const }
                      : {
                          mode: "PAID_NOW" as const,
                          method: form.paymentMethod,
                          cashBoxId: form.paymentMethod !== "TARJETA_CREDITO" ? form.cashBoxId || null : null,
                          creditCardId: form.paymentMethod === "TARJETA_CREDITO" ? form.creditCardId || null : null,
                          installments: form.paymentMethod === "TARJETA_CREDITO" ? Number(form.installments) || 1 : undefined,
                        };
                  await apiJson("/api/compras/purchases", {
                    method: "POST",
                    body: JSON.stringify({
                      type: form.type,
                      locationCode: form.locationCode,
                      supplierId: form.supplierId,
                      supplierName: selectedSupplier?.name ?? null,
                      invoiceNumber: form.invoiceNumber || null,
                      invoiceTotalCents,
                      notes: form.notes || null,
                      purchasedAt: new Date(form.purchasedAt + "T12:00:00.000Z").toISOString(),
                      payment,
                      lines: form.affectsStock
                        ? form.lines.map((x) => ({
                            inventoryItemId: x.inventoryItemId,
                            qty: Number(x.qty),
                            unit: x.uomId ? null : x.unit,
                            uomId: x.uomId || null,
                            unitCostCents: x.unitCostCents ? ars(x.unitCostCents) : null,
                          }))
                        : [],
                    }),
                  });
                  const first = items[0];
                  const { unit, uomId } = first ? defaultLineUnit(first) : { unit: "UN", uomId: "" };
                  setForm((p) => ({
                    ...p,
                    supplierId: "",
                    invoiceNumber: "",
                    invoiceTotalArs: "",
                    notes: "",
                    purchasedAt: new Date().toISOString().slice(0, 10),
                    paymentMode: "PENDING",
                    cashBoxId: "",
                    creditCardId: "",
                    installments: "1",
                    affectsStock: false,
                    lines: [{ inventoryItemId: first?.id ?? "", qty: "1", unit, uomId, unitCostCents: "" }],
                  }));
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

        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Historial</div>
          <div className="mt-2 max-h-[520px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Proveedor / Factura</th>
                  <th className="px-3 py-2 text-left">Estado de pago</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(p.purchasedAt).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.supplierName ?? "—"}</div>
                      <div className="text-xs text-neutral-500">{p.invoiceNumber ?? "—"}</div>
                      {p.lines.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {p.lines.map((l) => (
                            <div key={l.id} className="text-xs text-neutral-500">
                              {lineDisplayQty(l)} · {l.inventoryItem.name} ({p.location.label})
                            </div>
                          ))}
                        </div>
                      )}
                      {p.type === "APROVISIONAMIENTO" && p.lines.length > 0 && p.location.code !== "BACONA" ? (
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
                    <td className="px-3 py-2">
                      {p.invoiceTotalCents ? (
                        <div className="font-medium">{formatArsFromCents(p.invoiceTotalCents)}</div>
                      ) : null}
                      <div className="text-xs text-neutral-600">{paymentStatusLabel(p)}</div>
                    </td>
                  </tr>
                ))}
                {!purchases.length ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-neutral-600" colSpan={3}>Sin compras todavía.</td>
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
