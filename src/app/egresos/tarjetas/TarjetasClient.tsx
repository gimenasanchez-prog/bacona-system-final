"use client";

import { useEffect, useState, useCallback } from "react";
import { formatArsFromCents } from "@/lib/money";

type Period = {
  period: string;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingCents: number;
  status: "PENDING" | "PARTIAL" | "PAID";
};

type Card = {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  active: boolean;
  payFromCashBoxId: string | null;
  payFromCashBox: { id: string; name: string } | null;
  periods: Period[];
};

type CashBox = { id: string; name: string };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-red-50 text-red-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", PARTIAL: "Parcial", PAID: "Pagado" };

function formatPeriod(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function TarjetasClient({ isGerencia }: { isGerencia: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [payTarget, setPayTarget] = useState<{ cardId: string; cardName: string; period: Period } | null>(null);
  const [formModalCard, setFormModalCard] = useState<Card | "NEW" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/egresos/tarjetas");
    const data = await res.json();
    setCards(data.items ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {isGerencia && (
        <div className="flex justify-end">
          <button
            onClick={() => setFormModalCard("NEW")}
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            + Nueva tarjeta
          </button>
        </div>
      )}
      {cards.map((card) => (
        <div key={card.id} className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{card.name}</div>
              <div className="text-xs text-neutral-500">
                Cierre día {card.closingDay} · Vencimiento día {card.dueDay}
                {card.payFromCashBox ? ` · Paga desde ${card.payFromCashBox.name}` : ""}
              </div>
            </div>
            {isGerencia && (
              <button onClick={() => setFormModalCard(card)} className="text-xs underline text-neutral-600">
                Editar
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Período</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Pagado</th>
                <th className="px-3 py-2 text-right font-medium">Restante</th>
                <th className="px-3 py-2 text-center font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {card.periods.map((p) => (
                <tr key={p.period} className="border-b last:border-b-0">
                  <td className="px-3 py-2 capitalize">{formatPeriod(p.period)}</td>
                  <td className="px-3 py-2 text-right">{formatArsFromCents(p.totalAmountCents)}</td>
                  <td className="px-3 py-2 text-right">{formatArsFromCents(p.paidAmountCents)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatArsFromCents(p.remainingCents)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isGerencia && p.remainingCents > 0 && (
                      <button
                        onClick={() => setPayTarget({ cardId: card.id, cardName: card.name, period: p })}
                        className="text-xs underline text-blue-700"
                      >
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!card.periods.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Sin cargos todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      {!cards.length && (
        <div className="rounded-lg border bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
          No hay tarjetas de crédito configuradas.
        </div>
      )}

      {payTarget && (
        <PayStatementModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}

      {formModalCard && (
        <CardFormModal
          card={formModalCard === "NEW" ? null : formModalCard}
          onClose={() => setFormModalCard(null)}
          onSuccess={() => {
            setFormModalCard(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayStatementModal({
  target,
  onClose,
  onSuccess,
}: {
  target: { cardId: string; cardName: string; period: Period };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountArs, setAmountArs] = useState((target.period.remainingCents / 100).toFixed(2));
  const [cashBoxId, setCashBoxId] = useState("");
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA")
      .then((r) => r.json())
      .then((d) => setCashBoxes(d.items ?? []));
  }, []);

  async function handleSubmit() {
    setError(null);
    const amountCents = Math.round(Number(amountArs.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) return setError("Ingresá un monto válido.");
    if (amountCents > target.period.remainingCents) return setError("El monto supera el saldo pendiente del período.");
    if (!cashBoxId) return setError("Elegí una cuenta bancaria.");

    setLoading(true);
    try {
      const res = await fetch(`/api/egresos/tarjetas/${target.cardId}/pagar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: target.period.period, amountCents, cashBoxId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al pagar resumen.");
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
          Pagar resumen — {target.cardName}
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-neutral-500">
            Restante del período: {formatArsFromCents(target.period.remainingCents)} (podés pagar parcial)
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto a pagar ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Cuenta bancaria</label>
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
            {loading ? "Guardando..." : "Pagar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardFormModal({ card, onClose, onSuccess }: { card: Card | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(card?.name ?? "");
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 10));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 20));
  const [payFromCashBoxId, setPayFromCashBoxId] = useState(card?.payFromCashBoxId ?? "");
  const [active, setActive] = useState(card?.active ?? true);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA")
      .then((r) => r.json())
      .then((d) => setCashBoxes(d.items ?? []));
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Ingresá el nombre de la tarjeta.");
    const closing = Number(closingDay);
    const due = Number(dueDay);
    if (!closing || closing < 1 || closing > 28) return setError("Día de cierre inválido (1-28).");
    if (!due || due < 1 || due > 28) return setError("Día de vencimiento inválido (1-28).");

    setLoading(true);
    try {
      const body = {
        name,
        closingDay: closing,
        dueDay: due,
        payFromCashBoxId: payFromCashBoxId || null,
        ...(card ? { active } : {}),
      };
      const res = card
        ? await fetch(`/api/egresos/tarjetas/${card.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/egresos/tarjetas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar la tarjeta.");
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
          {card ? "Editar tarjeta" : "Nueva tarjeta"}
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: BBVA Crédito" className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Día de cierre</label>
              <input type="number" min={1} max={28} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Día de vencimiento</label>
              <input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Cuenta bancaria de pago por defecto</label>
            <select value={payFromCashBoxId} onChange={(e) => setPayFromCashBoxId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="">Sin definir</option>
              {cashBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {card && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Activa
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
