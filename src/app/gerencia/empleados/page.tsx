import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { HoursService } from "@/modules/horas/services/hoursService";
import { EmpleadosTabs } from "./EmpleadosTabs";

export default async function EmpleadosPage() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") redirect("/");

  const raw = await prisma.employee.findMany({
    select: { id: true, displayName: true, role: true, isActive: true, pinHash: true },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });
  const employees = raw.map(({ pinHash, ...e }) => ({ ...e, hasPin: pinHash !== null }));

  const now = new Date();
  const initialPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const summary = await HoursService.monthlySummaryForAllEmployees(now);
  const initialHoursSummary = summary.map((row) => ({
    employee: row.employee,
    totalHours: row.totalHours.toFixed(2),
    amountCents: row.amountCents,
    isPaid: row.isPaid,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    paidAmountCents: row.paidAmountCents,
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empleados</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Volver
        </Link>
      </div>
      <EmpleadosTabs
        initialEmployees={employees}
        initialHoursSummary={initialHoursSummary}
        initialPeriod={initialPeriod}
      />
    </main>
  );
}
