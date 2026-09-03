"use client";

import { useState } from "react";

import { EmpleadosClient } from "./EmpleadosClient";
import { HorasTabClient } from "./HorasTabClient";
import { HistorialTabClient } from "./HistorialTabClient";

type Role = "ASOCIADO" | "CAJA_LOCAL" | "GERENCIA" | "ADMINISTRATIVO" | "COMERCIAL";
type PaymentType = "HOURLY" | "FIXED_MONTHLY";

type Employee = {
  id: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  hasPin: boolean;
  hourlyRateCents: number | null;
  paymentType: PaymentType;
  monthlySalaryCents: number | null;
};

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

export function EmpleadosTabs({
  initialEmployees,
  initialHoursSummary,
  initialPeriod,
}: {
  initialEmployees: Employee[];
  initialHoursSummary: HoursRow[];
  initialPeriod: string;
}) {
  const [tab, setTab] = useState<"empleados" | "horas" | "historial">("empleados");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("empleados")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "empleados" ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500"
          }`}
        >
          Empleados
        </button>
        <button
          onClick={() => setTab("horas")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "horas" ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500"
          }`}
        >
          Horas
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "historial" ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500"
          }`}
        >
          Historial de pagos
        </button>
      </div>

      {tab === "empleados" ? (
        <EmpleadosClient initial={initialEmployees} />
      ) : tab === "horas" ? (
        <HorasTabClient initialSummary={initialHoursSummary} initialPeriod={initialPeriod} />
      ) : (
        <HistorialTabClient employees={initialEmployees} />
      )}
    </div>
  );
}
