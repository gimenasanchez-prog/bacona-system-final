"use client";

import { useEffect, useState, useCallback } from "react";
import { formatArsFromCents } from "@/lib/money";

type SupplierDebt = {
  supplierId: string;
  supplierName: string;
  active: boolean;
  categoria: string | null;
  debtCents: number;
};
type CashBox = { id: string; name: string; kind: "EFECTIVO" | "CUENTA_BANCARIA" };
type CreditCard = { id: string; name: string };
type Supplier = { id: string; name: string };

type Payable = {
  id: string;
  totalAmountCents: number;
  paidAmountCents: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  sourcePurchase: { id: string; invoiceNumber: string | null; purchasedAt: string } | null;
};

type Payment = {
  id: string;
  payableId: string | null;
  amountCents: number;
  date: string;
  method: "EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO";
  cashBoxId: string | null;
  creditCardId: string | null;
  installments: number | null;
  notes: string | null;
  cashBox: { name: string } | null;
  creditCard: { name: string } | null;
  createdByEmployee: { displayName: string };
};

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO_CAJA: "Efectivo de caja",
  TRANSFERENCIA: "Transferencia",
  TARJETA_CREDITO: "Tarjeta de crédito",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-red-50 text-red-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", PARTIAL: "Parcial", PAID: "Pagado" };

export function ProveedoresClient({ isGerencia }: { isGerencia: boolean }) {
  const [debts, setDebts] = useState<SupplierDebt[]>([]);
  const [allCategorias, setAllCategorias] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [payModalSupplier, setPayModalSupplier] = useState<{ id: string; name: string } | null>(null);
  const [formModalSupplier, setFormModalSupplier] = useState<SupplierDebt | "NEW" | null>(null);

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "CON_DEUDA" | "SIN_DEUDA">("TODOS");
  const [categoria, setCategoria] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const loadDebts = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (estado !== "TODOS") params.set("estado", estado);
    if (categoria) params.set("categoria", categoria);
    if (from) params.set("from", new Date(from + "T00:00:00.000Z").toISOString());
    if (to) params.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    const res = await fetch(`/api/egresos/proveedores?${params.toString()}`);
    const data = await res.json();
    setDebts(data.items ?? []);
  }, [search, estado, categoria, from, to]);

  const loadSuppliers = useCallback(async () => {
    const res = await fetch("/api/proveedores");
    const data = await res.json();
    setSuppliers(data.items ?? []);
  }, []);

  // Categorías disponibles: se cargan una sola vez, sin filtros, para que el
  // desplegable no se vacíe a medida que el usuario filtra.
  useEffect(() => {
    fetch("/api/egresos/proveedores")
      .then((r) => r.json())
      .then((d: { items: SupplierDebt[] }) => {
        const cats = Array.from(new Set((d.items ?? []).map((s) => s.categoria).filter(Boolean))) as string[];
        setAllCategorias(cats.sort());
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDebts(), loadSuppliers()]).finally(() => setLoading(false));
  }, [loadDebts, loadSuppliers]);

  const totalDebtCents = debts.reduce((sum, d) => sum + d.debtCents, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Deuda total (según filtro)</div>
          <div className="mt-1 text-2xl font-bold">{formatArsFromCents(totalDebtCents)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Proveedores listados</div>
          <div className="mt-1 text-2xl font-bold">{debts.length}</div>
        </div>
        {isGerencia && (
          <div className="rounded-lg border bg-white p-4 shadow-sm flex items-center justify-end gap-2">
            <button
              onClick={() => setFormModalSupplier("NEW")}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              + Nuevo proveedor
            </button>
            <button
              onClick={() => setPayModalSupplier({ id: "", name: "" })}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            >
              Registrar pago
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-3 shadow-sm grid gap-2 sm:grid-cols-5">
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="rounded border px-3 py-2 text-sm">
          <option value="TODOS">Todos</option>
          <option value="CON_DEUDA">Con deuda</option>
          <option value="SIN_DEUDA">Sin deuda</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">Todas las categorías</option>
          {allCategorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-2 text-sm" title="Deuda desde" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-2 text-sm" title="Deuda hasta" />
      </div>

      <div className="rounded-lg border bg-white shadow-sm max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Proveedor</th>
              <th className="px-3 py-2 text-left font-medium">Categoría</th>
              <th className="px-3 py-2 text-right font-medium">Deuda</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.supplierId} className="border-b last:border-b-0">
                <td className="px-3 py-2">{d.supplierName}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{d.categoria ?? "—"}</td>
                <td className={`px-3 py-2 text-right font-semibold ${d.debtCents > 0 ? "text-red-700" : "text-green-700"}`}>
                  {formatArsFromCents(d.debtCents)}
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    onClick={() => setSelectedSupplierId(d.supplierId)}
                    className="text-xs underline text-neutral-600"
                  >
                    Ver detalle
                  </button>
                  {isGerencia && (
                    <>
                      <button
                        onClick={() => setFormModalSupplier(d)}
                        className="text-xs underline text-neutral-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setPayModalSupplier({ id: d.supplierId, name: d.supplierName })}
                        className="text-xs underline text-blue-700"
                      >
                        Pagar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !debts.length && (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-500" colSpan={4}>
                  No hay proveedores que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedSupplierId && (
        <SupplierDetailModal
          supplierId={selectedSupplierId}
          isGerencia={isGerencia}
          onClose={() => setSelectedSupplierId(null)}
        />
      )}

      {payModalSupplier && (
        <RegisterPaymentModal
          initialSupplier={payModalSupplier}
          suppliers={suppliers}
          onClose={() => setPayModalSupplier(null)}
          onSuccess={() => {
            setPayModalSupplier(null);
            loadDebts();
          }}
        />
      )}

      {formModalSupplier && (
        <SupplierFormModal
          supplier={formModalSupplier === "NEW" ? null : formModalSupplier}
          onClose={() => setFormModalSupplier(null)}
          onSuccess={() => {
            setFormModalSupplier(null);
            loadDebts();
            loadSuppliers();
          }}
        />
      )}
    </div>
  );
}

function SupplierFormModal({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: SupplierDebt | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(supplier?.supplierName ?? "");
  const [categoria, setCategoria] = useState(supplier?.categoria ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Ingresá el nombre del proveedor.");
    setLoading(true);
    try {
      const res = supplier
        ? await fetch(`/api/proveedores/${supplier.supplierId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, categoria: categoria || null, active }),
          })
        : await fetch("/api/proveedores", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, categoria: categoria || null }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar proveedor.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">
          {supplier ? "Editar proveedor" : "Nuevo proveedor"}
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Categoría / rubro (opcional)</label>
            <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: bebidas, carnicería..." className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {supplier && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Activo
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplierDetailModal({ supplierId, isGerencia, onClose }: { supplierId: string; isGerencia: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<{
    supplier: { name: string };
    payables: Payable[];
    payments: Payment[];
    debtCents: number;
  } | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const loadDetail = useCallback(() => {
    fetch(`/api/egresos/proveedores/${supplierId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [supplierId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm("¿Eliminar este pago? Esto revierte el impacto en la caja/cuenta de origen y en la deuda asociada.")) return;
    const res = await fetch(`/api/egresos/proveedores/pagos/${paymentId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || "Error al eliminar el pago."); return; }
    loadDetail();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-neutral-800">{detail?.supplier.name ?? "Cargando..."}</div>
            {detail && <div className="text-xs text-neutral-500">Deuda actual: {formatArsFromCents(detail.debtCents)}</div>}
          </div>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">
            Cerrar
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {detail && (
            <>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Deudas</div>
                <div className="space-y-2">
                  {detail.payables.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                      <div>
                        <div>
                          {p.sourcePurchase
                            ? `Compra ${p.sourcePurchase.invoiceNumber ?? p.sourcePurchase.id.slice(0, 8)}`
                            : p.description ?? "Deuda manual"}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {new Date(p.sourcePurchase?.purchasedAt ?? p.createdAt).toLocaleDateString("es-AR")} ·{" "}
                          {formatArsFromCents(p.totalAmountCents)} total · pagado {formatArsFromCents(p.paidAmountCents)}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                  ))}
                  {!detail.payables.length && <div className="text-sm text-neutral-500">Sin deudas registradas.</div>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Pagos</div>
                <div className="space-y-2">
                  {detail.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                      <div>
                        <div>{METHOD_LABEL[p.method]}{p.method === "TARJETA_CREDITO" && p.installments ? ` (${p.installments} cuotas)` : ""}</div>
                        <div className="text-xs text-neutral-500">
                          {new Date(p.date).toLocaleDateString("es-AR")} · {p.cashBox?.name ?? p.creditCard?.name ?? "—"} · {p.createdByEmployee.displayName}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{formatArsFromCents(p.amountCents)}</span>
                        {isGerencia && (
                          <div className="flex gap-2">
                            <button onClick={() => setEditingPayment(p)} className="text-xs underline text-neutral-500 hover:text-neutral-700">
                              Editar
                            </button>
                            <button onClick={() => handleDeletePayment(p.id)} className="text-xs underline text-red-500 hover:text-red-700">
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!detail.payments.length && <div className="text-sm text-neutral-500">Sin pagos registrados.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {editingPayment && (
        <EditSupplierPaymentModal
          payment={editingPayment}
          payables={detail?.payables ?? []}
          onClose={() => setEditingPayment(null)}
          onSuccess={() => { setEditingPayment(null); loadDetail(); }}
        />
      )}
    </div>
  );
}

function EditSupplierPaymentModal({
  payment,
  payables,
  onClose,
  onSuccess,
}: {
  payment: Payment;
  payables: Payable[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountArs, setAmountArs] = useState((payment.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(payment.date.slice(0, 10));
  const [method, setMethod] = useState(payment.method);
  const [payableId, setPayableId] = useState(payment.payableId ?? "");
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cashBoxId, setCashBoxId] = useState(payment.cashBoxId ?? "");
  const [creditCardId, setCreditCardId] = useState(payment.creditCardId ?? "");
  const [installments, setInstallments] = useState(payment.installments ?? 1);
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/egresos/cuentas?kind=EFECTIVO").then((r) => r.json()),
      fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA").then((r) => r.json()),
      fetch("/api/egresos/tarjetas").then((r) => r.json()),
    ]).then(([efectivo, bancarias, tarjetas]) => {
      setCashBoxes([...(efectivo.items ?? []), ...(bancarias.items ?? [])]);
      setCards(tarjetas.items ?? []);
    });
  }, []);

  const boxesForMethod = cashBoxes.filter((b) =>
    method === "EFECTIVO_CAJA" ? b.kind === "EFECTIVO" : b.kind === "CUENTA_BANCARIA"
  );
  const payableOptions = payables.filter((p) => p.status !== "PAID" || p.id === payment.payableId);

  async function handleSubmit() {
    setError(null);
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (method !== "TARJETA_CREDITO" && !cashBoxId) return setError("Elegí una caja o cuenta.");
    if (method === "TARJETA_CREDITO" && !creditCardId) return setError("Elegí una tarjeta.");

    setLoading(true);
    try {
      const res = await fetch(`/api/egresos/proveedores/pagos/${payment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payableId: payableId || null,
          amountCents,
          date: new Date(date + "T12:00:00.000Z").toISOString(),
          method,
          cashBoxId: method !== "TARJETA_CREDITO" ? cashBoxId : null,
          creditCardId: method === "TARJETA_CREDITO" ? creditCardId : null,
          installments: method === "TARJETA_CREDITO" ? installments : undefined,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar el pago.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Editar pago a proveedor</div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Aplicar a factura/deuda (opcional)</label>
            <select value={payableId} onChange={(e) => setPayableId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {payableOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sourcePurchase ? `Compra ${p.sourcePurchase.invoiceNumber ?? p.sourcePurchase.id.slice(0, 8)}` : p.description ?? "Deuda manual"}
                  {" — total "}{formatArsFromCents(p.totalAmountCents)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Método de pago</label>
            <select value={method} onChange={(e) => { setMethod(e.target.value as typeof method); setCashBoxId(""); setCreditCardId(""); }} className="w-full rounded border px-3 py-2 text-sm">
              <option value="EFECTIVO_CAJA">Efectivo de caja</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="TARJETA_CREDITO">Tarjeta de crédito</option>
            </select>
          </div>
          {method !== "TARJETA_CREDITO" ? (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                {method === "EFECTIVO_CAJA" ? "Caja" : "Cuenta bancaria"}
              </label>
              <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Elegir...</option>
                {boxesForMethod.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Tarjeta</label>
                <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                  <option value="">Elegir...</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Cuotas</label>
                <input type="number" min="1" max="24" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterPaymentModal({
  initialSupplier,
  suppliers,
  onClose,
  onSuccess,
}: {
  initialSupplier: { id: string; name: string };
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [supplierId, setSupplierId] = useState(initialSupplier.id);
  const [payableId, setPayableId] = useState("");
  const [payables, setPayables] = useState<Payable[]>([]);
  const [amountArs, setAmountArs] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO">("EFECTIVO_CAJA");
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cashBoxId, setCashBoxId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [notes, setNotes] = useState("");
  const [skipCashImpact, setSkipCashImpact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/egresos/cuentas?kind=EFECTIVO").then((r) => r.json()),
      fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA").then((r) => r.json()),
      fetch("/api/egresos/tarjetas").then((r) => r.json()),
    ]).then(([efectivo, bancarias, tarjetas]) => {
      setCashBoxes([...(efectivo.items ?? []), ...(bancarias.items ?? [])]);
      setCards(tarjetas.items ?? []);
    });
  }, []);

  useEffect(() => {
    setPayableId("");
    if (!supplierId) { setPayables([]); return; }
    fetch(`/api/egresos/proveedores/${supplierId}`)
      .then((r) => r.json())
      .then((d: { payables?: Payable[] }) => setPayables((d.payables ?? []).filter((p) => p.status !== "PAID")));
  }, [supplierId]);

  const boxesForMethod = cashBoxes.filter((b) =>
    method === "EFECTIVO_CAJA" ? b.kind === "EFECTIVO" : b.kind === "CUENTA_BANCARIA"
  );

  function handleSelectPayable(id: string) {
    setPayableId(id);
    const p = payables.find((x) => x.id === id);
    if (p) setAmountArs(((p.totalAmountCents - p.paidAmountCents) / 100).toFixed(2));
  }

  async function handleSubmit() {
    setError(null);
    if (!supplierId) return setError("Elegí un proveedor.");
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (method !== "TARJETA_CREDITO" && !cashBoxId) return setError("Elegí una caja o cuenta.");
    if (method === "TARJETA_CREDITO" && !creditCardId) return setError("Elegí una tarjeta.");

    setLoading(true);
    try {
      const res = await fetch("/api/egresos/proveedores/pagos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierId,
          payableId: payableId || undefined,
          amountCents,
          date: new Date(date + "T12:00:00.000Z").toISOString(),
          method,
          cashBoxId: method !== "TARJETA_CREDITO" ? cashBoxId : undefined,
          creditCardId: method === "TARJETA_CREDITO" ? creditCardId : undefined,
          installments: method === "TARJETA_CREDITO" ? installments : undefined,
          notes: notes || undefined,
          skipCashImpact: method !== "TARJETA_CREDITO" ? skipCashImpact : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar pago.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Registrar pago a proveedor</div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Proveedor</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Elegir...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {payables.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Aplicar a factura/deuda (opcional)</label>
              <select value={payableId} onChange={(e) => handleSelectPayable(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Automático (la más antigua pendiente)</option>
                {payables.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sourcePurchase ? `Compra ${p.sourcePurchase.invoiceNumber ?? p.sourcePurchase.id.slice(0, 8)}` : p.description ?? "Deuda manual"}
                    {" — saldo "}{formatArsFromCents(p.totalAmountCents - p.paidAmountCents)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Método de pago</label>
            <select value={method} onChange={(e) => { setMethod(e.target.value as typeof method); setCashBoxId(""); setCreditCardId(""); }} className="w-full rounded border px-3 py-2 text-sm">
              <option value="EFECTIVO_CAJA">Efectivo de caja</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="TARJETA_CREDITO">Tarjeta de crédito</option>
            </select>
          </div>
          {method !== "TARJETA_CREDITO" ? (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                {method === "EFECTIVO_CAJA" ? "Caja" : "Cuenta bancaria"}
              </label>
              <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Elegir...</option>
                {boxesForMethod.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <label className="mt-2 flex items-start gap-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={skipCashImpact}
                  onChange={(e) => setSkipCashImpact(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Ya está reflejado en el saldo de la cuenta (no generar movimiento). Usar cuando el pago se hizo
                  antes de cargar el saldo inicial de la cuenta.
                </span>
              </label>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Tarjeta</label>
                <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                  <option value="">Elegir...</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Cuotas</label>
                <input type="number" min="1" max="24" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Registrar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
