"use client";

import { identifyAction } from "@/modules/caja/actions/identifyAction";

type Employee = { id: string; displayName: string; role: string };

const roleLabel: Record<string, string> = {
  GERENCIA: "Gerencia",
  CAJA_LOCAL: "Encargada de caja",
  ASOCIADO: "Asociada/o",
};

export function IdentifyForm({ employees }: { employees: Employee[] }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map((emp) => (
        <form key={emp.id} action={identifyAction}>
          <input type="hidden" name="employeeId" value={emp.id} />
          <button
            type="submit"
            className="w-full rounded-lg border bg-white px-4 py-4 text-left shadow-sm hover:bg-neutral-50 active:bg-neutral-100"
          >
            <div className="text-sm font-semibold">{emp.displayName}</div>
            <div className="mt-0.5 text-xs text-neutral-500">{roleLabel[emp.role] ?? emp.role}</div>
          </button>
        </form>
      ))}
    </div>
  );
}
