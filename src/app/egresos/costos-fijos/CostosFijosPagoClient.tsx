"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import { formatArsFromCents } from "@/lib/money";

type Item = {
  costoFijo: {
    id: string;
    nombre: string;
    categoria: string;
    amountCents: number;
    isActive: boolean;
    isRecurring: boolean;
    linkedToHoras: boolean;
  };
  period: string;
  paidAmountCents: number;
  isPaid: boolean;
  pendingSincePeriod: string | null;
  periodsOwed: number;
  totalOwedCents: number;
};

function formatPeriodShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

type CashBox = { id: string; name: string };

const CATEGORIAS = [
  "ALQUILER",
  "SALARIOS",
  "SERVICIOS_BASICOS",
  "SEGUROS",
  "IMPUESTOS_FIJOS",
  "SUSCRIPCIONES",
  "OTRO",
] as const;

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function CostosFijosPagoClient({ isGerencia }: { isGerencia: boolean }) {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [items, setItems] = useState<Item[]>([]);
  const [payTarget, setPayTarget] = useState<Item | null>(null);
  const [formModalItem, setFormModalItem] = useState<Item["costoFijo"] | "NEW" | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function toggleExpanded(costoFijoId: string, period: string) {
    const key = `${costoFijoId}|${period}`;
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [estadoPagoFilter, setEstadoPagoFilter] = useState<"TODOS" | "PAGADO" | "PENDIENTE">("TODOS");
  const [activoFilter, setActivoFilter] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("ACTIVOS");

  const load = useCallback(async () => {
    const periodIso = new Date(`${monthValue}-01T00:00:00.000Z`).toISOString();
    const params = new URLSearchParams({ period: periodIso });
    if (categoriaFilter) params.set("categoria", categoriaFilter);
    const res = await fetch(`/api/egresos/costos-fijos?${params.toString()}`);
    const data = await res.json();
    setItems(data.items ?? []);
  }, [monthValue, categoriaFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    return items
      .filter((it) => {
        if (estadoPagoFilter === "PAGADO" && !it.isPaid) return false;
        if (estadoPagoFilter === "PENDIENTE" && it.isPaid) return false;
        if (activoFilter === "ACTIVOS" && !it.costoFijo.isActive) return false;
        if (activoFilter === "INACTIVOS" && it.costoFijo.isActive) return false;
        return true;
      })
      .sort((a, b) => {
        // Pendientes hace más tiempo primero (prioridad de pago); pagados al final.
        const aTime = a.pendingSincePeriod ? new Date(a.pendingSincePeriod).getTime() : Infinity;
        const bTime = b.pendingSincePeriod ? new Date(b.pendingSincePeriod).getTime() : Infinity;
        if (aTime !== bTime) return aTime - bTime;
        if (a.costoFijo.categoria !== b.costoFijo.categoria) {
          return a.costoFijo.categoria.localeCompare(b.costoFijo.categoria);
        }
        return a.costoFijo.nombre.localeCompare(b.costoFijo.nombre);
      });
  }, [items, estadoPagoFilter, activoFilter]);

  const totalDeudaAcumuladaCents = useMemo(
    () => items.reduce((sum, it) => sum + it.totalOwedCents, 0),
    [items]
  );

  async function handleDeactivate(id: string) {
    if (!confirm("¿Dar de baja este costo fijo?")) return;
    await fetch("/api/rentabilidad/costos-fijos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: "deactivate" }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-3 shadow-sm grid gap-2 sm:grid-cols-5 items-center">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Período</label>
          <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Categoría</label>
          <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Estado de pago</label>
          <select value={estadoPagoFilter} onChange={(e) => setEstadoPagoFilter(e.target.value as typeof estadoPagoFilter)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="TODOS">Todos</option>
            <option value="PAGADO">Pagado</option>
            <option value="PENDIENTE">Pendiente</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Activos/Inactivos</label>
          <select value={activoFilter} onChange={(e) => setActivoFilter(e.target.value as typeof activoFilter)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="ACTIVOS">Solo activos</option>
            <option value="INACTIVOS">Solo inactivos</option>
            <option value="TODOS">Todos</option>
          </select>
        </div>
        {isGerencia && (
          <div className="flex items-end justify-end">
            <button onClick={() => setFormModalItem("NEW")} className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50">
              + Nuevo costo fijo
            </button>
          </div>
        )}
      </div>

      {totalDeudaAcumuladaCents > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <span className="font-medium text-red-800">Deuda acumulada total: </span>
          <span className="font-semibold text-red-800">{formatArsFromCents(totalDeudaAcumuladaCents)}</span>
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-left font-medium">Costo fijo</th>
              <th className="px-3 py-2 text-left font-medium">Categoría</th>
              <th className="px-3 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 text-right font-medium">Pagado</th>
              <th className="px-3 py-2 text-center font-medium">Estado pago</th>
              <th className="px-3 py-2 text-center font-medium">Pendiente desde</th>
              <th className="px-3 py-2 text-right font-medium">Acumulado</th>
              <th className="px-3 py-2 text-center font-medium">Activo</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((it) => {
              const key = `${it.costoFijo.id}|${it.period}`;
              const expanded = expandedKey === key;
              return (
              <Fragment key={key}>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleExpanded(it.costoFijo.id, it.period)}
                    className="text-neutral-400 hover:text-neutral-700"
                    title="Ver pagos"
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {it.costoFijo.nombre}
                  {!it.costoFijo.isRecurring && <span className="ml-1 text-xs text-neutral-400">(único)</span>}
                  {it.costoFijo.linkedToHoras && (
                    <span
                      className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                      title="El monto se calcula en vivo desde el módulo de Horas, no es editable a mano."
                    >
                      🔗 desde Horas
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">{it.costoFijo.categoria}</td>
                <td className="px-3 py-2 text-right">{formatArsFromCents(it.costoFijo.amountCents)}</td>
                <td className="px-3 py-2 text-right">{formatArsFromCents(it.paidAmountCents)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.isPaid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {it.isPaid ? "Pagado" : "Pendiente"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-xs">
                  {it.pendingSincePeriod ? formatPeriodShort(it.pendingSincePeriod) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {it.totalOwedCents > 0 ? (
                    <div>
                      <div className="font-medium text-red-700">{formatArsFromCents(it.totalOwedCents)}</div>
                      {it.periodsOwed > 1 && (
                        <div className="text-xs text-neutral-500">({it.periodsOwed} meses)</div>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.costoFijo.isActive ? "bg-neutral-100 text-neutral-700" : "bg-neutral-100 text-neutral-400"}`}>
                    {it.costoFijo.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  {isGerencia && !it.isPaid && (
                    <button onClick={() => setPayTarget(it)} className="text-xs underline text-blue-700">
                      Marcar pagado
                    </button>
                  )}
                  {isGerencia && (
                    <button onClick={() => setFormModalItem(it.costoFijo)} className="text-xs underline text-neutral-600">
                      Editar
                    </button>
                  )}
                  {isGerencia && it.costoFijo.isActive && (
                    <button onClick={() => handleDeactivate(it.costoFijo.id)} className="text-xs underline text-red-600">
                      Dar de baja
                    </button>
                  )}
                </td>
              </tr>
              {expanded && (
                <tr className="border-b last:border-b-0 bg-neutral-50">
                  <td colSpan={10} className="px-3 py-3">
                    <PeriodPaymentsDetail costoFijoId={it.costoFijo.id} period={it.period} isGerencia={isGerencia} />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
            {!filteredItems.length && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-neutral-500">
                  No hay costos fijos que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payTarget && (
        <PayCostoFijoModal
          item={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}

      {formModalItem && (
        <CostoFijoFormModal
          item={formModalItem === "NEW" ? null : formModalItem}
          onClose={() => setFormModalItem(null)}
          onSuccess={() => {
            setFormModalItem(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CostoFijoFormModal({
  item,
  onClose,
  onSuccess,
}: {
  item: Item["costoFijo"] | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isLinked = item?.linkedToHoras ?? false;
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [categoria, setCategoria] = useState(item?.categoria ?? CATEGORIAS[0]);
  const [amountArs, setAmountArs] = useState(item ? (item.amountCents / 100).toFixed(2) : "");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [isRecurring, setIsRecurring] = useState(item ? item.isRecurring : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!nombre.trim()) return setError("Ingresá el nombre.");
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!isLinked && (!amountCents || amountCents <= 0)) return setError("Ingresá un monto válido.");

    setLoading(true);
    try {
      const res = item
        ? await fetch("/api/rentabilidad/costos-fijos", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: item.id,
              action: "update",
              nombre,
              categoria,
              amountCents: isLinked ? item.amountCents : amountCents,
              notas: notas || undefined,
              isRecurring,
            }),
          })
        : await fetch("/api/rentabilidad/costos-fijos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nombre,
              categoria,
              amountCents,
              validFrom: new Date(validFrom + "T12:00:00.000Z").toISOString(),
              notas: notas || undefined,
              isRecurring,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar.");
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
          {item ? "Editar costo fijo" : "Nuevo costo fijo"}
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Nombre</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Alquiler local" className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="w-full rounded border px-3 py-2 text-sm">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto mensual ($)</label>
            {isLinked ? (
              <div className="rounded border bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                Se calcula en vivo desde Horas — no editable acá.
              </div>
            ) : (
              <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            )}
          </div>
          {!item && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Vigente desde</label>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div className="flex items-start gap-2">
            <input
              id="isRecurring"
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="mt-0.5"
            />
            <label htmlFor="isRecurring" className="text-xs text-neutral-600">
              Es recurrente (se repite todos los meses por el mismo monto). Destildar si es una deuda de un monto fijo cargada una sola vez — en ese caso no se va a duplicar mes a mes.
            </label>
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

function PayCostoFijoModal({ item, onClose, onSuccess }: { item: Item; onClose: () => void; onSuccess: () => void }) {
  const remainingCents = item.costoFijo.amountCents - item.paidAmountCents;
  const [amountArs, setAmountArs] = useState((remainingCents / 100).toFixed(2));
  const [cashBoxId, setCashBoxId] = useState("");
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [skipCashImpact, setSkipCashImpact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/egresos/cuentas?kind=EFECTIVO").then((r) => r.json()),
      fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA").then((r) => r.json()),
    ]).then(([efectivo, bancarias]) => {
      setCashBoxes([...(efectivo.items ?? []), ...(bancarias.items ?? [])]);
    });
  }, []);

  async function handleSubmit() {
    setError(null);
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (!cashBoxId) return setError("Elegí una caja o cuenta.");

    setLoading(true);
    try {
      const res = await fetch("/api/egresos/costos-fijos/pagar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          costoFijoId: item.costoFijo.id,
          period: item.period,
          amountCents,
          cashBoxId,
          skipCashImpact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al pagar.");
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
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Pagar — {item.costoFijo.nombre}</div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto a pagar ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Caja o cuenta</label>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Elegir...</option>
              {cashBoxes.map((b) => (
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
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Pagar"}
          </button>
        </div>
      </div>
    </div>
  );
}

type CostoFijoPaymentDetail = {
  costoFijo: { id: string; nombre: string; amountCents: number };
  payments: Array<{
    id: string;
    amountCents: number;
    paidAt: string;
    cashBox: { id: string; name: string };
  }>;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingCents: number;
};

function PeriodPaymentsDetail({ costoFijoId, period, isGerencia }: { costoFijoId: string; period: string; isGerencia: boolean }) {
  const [detail, setDetail] = useState<CostoFijoPaymentDetail | null>(null);
  const [editingPayment, setEditingPayment] = useState<CostoFijoPaymentDetail["payments"][number] | null>(null);

  const loadDetail = useCallback(() => {
    fetch(`/api/egresos/costos-fijos/${costoFijoId}/periodo?period=${encodeURIComponent(period)}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [costoFijoId, period]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm("¿Eliminar este pago? Esto revierte el impacto en la caja/cuenta de origen.")) return;
    const res = await fetch(`/api/egresos/costos-fijos/pagos/${paymentId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || "Error al eliminar el pago."); return; }
    loadDetail();
  }

  if (!detail) return <div className="text-xs text-neutral-500">Cargando...</div>;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Pagos de este período</div>
      {detail.payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-xs">
          <span>{new Date(p.paidAt).toLocaleDateString("es-AR")} · {p.cashBox.name}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{formatArsFromCents(p.amountCents)}</span>
            {isGerencia && (
              <>
                <button onClick={() => setEditingPayment(p)} className="underline text-neutral-500 hover:text-neutral-700">
                  Editar
                </button>
                <button onClick={() => handleDeletePayment(p.id)} className="underline text-red-500 hover:text-red-700">
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {!detail.payments.length && <div className="text-xs text-neutral-500">Sin pagos registrados.</div>}
      {editingPayment && (
        <EditCostoFijoPaymentModal
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSuccess={() => { setEditingPayment(null); loadDetail(); }}
        />
      )}
    </div>
  );
}

function EditCostoFijoPaymentModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment: CostoFijoPaymentDetail["payments"][number];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountArs, setAmountArs] = useState((payment.amountCents / 100).toFixed(2));
  const [cashBoxId, setCashBoxId] = useState(payment.cashBox.id);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/egresos/cuentas?kind=EFECTIVO").then((r) => r.json()),
      fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA").then((r) => r.json()),
    ]).then(([efectivo, bancarias]) => {
      setCashBoxes([...(efectivo.items ?? []), ...(bancarias.items ?? [])]);
    });
  }, []);

  async function handleSubmit() {
    setError(null);
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (!cashBoxId) return setError("Elegí una caja o cuenta.");

    setLoading(true);
    try {
      const res = await fetch(`/api/egresos/costos-fijos/pagos/${payment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents, cashBoxId }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Editar pago</div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Caja o cuenta</label>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Elegir...</option>
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
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
