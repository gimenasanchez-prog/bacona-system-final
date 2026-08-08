"use client";

import { useActionState, useMemo } from "react";

import { saveHoursEntryAction, type SaveHoursEntryState } from "@/modules/horas/actions/hoursEntryActions";

export function HorasEntryForm() {
  const initialState: SaveHoursEntryState = useMemo(() => ({ error: null }), []);
  const [state, action, pending] = useActionState(saveHoursEntryAction, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-xs font-medium">Fecha</label>
        <input
          name="workDate"
          type="date"
          className="w-full rounded-md border px-3 py-2 text-sm"
          defaultValue={today}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs font-medium">Hora de ingreso</label>
          <input name="checkInTime" type="time" className="w-full rounded-md border px-3 py-2 text-sm" required />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium">Hora de salida</label>
          <input name="checkOutTime" type="time" className="w-full rounded-md border px-3 py-2 text-sm" required />
        </div>
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
        {pending ? "Guardando..." : "Guardar horario"}
      </button>
    </form>
  );
}
