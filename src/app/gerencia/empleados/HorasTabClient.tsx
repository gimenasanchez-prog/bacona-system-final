"use client";

import { useState } from "react";

import { formatArsFromCents } from "@/lib/money";

type PaymentType = "HOURLY" | "FIXED_MONTHLY";

type HoursRow = {
  employee: {
    id: string;
    displayName: string;
    hourlyRateCents: number | null;
    paymentType: PaymentType;
    monthlySalaryCents: number | null;
  };
  totalHours: string;
  amountCents: number | null;
  isPaid: boolean;
  paidAt: string | null;
  paidAmountCents: number | null;
};

type DailyEntry = {
  id: string;
  workDate: string;
  checkIn: string;
  checkOut: string;
  hoursWorked: string;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${MESES[month - 1]} de ${year}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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
  const [dailyDetail, setDailyDetail] = useState<Record<string, DailyEntry[]>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  async function fetchSummary(month: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gerencia/horas?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar horas");
      setSummary(data.summary);
      setDailyDetail({});
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

  async function loadDailyDetail(employeeId: string) {
    if (dailyDetail[employeeId]) return;
    setLoadingDetailId(employeeId);
    try {
      const res = await fetch(`/api/gerencia/horas/detalle?employeeId=${employeeId}&month=${period}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el detalle");
      setDailyDetail((prev) => ({ ...prev, [employeeId]: data.entries }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoadingDetailId(null);
    }
  }

  const totalAccruedCents = summary.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const nextPeriodLabel = (() => {
    const [year, month] = period.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1)); // month es 1-indexed en el input, así que ya apunta al mes siguiente
    return `${MESES[next.getUTCMonth()]} de ${next.getUTCFullYear()}`;
  })();

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

      <div className="rounded-lg border bg-white px-4 py-3 shadow-sm inline-block">
        <div className="text-xs text-neutral-500">Acumulado de {periodLabel(period)} (todos los operativos)</div>
        <div className="mt-1 text-lg font-bold text-neutral-800">{formatArsFromCents(totalAccruedCents)}</div>
      </div>

      <p className="text-xs text-neutral-500">
        El pago de sueldos operativos se hace desde <span className="font-medium">Egresos → Costos fijos</span> ("Sueldos Operativos"),
        no desde acá. Se paga mes vencido: lo acumulado de {periodLabel(period)} va a aparecer como el monto a pagar
        del costo fijo de <span className="font-medium">{nextPeriodLabel}</span>. Al pagarse el total del mes en
        Costos Fijos, este mes queda marcado como pagado acá automáticamente.
      </p>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Empleado</th>
              <th className="px-4 py-2 text-left">Horas del mes</th>
              <th className="px-4 py-2 text-left">Tarifa/Sueldo</th>
              <th className="px-4 py-2 text-left">Monto a pagar</th>
              <th className="px-4 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Cargando...
                </td>
              </tr>
            ) : summary.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Sin empleados asociados o de caja local.
                </td>
              </tr>
            ) : (
              summary.map((row) => {
                const isHourly = row.employee.paymentType === "HOURLY";
                const currentAmountCents = isHourly
                  ? row.employee.hourlyRateCents
                  : row.employee.monthlySalaryCents;
                const entries = dailyDetail[row.employee.id];
                const loadingDetail = loadingDetailId === row.employee.id;

                return (
                  <tr key={row.employee.id}>
                    <td className="px-4 py-3 font-medium align-top">{row.employee.displayName}</td>
                    <td className="px-4 py-3 align-top">
                      {isHourly ? (
                        <details onToggle={(e) => e.currentTarget.open && loadDailyDetail(row.employee.id)}>
                          <summary className="cursor-pointer list-none text-blue-600 hover:underline [&::-webkit-details-marker]:hidden">
                            {row.totalHours} hs <span className="text-xs text-neutral-400">(ver detalle ▾)</span>
                          </summary>
                          <div className="mt-2 overflow-auto rounded-md border">
                            {loadingDetail ? (
                              <div className="px-3 py-2 text-xs text-neutral-400">Cargando...</div>
                            ) : !entries || entries.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-neutral-400">Sin horas cargadas.</div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="bg-neutral-50 text-neutral-500">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left">Fecha</th>
                                    <th className="px-3 py-1.5 text-left">Ingreso</th>
                                    <th className="px-3 py-1.5 text-left">Salida</th>
                                    <th className="px-3 py-1.5 text-left">Horas</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entries.map((entry) => (
                                    <tr key={entry.id} className="border-t">
                                      <td className="px-3 py-1.5">{formatDate(entry.workDate)}</td>
                                      <td className="px-3 py-1.5">{formatTime(entry.checkIn)}</td>
                                      <td className="px-3 py-1.5">{formatTime(entry.checkOut)}</td>
                                      <td className="px-3 py-1.5">{entry.hoursWorked}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </details>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {currentAmountCents != null ? formatArsFromCents(currentAmountCents) : "Sin definir"}
                      <div className="text-xs text-neutral-400">
                        {isHourly ? "por hora" : "sueldo fijo"} — configurar en Empleados
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.amountCents != null ? formatArsFromCents(row.amountCents) : "—"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          row.isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {row.isPaid ? "Pagado" : "Pendiente"}
                      </span>
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
