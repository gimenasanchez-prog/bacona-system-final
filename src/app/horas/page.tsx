import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { HoursService } from "@/modules/horas/services/hoursService";
import { HorasEntryForm } from "./HorasEntryForm";

function formatDate(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTime(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function HorasPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId || (role !== "ASOCIADO" && role !== "CAJA_LOCAL")) redirect("/");

  const { entries, totalHours, period } = await HoursService.listMonthEntries(employeeId, new Date());
  const mesLabel = period.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto max-w-lg space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mi Horario</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Volver
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Cargar horario de hoy
        </h2>
        <HorasEntryForm />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {mesLabel} — total: {totalHours.toFixed(2)} hs
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-400">Todavía no cargaste horas este mes.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Ingreso</th>
                  <th className="px-4 py-2 text-left">Salida</th>
                  <th className="px-4 py-2 text-left">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3">{formatDate(entry.workDate)}</td>
                    <td className="px-4 py-3">{formatTime(entry.checkIn)}</td>
                    <td className="px-4 py-3">{formatTime(entry.checkOut)}</td>
                    <td className="px-4 py-3">{entry.hoursWorked.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
