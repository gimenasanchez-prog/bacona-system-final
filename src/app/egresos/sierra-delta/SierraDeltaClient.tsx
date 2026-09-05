"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { formatArsFromCents } from "@/lib/money";

type Currency = "ARS" | "USD";

type BreakdownLine = {
  id: string;
  periodLabel: string;
  paymentMonthLabel: string;
  amountPerPartnerCents: number;
  partnersCount: number;
};

type Debt = {
  id: string;
  concepto: string;
  currency: Currency;
  totalAmountCents: number;
  paidAmountCents: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  notas: string | null;
  breakdownLines: BreakdownLine[];
};

type Payment = {
  id: string;
  date: string;
  amountCents: number;
  exchangeRate: string | null;
  amountArsCents: number;
  cashBox: { id: string; name: string };
  notes: string | null;
  createdByEmployee: { id: string; displayName: string };
};

type DebtDetail = Debt & { payments: Payment[] };

type CashBox = { id: string; name: string };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-red-50 text-red-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", PARTIAL: "Parcial", PAID: "Pagado" };

function formatAmount(cents: number, currency: Currency) {
  const value = (cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `USD ${value}` : `$ ${value}`;
}

export function SierraDeltaClient() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Debt | null>(null);
  const [newDebtModal, setNewDebtModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<{ venta: number; fecha: string } | null>(null);
  const [exchangeRateFailed, setExchangeRateFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sierra-delta/deudas");
    const data = await res.json();
    setDebts(data.items ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    fetch("/api/sierra-delta/tipo-cambio")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.venta === "number") setExchangeRate(d);
        else setExchangeRateFailed(true);
      })
      .catch(() => setExchangeRateFailed(true));
  }, []);

  const pendingByCurrency = debts.reduce<Record<Currency, number>>(
    (acc, d) => {
      acc[d.currency] += d.totalAmountCents - d.paidAmountCents;
      return acc;
    },
    { ARS: 0, USD: 0 }
  );

  const usdEquivalentArsCents = exchangeRate ? Math.round(pendingByCurrency.USD * exchangeRate.venta) : null;
  const totalArsCents = pendingByCurrency.ARS + (usdEquivalentArsCents ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-neutral-500">Total pendiente a SierraDelta</div>
          <div className="mt-1.5 space-y-1 text-sm text-neutral-700">
            <div className="flex items-center gap-2">
              <span className="w-4 text-neutral-400">·</span>
              <span>{formatAmount(pendingByCurrency.ARS, "ARS")}</span>
              <span className="text-xs text-neutral-400">(sueldos, en pesos)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 text-neutral-400">+</span>
              {usdEquivalentArsCents !== null ? (
                <>
                  <span>
                    {formatAmount(pendingByCurrency.USD, "USD")} × {exchangeRate?.venta.toLocaleString("es-AR")} = {formatAmount(usdEquivalentArsCents, "ARS")}
                  </span>
                  <span className="text-xs text-neutral-400">(ROI, equivalente en pesos)</span>
                </>
              ) : exchangeRateFailed ? (
                <span className="text-xs text-neutral-400">
                  {formatAmount(pendingByCurrency.USD, "USD")} — no se pudo obtener el tipo de cambio del día
                </span>
              ) : (
                <span className="text-xs text-neutral-400">Buscando tipo de cambio del día...</span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2 border-t pt-2">
            <span className="text-xs font-medium text-neutral-500">Total:</span>
            <span className="text-lg font-bold text-red-700">{formatAmount(totalArsCents, "ARS")}</span>
            {exchangeRate && <span className="text-xs text-neutral-400">TC oficial {exchangeRate.fecha}</span>}
          </div>
        </div>
        <button
          onClick={() => setNewDebtModal(true)}
          className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          + Nueva deuda
        </button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-left font-medium">Concepto</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Pagado</th>
              <th className="px-3 py-2 text-right font-medium">Restante</th>
              <th className="px-3 py-2 text-center font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => {
              const expanded = expandedId === d.id;
              const remaining = d.totalAmountCents - d.paidAmountCents;
              return (
                <Fragment key={d.id}>
                  <tr className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : d.id)}
                        className="text-neutral-400 hover:text-neutral-700"
                        title="Ver detalle"
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {d.concepto} <span className="ml-1 text-xs text-neutral-400">({d.currency})</span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatAmount(d.totalAmountCents, d.currency)}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(d.paidAmountCents, d.currency)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatAmount(remaining, d.currency)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {remaining > 0 && (
                        <button onClick={() => setPayTarget(d)} className="text-xs underline text-blue-700">
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b last:border-b-0 bg-neutral-50">
                      <td colSpan={7} className="px-3 py-3">
                        <DebtDetailView debtId={d.id} currency={d.currency} onChanged={load} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && !debts.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  Sin deudas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payTarget && (
        <PayDebtModal debt={payTarget} onClose={() => setPayTarget(null)} onSuccess={() => { setPayTarget(null); load(); }} />
      )}
      {newDebtModal && (
        <NewDebtModal onClose={() => setNewDebtModal(false)} onSuccess={() => { setNewDebtModal(false); load(); }} />
      )}
    </div>
  );
}

function DebtDetailView({
  debtId,
  currency,
  onChanged,
}: {
  debtId: string;
  currency: Currency;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<DebtDetail | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const load = useCallback(() => {
    fetch(`/api/sierra-delta/deudas/${debtId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [debtId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm("¿Eliminar este pago? Esto revierte el impacto en la caja/cuenta de origen.")) return;
    const res = await fetch(`/api/sierra-delta/deudas/pagos/${paymentId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || "Error al eliminar el pago."); return; }
    load();
    onChanged();
  }

  if (!detail) return <div className="text-xs text-neutral-500">Cargando...</div>;

  return (
    <div className="space-y-3">
      {detail.breakdownLines.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Desglose del arrastre</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-400">
                <th className="text-left pb-1 pr-3 font-medium">Período</th>
                <th className="text-left pb-1 pr-3 font-medium">Se pagaba en</th>
                <th className="text-right pb-1 pr-3 font-medium">Monto c/u</th>
                <th className="text-right pb-1 font-medium">Total ({detail.breakdownLines[0].partnersCount} personas)</th>
              </tr>
            </thead>
            <tbody>
              {detail.breakdownLines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="py-1 pr-3">{l.periodLabel}</td>
                  <td className="py-1 pr-3">{l.paymentMonthLabel}</td>
                  <td className="py-1 pr-3 text-right">{formatAmount(l.amountPerPartnerCents, currency)}</td>
                  <td className="py-1 text-right font-medium">
                    {formatAmount(l.amountPerPartnerCents * l.partnersCount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Pagos registrados</div>
        <div className="space-y-1">
          {detail.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span>
                {new Date(p.date).toLocaleDateString("es-AR")} · {formatAmount(p.amountCents, currency)}
                {currency === "USD" && p.exchangeRate ? ` · TC ${p.exchangeRate}` : ""}
                {" → "}
                {formatArsFromCents(p.amountArsCents)} · {p.cashBox.name}
                {p.notes ? ` · ${p.notes}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingPayment(p)} className="underline text-neutral-500 hover:text-neutral-700">
                  Editar
                </button>
                <button onClick={() => handleDeletePayment(p.id)} className="underline text-red-500 hover:text-red-700">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {!detail.payments.length && <div className="text-xs text-neutral-500">Sin pagos registrados.</div>}
        </div>
      </div>
      {editingPayment && (
        <EditDebtPaymentModal
          payment={editingPayment}
          currency={currency}
          onClose={() => setEditingPayment(null)}
          onSuccess={() => { setEditingPayment(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function PayDebtModal({ debt, onClose, onSuccess }: { debt: Debt; onClose: () => void; onSuccess: () => void }) {
  const remaining = debt.totalAmountCents - debt.paidAmountCents;
  const [amountStr, setAmountStr] = useState((remaining / 100).toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [exchangeRateStr, setExchangeRateStr] = useState("");
  const [cashBoxId, setCashBoxId] = useState("");
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [notes, setNotes] = useState("");
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

  const amountArsPreview =
    debt.currency === "USD" && exchangeRateStr
      ? Math.round(Number(amountStr.replace(",", ".") || "0") * Number(exchangeRateStr.replace(",", ".") || "0") * 100)
      : null;

  async function handleSubmit() {
    setError(null);
    const amountCents = Math.round(Number(amountStr.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (amountCents > remaining) return setError("El monto supera el saldo pendiente.");
    if (!cashBoxId) return setError("Elegí una caja o cuenta.");

    let exchangeRate: number | undefined;
    if (debt.currency === "USD") {
      exchangeRate = Number(exchangeRateStr.replace(",", "."));
      if (!exchangeRate || exchangeRate <= 0) return setError("Ingresá el tipo de cambio del día.");
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/sierra-delta/deudas/${debt.id}/pagar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: new Date(date + "T12:00:00.000Z").toISOString(),
          amountCents,
          exchangeRate,
          cashBoxId,
          notes: notes || undefined,
          skipCashImpact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar el pago.");
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
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Pagar — {debt.concepto}</div>
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-neutral-500">Restante: {formatAmount(remaining, debt.currency)}</div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto a pagar ({debt.currency})</label>
            <input type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {debt.currency === "USD" && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Tipo de cambio del día (ARS por USD)</label>
              <input type="number" min="0" step="0.01" value={exchangeRateStr} onChange={(e) => setExchangeRateStr(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              {amountArsPreview !== null && amountArsPreview > 0 && (
                <div className="text-xs text-neutral-400 mt-1">≈ {formatArsFromCents(amountArsPreview)} en pesos</div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Caja o cuenta</label>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Elegir...</option>
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <label className="mt-2 flex items-start gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={skipCashImpact} onChange={(e) => setSkipCashImpact(e.target.checked)} className="mt-0.5" />
              <span>Ya está reflejado en el saldo de la cuenta (no generar movimiento). Usar para cargar pagos históricos ya hechos.</span>
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
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

function EditDebtPaymentModal({
  payment,
  currency,
  onClose,
  onSuccess,
}: {
  payment: Payment;
  currency: Currency;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountStr, setAmountStr] = useState((payment.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(payment.date.slice(0, 10));
  const [exchangeRateStr, setExchangeRateStr] = useState(payment.exchangeRate ?? "");
  const [cashBoxId, setCashBoxId] = useState(payment.cashBox.id);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [notes, setNotes] = useState(payment.notes ?? "");
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
    const amountCents = Math.round(Number(amountStr.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (!cashBoxId) return setError("Elegí una caja o cuenta.");

    let exchangeRate: number | undefined;
    if (currency === "USD") {
      exchangeRate = Number(exchangeRateStr.toString().replace(",", "."));
      if (!exchangeRate || exchangeRate <= 0) return setError("Ingresá el tipo de cambio del día.");
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/sierra-delta/deudas/pagos/${payment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: new Date(date + "T12:00:00.000Z").toISOString(),
          amountCents,
          exchangeRate,
          cashBoxId,
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
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Editar pago</div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto ({currency})</label>
            <input type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {currency === "USD" && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Tipo de cambio (ARS por USD)</label>
              <input type="number" min="0" step="0.01" value={exchangeRateStr} onChange={(e) => setExchangeRateStr(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Caja o cuenta</label>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Elegir...</option>
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
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

function NewDebtModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [concepto, setConcepto] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [amountStr, setAmountStr] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!concepto.trim()) return setError("Ingresá el concepto.");
    const totalAmountCents = Math.round(Number(amountStr.replace(",", ".")) * 100);
    if (!totalAmountCents || totalAmountCents <= 0) return setError("Ingresá un monto válido.");

    setLoading(true);
    try {
      const res = await fetch("/api/sierra-delta/deudas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concepto, currency, totalAmountCents, notas: notas || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear la deuda.");
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
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Nueva deuda con SierraDelta</div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Concepto</label>
            <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Retorno de inversión" className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Moneda</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="ARS">ARS (pesos)</option>
              <option value="USD">USD (dólares)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto total ({currency})</label>
            <input type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
