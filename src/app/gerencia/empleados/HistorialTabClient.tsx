"use client";

import { useEffect, useState } from "react";

import { formatArsFromCents } from "@/lib/money";

type PaymentType = "HOURLY" | "FIXED_MONTHLY";

type Payment = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  paymentType: PaymentType;
  hoursSnapshot: string | null;
  hourlyRateCentsSnapshot: number | null;
  monthlySalaryCentsSnapshot: number | null;
  amountCents: number;
  paidAt: string;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodLabel(iso: string) {
  const d = new Date(iso);
  return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function HistorialTabClient({
  employees,
}: {
  employees: { id: string; displayName: string }[];
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/gerencia/horas/historial?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el historial");
      setPayments(data.payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Empleado</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Desde</label>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">Hasta</label>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <button
          onClick={fetchHistory}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Filtrar
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Empleado</th>
              <th className="px-4 py-2 text-left">Período</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-left">Horas</th>
              <th className="px-4 py-2 text-left">Tarifa/Sueldo</th>
              <th className="px-4 py-2 text-left">Monto pagado</th>
              <th className="px-4 py-2 text-left">Fecha de pago</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  Cargando...
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  Sin pagos registrados.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.employeeName}</td>
                  <td className="px-4 py-3">{periodLabel(p.period)}</td>
                  <td className="px-4 py-3">{p.paymentType === "HOURLY" ? "Por hora" : "Sueldo fijo"}</td>
                  <td className="px-4 py-3">{p.hoursSnapshot ?? "—"}</td>
                  <td className="px-4 py-3">
                    {p.paymentType === "HOURLY"
                      ? p.hourlyRateCentsSnapshot != null
                        ? formatArsFromCents(p.hourlyRateCentsSnapshot)
                        : "—"
                      : p.monthlySalaryCentsSnapshot != null
                        ? formatArsFromCents(p.monthlySalaryCentsSnapshot)
                        : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatArsFromCents(p.amountCents)}</td>
                  <td className="px-4 py-3">{formatDateTime(p.paidAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
