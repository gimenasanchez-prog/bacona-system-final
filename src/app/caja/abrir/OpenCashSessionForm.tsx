"use client";

import { useActionState, useMemo } from "react";

import {
  openCashSessionAction,
  type OpenCashSessionState,
} from "@/modules/caja/actions/cashSessionActions";

type Employee = { id: string; displayName: string };

export function OpenCashSessionForm(props: { employees: Employee[] }) {
  const initialState: OpenCashSessionState = useMemo(() => ({ error: null }), []);
  const [state, action, pending] = useActionState(openCashSessionAction, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs font-medium">Asociada/o</label>
          <select name="employeeId" className="w-full rounded-md border px-3 py-2 text-sm" required>
            <option value="">—</option>
            {props.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium">Turno</label>
          <select name="shift" className="w-full rounded-md border px-3 py-2 text-sm" defaultValue="MANIANA">
            <option value="MANIANA">Mañana</option>
            <option value="TARDE">Tarde</option>
            <option value="NOCHE">Noche</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium">Fecha</label>
        <input
          name="businessDate"
          type="date"
          className="w-full rounded-md border px-3 py-2 text-sm"
          defaultValue={today}
        />
      </div>

      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Cargando..." : "Abrir / retomar turno"}
      </button>
    </form>
  );
}

