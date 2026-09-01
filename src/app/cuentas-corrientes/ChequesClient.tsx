"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArsFromCents } from "@/lib/money";

type ChequeStatus = "EN_CARTERA" | "DEPOSITADO" | "ACREDITADO" | "RECHAZADO";

export type ChequeRow = {
  id: string;
  status: ChequeStatus;
  amountCents: number;
  numeroCheque: string | null;
  banco: string | null;
  librador: string | null;
  fechaRecepcion: string | Date;
  fechaDeposito: string | Date | null;
  fechaAcreditacionEstimada: string | Date | null;
  rechazoMotivo: string | null;
  createdByEmployee: { displayName: string };
  cuentaBancaria: { id: string; name: string } | null;
  posPayment: {
    sale: {
      comercialSaleLine: { clienteLabel: string; tipoVianda: string } | null;
    };
  };
};

const STATUS_LABELS: Record<ChequeStatus, string> = {
  EN_CARTERA: "En cartera",
  DEPOSITADO: "Depositado",
  ACREDITADO: "Acreditado",
  RECHAZADO: "Rechazado",
};

const STATUS_COLORS: Record<ChequeStatus, string> = {
  EN_CARTERA: "bg-amber-100 text-amber-700",
  DEPOSITADO: "bg-blue-100 text-blue-700",
  ACREDITADO: "bg-green-100 text-green-700",
  RECHAZADO: "bg-red-100 text-red-700",
};

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? res.statusText);
  return json as T;
}

type BankAccount = { id: string; name: string };

export default function ChequesClient({ initialCheques }: { initialCheques: ChequeRow[] }) {
  const [cheques, setCheques] = useState<ChequeRow[]>(initialCheques);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cheques", { cache: "no-store" });
    if (res.ok) setCheques(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setBankAccounts(data.items ?? []))
      .catch(() => {});
  }, [refresh]);

  async function handleDepositar(id: string, fechaDeposito: string) {
    setError(null);
    if (!fechaDeposito) {
      setError("Elegí una fecha de depósito.");
      return;
    }
    try {
      await apiJson(`/api/cheques/${id}/deposito`, { method: "POST", body: JSON.stringify({ fechaDeposito }) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar el depósito.");
    }
  }

  async function handleAcreditar(id: string, bankAccountId: string) {
    setError(null);
    if (!bankAccountId) {
      setError("Elegí a qué cuenta bancaria entra el cheque.");
      return;
    }
    try {
      await apiJson(`/api/cheques/${id}/acreditar`, { method: "POST", body: JSON.stringify({ bankAccountId }) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al acreditar.");
    }
  }

  async function handleRechazar(id: string) {
    setError(null);
    const motivo = window.prompt("Motivo del rechazo:");
    if (!motivo || !motivo.trim()) return;
    try {
      await apiJson(`/api/cheques/${id}/rechazar`, { method: "POST", body: JSON.stringify({ motivo }) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar.");
    }
  }

  async function handleUpdateDetails(id: string, patch: { numeroCheque?: string; banco?: string; librador?: string }) {
    try {
      await apiJson(`/api/cheques/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600">
        Cheques cobrados en Ventas Comerciales, desde que se reciben hasta que el banco acredita el dinero.
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold text-neutral-500">
            <tr>
              <th className="px-3 py-2">Recepción</th>
              <th className="px-3 py-2">Cliente / entrega</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2">Banco / N°</th>
              <th className="px-3 py-2">Depósito</th>
              <th className="px-3 py-2">Acreditación est.</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cheques.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  Todavía no hay cheques cargados.
                </td>
              </tr>
            )}
            {cheques.map((c) => (
              <ChequeTableRow
                key={c.id}
                cheque={c}
                bankAccounts={bankAccounts}
                onDepositar={handleDepositar}
                onAcreditar={handleAcreditar}
                onRechazar={handleRechazar}
                onUpdateDetails={handleUpdateDetails}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChequeTableRow({
  cheque,
  bankAccounts,
  onDepositar,
  onAcreditar,
  onRechazar,
  onUpdateDetails,
}: {
  cheque: ChequeRow;
  bankAccounts: BankAccount[];
  onDepositar: (id: string, fechaDeposito: string) => void;
  onAcreditar: (id: string, bankAccountId: string) => void;
  onRechazar: (id: string) => void;
  onUpdateDetails: (id: string, patch: { numeroCheque?: string; banco?: string; librador?: string }) => void;
}) {
  const [fechaDeposito, setFechaDeposito] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [numeroCheque, setNumeroCheque] = useState(cheque.numeroCheque ?? "");
  const [banco, setBanco] = useState(cheque.banco ?? "");
  const line = cheque.posPayment.sale.comercialSaleLine;

  return (
    <tr className="border-t border-neutral-100 align-top">
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(cheque.fechaRecepcion)}</td>
      <td className="px-3 py-2">
        {line ? (
          <>
            <div>{line.clienteLabel}</div>
            <div className="text-xs text-neutral-400">{line.tipoVianda}</div>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-right font-medium">{formatArsFromCents(cheque.amountCents)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="text"
            defaultValue={numeroCheque}
            placeholder="N° cheque"
            className="w-28 rounded border px-1.5 py-1 text-xs"
            onBlur={(ev) => {
              if (ev.target.value !== (cheque.numeroCheque ?? "")) {
                setNumeroCheque(ev.target.value);
                onUpdateDetails(cheque.id, { numeroCheque: ev.target.value });
              }
            }}
          />
          <input
            type="text"
            defaultValue={banco}
            placeholder="Banco"
            className="w-28 rounded border px-1.5 py-1 text-xs"
            onBlur={(ev) => {
              if (ev.target.value !== (cheque.banco ?? "")) {
                setBanco(ev.target.value);
                onUpdateDetails(cheque.id, { banco: ev.target.value });
              }
            }}
          />
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(cheque.fechaDeposito)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(cheque.fechaAcreditacionEstimada)}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cheque.status]}`}>
          {STATUS_LABELS[cheque.status]}
        </span>
        {cheque.status === "RECHAZADO" && cheque.rechazoMotivo && (
          <div className="mt-1 text-xs text-neutral-400">{cheque.rechazoMotivo}</div>
        )}
        {cheque.status === "ACREDITADO" && cheque.cuentaBancaria && (
          <div className="mt-1 text-xs text-neutral-400">{cheque.cuentaBancaria.name}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          {cheque.status === "EN_CARTERA" && (
            <>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={fechaDeposito}
                  onChange={(ev) => setFechaDeposito(ev.target.value)}
                  className="w-32 rounded border px-1.5 py-1 text-xs"
                />
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800"
                  onClick={() => onDepositar(cheque.id, fechaDeposito)}
                >
                  Depositar
                </button>
              </div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                onClick={() => onRechazar(cheque.id)}
              >
                Rechazar
              </button>
            </>
          )}
          {cheque.status === "DEPOSITADO" && (
            <>
              <div className="flex gap-1">
                <select
                  value={bankAccountId}
                  onChange={(ev) => setBankAccountId(ev.target.value)}
                  className="w-32 rounded border px-1.5 py-1 text-xs"
                >
                  <option value="">— Cuenta —</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800"
                  onClick={() => onAcreditar(cheque.id, bankAccountId)}
                >
                  Acreditar
                </button>
              </div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                onClick={() => onRechazar(cheque.id)}
              >
                Rechazar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
