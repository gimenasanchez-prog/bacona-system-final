"use client";

import { useActionState, useState, useEffect, startTransition } from "react";
import { identifyAction, type IdentifyState } from "@/modules/caja/actions/identifyAction";

type Employee = { id: string; displayName: string; role: string };

const roleLabel: Record<string, string> = {
  GERENCIA: "Gerencia",
  CAJA_LOCAL: "Encargada de caja",
  ASOCIADO: "Asociada/o",
  ADMINISTRATIVO: "Administrativo",
};

export function IdentifyForm({ employees }: { employees: Employee[] }) {
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState<IdentifyState, FormData>(identifyAction, null);

  // Al completar 4 dígitos, auto-submit
  useEffect(() => {
    if (pin.length === 4 && selected) {
      const fd = new FormData();
      fd.set("employeeId", selected.id);
      fd.set("pin", pin);
      startTransition(() => action(fd));
    }
  }, [pin, selected, action]);

  // Limpiar PIN cuando el servidor devuelve error
  useEffect(() => {
    if (state?.error) setPin("");
  }, [state]);

  function handleNumpad(digit: string) {
    if (digit === "back") {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 4) {
      setPin((p) => p + digit);
    }
  }

  function handleCancel() {
    setSelected(null);
    setPin("");
  }

  if (selected) {
    return (
      <div className="mt-4 flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-base font-semibold">{selected.displayName}</div>
          <div className="text-xs text-neutral-500">{roleLabel[selected.role] ?? selected.role}</div>
        </div>

        {/* Indicador de dígitos */}
        <div className="flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                pin.length > i ? "border-neutral-900 bg-neutral-900" : "border-neutral-300"
              }`}
            />
          ))}
        </div>

        {state?.error && (
          <p className="text-sm font-medium text-red-600">{state.error}</p>
        )}

        {/* Teclado numérico */}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <NumKey key={d} label={d} onPress={() => handleNumpad(d)} disabled={pending} />
          ))}
          <div /> {/* espacio vacío */}
          <NumKey label="0" onPress={() => handleNumpad("0")} disabled={pending} />
          <NumKey label="⌫" onPress={() => handleNumpad("back")} disabled={pending} />
        </div>

        <button
          type="button"
          onClick={handleCancel}
          className="text-sm text-neutral-400 hover:text-neutral-600"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map((emp) => (
        <button
          key={emp.id}
          type="button"
          onClick={() => setSelected(emp)}
          className="w-full rounded-lg border bg-white px-4 py-4 text-left shadow-sm hover:bg-neutral-50 active:bg-neutral-100"
        >
          <div className="text-sm font-semibold">{emp.displayName}</div>
          <div className="mt-0.5 text-xs text-neutral-500">{roleLabel[emp.role] ?? emp.role}</div>
        </button>
      ))}
    </div>
  );
}

function NumKey({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="flex h-14 w-14 items-center justify-center rounded-full border bg-white text-lg font-medium shadow-sm hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
