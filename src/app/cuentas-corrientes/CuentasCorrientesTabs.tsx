"use client";

import { useState } from "react";
import CuentasCorrientesClient from "./CuentasCorrientesClient";
import ChequesClient, { type ChequeRow } from "./ChequesClient";
import type { AccountWithBillingState } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

export default function CuentasCorrientesTabs({
  initialAccounts,
  initialLastPaymentAt,
  initialCheques,
  role,
}: {
  initialAccounts: AccountWithBillingState[];
  initialLastPaymentAt: string | null;
  initialCheques: ChequeRow[];
  role: string;
}) {
  const [tab, setTab] = useState<"cuentas" | "cheques">("cuentas");
  const pendingChequesCount = initialCheques.filter(
    (c) => c.status === "EN_CARTERA" || c.status === "DEPOSITADO"
  ).length;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border p-1">
        <button
          type="button"
          onClick={() => setTab("cuentas")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "cuentas" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          Cuentas Corrientes
        </button>
        <button
          type="button"
          onClick={() => setTab("cheques")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "cheques" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          Cheques{pendingChequesCount > 0 ? ` (${pendingChequesCount})` : ""}
        </button>
      </div>

      {tab === "cuentas" ? (
        <CuentasCorrientesClient
          initialAccounts={initialAccounts}
          initialLastPaymentAt={initialLastPaymentAt}
          role={role}
        />
      ) : (
        <ChequesClient initialCheques={initialCheques} />
      )}
    </div>
  );
}
