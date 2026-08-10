"use client";

import { useEffect, useState } from "react";

import { formatArsFromCents } from "@/lib/money";

type SaleStatus = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";
type PaymentMethod =
  | "EFECTIVO"
  | "CREDITO"
  | "DEBITO"
  | "TRANSFERENCIA"
  | "QR"
  | "CUENTA_CORRIENTE"
  | "CUENTAS_INTERNAS";

type SessionSale = {
  id: string;
  status: SaleStatus;
  totalCents: number;
  createdAt: string;
  cancellationReason: string | null;
  customerNameFreeText: string | null;
  customer: { displayName: string } | null;
  cuentaCorrienteAccount: { customer: { displayName: string } } | null;
  table: { label: string } | null;
  items: Array<{ qty: number; product: { name: string } }>;
  payments: Array<{
    method: PaymentMethod;
    amountCents: number;
    cuentaCorrienteAccount?: { customer: { displayName: string } } | null;
    employee?: { displayName: string } | null;
  }>;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error ?? res.statusText;
    throw new Error(msg);
  }
  return json as T;
}

const METHOD_NAMES: Record<string, string> = {
  EFECTIVO: "Efectivo",
  CREDITO: "Crédito",
  DEBITO: "Débito",
  TRANSFERENCIA: "Transf.",
  QR: "QR",
  CUENTA_CORRIENTE: "CC",
  CUENTAS_INTERNAS: "Interno",
};

export function SessionSalesCard() {
  const [sales, setSales] = useState<SessionSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidTarget, setVoidTarget] = useState<SessionSale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  async function loadSales() {
    setLoading(true);
    try {
      const data = await apiJson<{ sales: SessionSale[] }>("/api/pos/sales/session-sales", { method: "GET" });
      setSales(data.sales);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Ventas del turno{!loading ? ` (${sales.length})` : ""}
        </summary>

        <div className="mt-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-neutral-500">Cargando...</div>
          ) : sales.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">No hay ventas finalizadas en este turno.</div>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto">
              {sales.map((s) => {
                const isCancelled = s.status === "CANCELLED";
                const customerLabel =
                  s.cuentaCorrienteAccount?.customer.displayName ??
                  s.customer?.displayName ??
                  s.customerNameFreeText ??
                  "Mostrador";
                const itemsLabel = s.items.map((it) => `${it.qty}× ${it.product.name}`).join(", ");
                const payLabel = s.payments
                  .map((p) => {
                    const name = METHOD_NAMES[p.method] ?? p.method;
                    const who = p.cuentaCorrienteAccount?.customer.displayName ?? p.employee?.displayName ?? null;
                    return who ? `${name} (${who})` : name;
                  })
                  .join(" + ");

                return (
                  <div key={s.id} className={cn("rounded-lg border p-3", isCancelled ? "opacity-50" : "")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{customerLabel}</span>
                          <span className="text-xs text-neutral-500">
                            {new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isCancelled ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 line-through">
                              Anulada
                            </span>
                          ) : s.status === "DRAFT" ? (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                              Sin confirmar
                            </span>
                          ) : s.status === "CONFIRMED" ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                              Confirmada
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Pagada</span>
                          )}
                          {s.table ? <span className="text-xs text-neutral-500">{s.table.label}</span> : null}
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-600">{itemsLabel}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{payLabel}</div>
                        {isCancelled && s.cancellationReason ? (
                          <div className="mt-1 text-xs text-red-600">Motivo: {s.cancellationReason}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-sm font-semibold">{formatArsFromCents(s.totalCents)}</span>
                        {!isCancelled ? (
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setVoidTarget(s);
                              setVoidReason("");
                              setVoidError(null);
                            }}
                          >
                            Anular
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>

      {voidTarget ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="text-base font-semibold">Anular venta</div>
            <div className="mt-1 text-sm text-neutral-600">
              {voidTarget.cuentaCorrienteAccount?.customer.displayName ??
                voidTarget.customer?.displayName ??
                voidTarget.customerNameFreeText ??
                "Mostrador"}{" "}
              · {formatArsFromCents(voidTarget.totalCents)}
            </div>

            <div className="mt-3 max-h-24 overflow-y-auto rounded-md border bg-neutral-50 p-2 text-xs text-neutral-700">
              {voidTarget.items.map((it, i) => (
                <div key={i}>
                  {it.qty}× {it.product.name}
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-medium">Motivo (obligatorio)</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              >
                <option value="">— Seleccioná un motivo —</option>
                <option value="Error en método de pago">Error en método de pago</option>
                <option value="Cuenta corriente incorrecta">Cuenta corriente incorrecta</option>
                <option value="Productos o cantidades incorrectas">Productos o cantidades incorrectas</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {voidError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {voidError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                disabled={voidLoading}
                onClick={() => { setVoidTarget(null); setVoidError(null); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-500"
                disabled={!voidReason || voidLoading}
                onClick={async () => {
                  if (!voidTarget || !voidReason) return;
                  setVoidLoading(true);
                  setVoidError(null);
                  try {
                    await apiJson(`/api/pos/sales/${voidTarget.id}/cancel`, {
                      method: "POST",
                      body: JSON.stringify({ reason: voidReason }),
                    });
                    setVoidTarget(null);
                    setVoidReason("");
                    await loadSales();
                  } catch (e) {
                    setVoidError(e instanceof Error ? e.message : "Error al anular la venta");
                  } finally {
                    setVoidLoading(false);
                  }
                }}
              >
                {voidLoading ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
