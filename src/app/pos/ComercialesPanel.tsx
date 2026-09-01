"use client";

import { useCallback, useEffect, useState } from "react";

type LineProduct = { id: string; productId: string; qtyPerUnit: string; product: { id: string; name: string } };
type UpcomingLine = {
  id: string;
  status: "PENDIENTE" | "ENTREGADA" | "CANCELADA";
  deliveryDate: string;
  clienteLabel: string;
  tipoVianda: string;
  cant: number;
  horarioRetiro: string;
  unitPriceCents: number;
  formaDePagoPlanificada: string | null;
  viandasCobradasPlanned: number;
  detalleComanda: string | null;
  products: LineProduct[];
  comercialSale: { cuentaCorrienteAccount: { id: string; customer: { displayName: string } } | null };
};

type Product = { id: string; name: string; categoryName: string };

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

function formatArs(cents: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(cents / 100);
}

export function ComercialesPanel() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<UpcomingLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsModalLineId, setProductsModalLineId] = useState<string | null>(null);
  const [deliverLineId, setDeliverLineId] = useState<string | null>(null);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ lines: UpcomingLine[] }>("/api/ventas-comerciales/lines/upcoming");
      setLines(data.lines);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    apiGet<{ products: Product[] }>("/api/ventas-comerciales/products")
      .then((d) => setProducts(d.products))
      .catch(() => {});
  }, [refresh]);

  async function handleRemoveProduct(line: UpcomingLine, productLineId: string) {
    setError(null);
    setRemovingProductId(productLineId);
    try {
      const remaining = line.products
        .filter((p) => p.id !== productLineId)
        .map((p) => ({ productId: p.productId, qtyPerUnit: Number(p.qtyPerUnit) }));
      await apiJson(`/api/ventas-comerciales/lines/${line.id}/products`, {
        method: "POST",
        body: JSON.stringify({ products: remaining }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al quitar el producto.");
    } finally {
      setRemovingProductId(null);
    }
  }

  if (lines.length === 0) return null;

  const productsModalLine = lines.find((l) => l.id === productsModalLineId) ?? null;
  const deliverLine = lines.find((l) => l.id === deliverLineId) ?? null;

  return (
    <div className="rounded-lg border bg-violet-50 p-2">
      <button
        type="button"
        className="w-full text-left text-xs font-semibold text-violet-800"
        onClick={() => setOpen((o) => !o)}
      >
        {lines.length} venta{lines.length !== 1 ? "s" : ""} comercial{lines.length !== 1 ? "es" : ""} próxima
        {lines.length !== 1 ? "s" : ""} {open ? "▲" : "▼"}
      </button>

      {error && (
        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}

      {open && (
        <div className="mt-2 max-h-96 overflow-y-auto rounded-md border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Día</th>
                <th className="px-2 py-1.5 text-left">Cliente</th>
                <th className="px-2 py-1.5 text-left">Vianda</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-left">Horario</th>
                <th className="px-2 py-1.5 text-right">Precio</th>
                <th className="px-2 py-1.5 text-left">Forma de pago</th>
                <th className="px-2 py-1.5 text-right">Cobradas</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const delivered = l.status === "ENTREGADA";
                return (
                  <tr key={l.id} className={`border-t align-top ${delivered ? "opacity-50" : ""}`}>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {new Date(l.deliveryDate).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                    </td>
                    <td className="px-2 py-1.5">{l.clienteLabel}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{l.tipoVianda}</div>
                      {l.products.length === 0 ? (
                        <div className="mt-0.5 text-[11px] text-amber-600">Sin productos cargados</div>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.products.map((p) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-700"
                            >
                              {p.product.name} x{p.qtyPerUnit}
                              {!delivered && (
                                <button
                                  type="button"
                                  disabled={removingProductId === p.id}
                                  onClick={() => handleRemoveProduct(l, p.id)}
                                  className="ml-0.5 text-neutral-400 hover:text-red-600 disabled:opacity-40"
                                  title="Quitar producto"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">{l.cant}</td>
                    <td className="px-2 py-1.5">{l.horarioRetiro}</td>
                    <td className="px-2 py-1.5 text-right">{formatArs(l.unitPriceCents)}</td>
                    <td className="px-2 py-1.5">{l.formaDePagoPlanificada || "—"}</td>
                    <td className="px-2 py-1.5 text-right">{l.viandasCobradasPlanned}</td>
                    <td className="px-2 py-1.5 text-right">{formatArs(l.unitPriceCents * l.viandasCobradasPlanned)}</td>
                    <td className="px-2 py-1.5">
                      {delivered ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          Entregada
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="rounded border px-1.5 py-0.5 hover:bg-neutral-50"
                            onClick={() => setProductsModalLineId(l.id)}
                          >
                            {l.products.length > 0 ? "Editar productos" : "+ Agregar productos"}
                          </button>
                          <button
                            type="button"
                            className="rounded bg-neutral-900 px-1.5 py-0.5 text-white hover:bg-neutral-800"
                            onClick={() => setDeliverLineId(l.id)}
                          >
                            Entregar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {productsModalLine && (
        <ProductsModal
          line={productsModalLine}
          products={products}
          onClose={() => setProductsModalLineId(null)}
          onSaved={refresh}
        />
      )}

      {deliverLine && (
        <DeliverModal line={deliverLine} onClose={() => setDeliverLineId(null)} onDelivered={refresh} />
      )}
    </div>
  );
}

function ProductsModal({
  line,
  products,
  onClose,
  onSaved,
}: {
  line: UpcomingLine;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<{ productId: string; qtyPerUnit: string }[]>(
    line.products.length > 0
      ? line.products.map((p) => ({ productId: p.productId, qtyPerUnit: p.qtyPerUnit }))
      : [{ productId: "", qtyPerUnit: "1" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<{ productId: string; qtyPerUnit: string }>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError(null);
    const parsed = rows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId, qtyPerUnit: Number(r.qtyPerUnit) }));
    if (parsed.some((r) => !Number.isFinite(r.qtyPerUnit) || r.qtyPerUnit <= 0)) {
      setError("Cantidad inválida en alguna fila.");
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/ventas-comerciales/lines/${line.id}/products`, {
        method: "POST",
        body: JSON.stringify({ products: parsed }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-1 text-sm font-semibold">
          Productos para &quot;{line.tipoVianda}&quot; — {line.clienteLabel}
        </div>
        <div className="mb-3 text-xs text-neutral-500">
          Por cada vianda, ¿qué productos del catálogo entran y en qué cantidad?
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_28px] gap-2">
              <select
                className="rounded border px-2 py-1.5 text-sm"
                value={r.productId}
                onChange={(ev) => updateRow(i, { productId: ev.target.value })}
              >
                <option value="">— Producto —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.categoryName})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.001}
                step="1"
                className="rounded border px-2 py-1.5 text-sm"
                value={r.qtyPerUnit}
                onChange={(ev) => updateRow(i, { qtyPerUnit: ev.target.value })}
              />
              <button
                type="button"
                className="rounded border text-xs hover:bg-neutral-50"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 rounded border px-2 py-1 text-xs hover:bg-neutral-50"
          onClick={() => setRows((prev) => [...prev, { productId: "", qtyPerUnit: "1" }])}
        >
          + Agregar producto
        </button>

        {error && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            onClick={handleSave}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "QR", label: "QR" },
  { value: "CHEQUE", label: "Cheque" },
];

function DeliverModal({
  line,
  onClose,
  onDelivered,
}: {
  line: UpcomingLine;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const [actualQty, setActualQty] = useState(String(line.cant));
  const [actualCobradas, setActualCobradas] = useState(String(line.viandasCobradasPlanned));
  const hasAccount = !!line.comercialSale.cuentaCorrienteAccount;
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cobradasNum = parseInt(actualCobradas, 10) || 0;
  const totalCents = line.unitPriceCents * cobradasNum;
  const missingProducts = line.products.length === 0;

  async function handleSubmit() {
    setError(null);
    if (!paymentMethod) {
      setError("Elegí un medio de pago.");
      return;
    }
    const qty = parseInt(actualQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Cantidad entregada inválida.");
      return;
    }
    if (totalCents <= 0) {
      setError("El total a cobrar debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/ventas-comerciales/lines/${line.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({ actualQty: qty, actualCobradas: cobradasNum, paymentMethod }),
      });
      onDelivered();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cobrar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-1 text-sm font-semibold">Entregar y cobrar</div>
        <div className="mb-3 text-xs text-neutral-500">
          {line.clienteLabel} — {line.tipoVianda}
        </div>

        {missingProducts && (
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            No se cargaron los productos de esta vianda. Se puede entregar igual, pero no va a descontar stock.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-neutral-700">
            Cantidad entregada
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={actualQty}
              onChange={(ev) => setActualQty(ev.target.value)}
            />
          </label>
          <label className="text-xs text-neutral-700">
            Viandas cobradas
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={actualCobradas}
              onChange={(ev) => setActualCobradas(ev.target.value)}
            />
          </label>
        </div>

        <label className="mt-3 block text-xs text-neutral-700">
          Medio de pago
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={paymentMethod}
            onChange={(ev) => setPaymentMethod(ev.target.value)}
          >
            <option value="">— Elegir —</option>
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {hasAccount && (
              <option value="CUENTA_CORRIENTE">
                Cuenta corriente ({line.comercialSale.cuentaCorrienteAccount!.customer.displayName})
              </option>
            )}
          </select>
        </label>

        <div className="mt-3 rounded bg-neutral-50 px-3 py-2 text-sm font-semibold">
          Total a cobrar: {formatArs(totalCents)}
        </div>

        {error && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            onClick={handleSubmit}
          >
            {saving ? "Cobrando..." : "Confirmar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}
