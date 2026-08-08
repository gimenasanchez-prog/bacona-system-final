"use client";

import { useState } from "react";

import { formatArsFromCents } from "@/lib/money";

type HoursRow = {
  employee: { id: string; displayName: string; hourlyRateCents: number | null };
  totalHours: string;
  amountCents: number | null;
  isPaid: boolean;
  paidAt: string | null;
  paidAmountCents: number | null;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${MESES[month - 1]} de ${year}`;
}

export function HorasTabClient({
  initialSummary,
  initialPeriod,
}: {
  initialSummary: HoursRow[];
  initialPeriod: string;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [summary, setSummary] = useState<HoursRow[]>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rateTargetId, setRateTargetId] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState("");

  async function fetchSummary(month: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gerencia/horas?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar horas");
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function onPeriodChange(next: string) {
    setPeriod(next);
    await fetchSummary(next);
  }

  async function saveRate(employeeId: string) {
    const cents = Math.round(Number(rateValue.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Ingresá una tarifa válida");
      return;
    }
    setBusyId(employeeId);
    setError(null);
    try {
      const res = await fetch(`/api/gerencia/empleados/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hourlyRateCents: cents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar tarifa");
      setRateTargetId(null);
      setRateValue("");
      await fetchSummary(period);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(employeeId: string) {
    setBusyId(employeeId);
    setError(null);
    try {
      const res = await fetch("/api/gerencia/horas/pagar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al marcar pagado");
      await fetchSummary(period);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-neutral-500">Mes</label>
        <input
          type="month"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-sm text-neutral-500">{periodLabel(period)}</span>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Empleado</th>
              <th className="px-4 py-2 text-left">Horas del mes</th>
              <th className="px-4 py-2 text-left">Tarifa/hora</th>
              <th className="px-4 py-2 text-left">Monto a pagar</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-left">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Cargando...
                </td>
              </tr>
            ) : summary.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Sin empleados asociados o de caja local.
                </td>
              </tr>
            ) : (
              summary.map((row) => {
                const busy = busyId === row.employee.id;
                const editingRate = rateTargetId === row.employee.id;
                return (
                  <tr key={row.employee.id} className={busy ? "bg-neutral-50" : ""}>
                    <td className="px-4 py-3 font-medium">{row.employee.displayName}</td>
                    <td className="px-4 py-3">{row.totalHours} hs</td>
                    <td className="px-4 py-3">
                      {editingRate ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rateValue}
                            onChange={(e) => setRateValue(e.target.value)}
                            placeholder="$/hora"
                            className="w-24 rounded border px-2 py-1 text-xs"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRate(row.employee.id)}
                            disabled={busy}
                            className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => {
                              setRateTargetId(null);
                              setRateValue("");
                            }}
                            className="text-xs text-neutral-400 hover:text-neutral-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setRateTargetId(row.employee.id);
                            setRateValue(
                              row.employee.hourlyRateCents != null
                                ? (row.employee.hourlyRateCents / 100).toFixed(2)
                                : ""
                            );
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {row.employee.hourlyRateCents != null
                            ? formatArsFromCents(row.employee.hourlyRateCents)
                            : "Sin definir"}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.amountCents != null ? formatArsFromCents(row.amountCents) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          row.isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {row.isPaid ? "Pagado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!row.isPaid && (
                        <button
                          onClick={() => markPaid(row.employee.id)}
                          disabled={busy || row.amountCents == null}
                          className="text-xs text-neutral-800 hover:underline disabled:opacity-40"
                          title={row.amountCents == null ? "Definí la tarifa primero" : undefined}
                        >
                          {busy ? "Guardando..." : "Marcar pagado"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
