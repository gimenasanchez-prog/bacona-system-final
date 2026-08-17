"use client";

import { useEffect, useState, useCallback } from "react";
import { formatArsFromCents } from "@/lib/money";

type ReconciliationSummary = {
  byMethod: { method: string; expectedCents: number }[];
  totalExpectedCents: number;
  totalReconciledCents: number;
  pendingCents: number;
};

type PaymentMethodConfig = {
  method: "DEBITO" | "CREDITO" | "TRANSFERENCIA" | "QR";
  settlementBusinessDays: number;
  withholdingPercent: string | number | null;
  feesPercent: string | number | null;
  iibbPercent: string | number | null;
  taxDebCredPercent: string | number | null;
};

type Account = {
  id: string;
  name: string;
  balanceCents: number;
  reconciliationStartDate: string | null;
  paymentMethodConfigs: PaymentMethodConfig[];
  reconciliation: ReconciliationSummary | null;
};

type Movement = {
  id: string;
  type: "IN" | "OUT";
  sourceType: string;
  amountCents: number;
  grossAmountCents: number | null;
  bankWithholdingCents: number | null;
  bankFeesCents: number | null;
  date: string;
  description: string | null;
  balanceAfterCents: number;
  createdByEmployee: { displayName: string };
};

type SaleDeductions = {
  withholdingCents: number;
  feesCents: number;
  netAfterProcessorCents: number;
  iibbCents: number;
  taxDebCredCents: number;
  netCents: number;
};

type PendingSale = {
  id: string;
  method: string;
  amountCents: number;
  createdAt: string;
  expectedCreditDate: string;
  overdueDays: number;
  deductions: SaleDeductions;
  sale: { comandaNumber: string | null; tableId: string | null; customerNameFreeText: string | null };
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL_ADJUSTMENT: "Ajuste manual",
  SALES_DEPOSIT: "Conciliación de venta",
  SUPPLIER_PAYMENT: "Pago a proveedor",
  COSTO_FIJO_PAYMENT: "Pago de costo fijo",
  RETIRO_GERENCIA: "Retiro de gerencia",
  CC_INVOICE_PAYMENT: "Pago factura cuenta corriente",
  CREDIT_CARD_STATEMENT_PAYMENT: "Pago resumen tarjeta",
  OPENING_BALANCE: "Saldo inicial",
};

const PAYMENT_METHODS: { value: PaymentMethodConfig["method"]; label: string }[] = [
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "QR", label: "QR" },
];

function saleReference(s: PendingSale) {
  return (
    s.sale.comandaNumber ||
    s.sale.customerNameFreeText ||
    (s.sale.tableId ? `Mesa ${s.sale.tableId}` : `Venta ${new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`)
  );
}

export function CuentasClient({ isGerencia }: { isGerencia: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [reconcileAccount, setReconcileAccount] = useState<Account | null>(null);
  const [configAccount, setConfigAccount] = useState<Account | null>(null);
  const [openingBalanceAccount, setOpeningBalanceAccount] = useState<Account | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/egresos/cuentas?kind=CUENTA_BANCARIA");
    const data = await res.json();
    setAccounts(data.items ?? []);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  return (
    <div className="space-y-4">
      {isGerencia && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowNewAccount(true)}
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            + Nueva cuenta bancaria
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {accounts.map((a) => {
          const pendingCents = a.reconciliation?.pendingCents ?? 0;
          return (
            <div key={a.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">{a.name}</div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Saldo (ledger real)</span>
                  <span className="font-bold">{formatArsFromCents(a.balanceCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Esperado según ventas</span>
                  <span>{formatArsFromCents(a.reconciliation?.totalExpectedCents ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pendiente de conciliar</span>
                  <span className={`font-semibold ${pendingCents !== 0 ? "text-amber-700" : "text-green-700"}`}>
                    {formatArsFromCents(pendingCents)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button onClick={() => setSelected(a)} className="rounded border px-2 py-1 hover:bg-neutral-50">
                  Movimientos
                </button>
                {isGerencia && (
                  <>
                    <button onClick={() => setReconcileAccount(a)} className="rounded border px-2 py-1 hover:bg-neutral-50">
                      Conciliar ventas
                    </button>
                    <button onClick={() => setConfigAccount(a)} className="rounded border px-2 py-1 hover:bg-neutral-50">
                      Configurar
                    </button>
                    <button onClick={() => setOpeningBalanceAccount(a)} className="rounded border px-2 py-1 hover:bg-neutral-50">
                      Saldo inicial
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected && <MovementsModal account={selected} onClose={() => setSelected(null)} />}
      {reconcileAccount && (
        <ReconcileSalesModal
          account={reconcileAccount}
          onClose={() => setReconcileAccount(null)}
          onSuccess={() => {
            setReconcileAccount(null);
            loadAccounts();
          }}
        />
      )}
      {configAccount && (
        <ConfigModal
          account={configAccount}
          onClose={() => setConfigAccount(null)}
          onSuccess={() => {
            setConfigAccount(null);
            loadAccounts();
          }}
        />
      )}
      {showNewAccount && (
        <NewAccountModal
          onClose={() => setShowNewAccount(false)}
          onSuccess={() => {
            setShowNewAccount(false);
            loadAccounts();
          }}
        />
      )}
      {openingBalanceAccount && (
        <OpeningBalanceModal
          account={openingBalanceAccount}
          onClose={() => setOpeningBalanceAccount(null)}
          onSuccess={() => {
            setOpeningBalanceAccount(null);
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}

function NewAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Ingresá el nombre de la cuenta.");
    setLoading(true);
    try {
      const res = await fetch("/api/egresos/cuentas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear la cuenta.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Nueva cuenta bancaria</div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Santander" className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OpeningBalanceModal({ account, onClose, onSuccess }: { account: Account; onClose: () => void; onSuccess: () => void }) {
  const [balanceArs, setBalanceArs] = useState((account.balanceCents / 100).toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const targetBalanceCents = Math.round(Number(balanceArs.replace(",", ".")) * 100);
    if (!Number.isFinite(targetBalanceCents)) return setError("Ingresá un monto válido.");
    setLoading(true);
    try {
      const res = await fetch(`/api/egresos/cuentas/${account.id}/saldo-inicial`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetBalanceCents,
          date: new Date(date + "T12:00:00.000Z").toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar el saldo inicial.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Saldo inicial — {account.name}</div>
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-neutral-500">
            Cargá el saldo real actual del banco. El sistema crea un ajuste para que el saldo (ledger) quede en ese
            número. No afecta el pendiente de conciliar — para eso usá &quot;Configurar&quot;.
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Saldo real actual ($)</label>
            <input
              type="number"
              step="0.01"
              value={balanceArs}
              onChange={(e) => setBalanceArs(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
    fetch(`/api/egresos/cuentas/${account.id}/movimientos`)
      .then((r) => r.json())
      .then((d) => setMovements(d.movements ?? []));
  }, [account.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="font-semibold text-neutral-800">Movimientos — {account.name}</div>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Cerrar</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Origen</th>
                <th className="px-3 py-2 text-left font-medium">Motivo</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{new Date(m.date).toLocaleDateString("es-AR")}</td>
                  <td className="px-3 py-2">{SOURCE_LABEL[m.sourceType] ?? m.sourceType}</td>
                  <td className="px-3 py-2 text-xs">{m.description ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${m.type === "IN" ? "text-green-700" : "text-red-700"}`}>
                    {m.type === "IN" ? "+" : "−"} {formatArsFromCents(m.amountCents)}
                  </td>
                  <td className="px-3 py-2 text-right">{formatArsFromCents(m.balanceAfterCents)}</td>
                </tr>
              ))}
              {!movements.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">Sin movimientos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReconcileSalesModal({ account, onClose, onSuccess }: { account: Account; onClose: () => void; onSuccess: () => void }) {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/egresos/cuentas/${account.id}/ventas-pendientes`)
      .then((r) => r.json())
      .then((d) => {
        const items: PendingSale[] = d.items ?? [];
        setSales(items);
        setSelectedIds(new Set(items.map((s) => s.id)));
      });
  }, [account.id]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(sales.map((s) => s.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  const selectedSales = sales.filter((s) => selectedIds.has(s.id));
  const totalGrossCents = selectedSales.reduce((sum, s) => sum + s.amountCents, 0);
  const withholdingCents = selectedSales.reduce((sum, s) => sum + s.deductions.withholdingCents, 0);
  const feesCents = selectedSales.reduce((sum, s) => sum + s.deductions.feesCents, 0);
  const iibbCents = selectedSales.reduce((sum, s) => sum + s.deductions.iibbCents, 0);
  const taxDebCredCents = selectedSales.reduce((sum, s) => sum + s.deductions.taxDebCredCents, 0);
  const netCents = selectedSales.reduce((sum, s) => sum + s.deductions.netCents, 0);

  async function handleSubmit() {
    setError(null);
    if (!selectedSales.length) return setError("Seleccioná al menos una venta.");
    setLoading(true);
    try {
      const res = await fetch(`/api/egresos/cuentas/${account.id}/conciliar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          posPaymentIds: selectedSales.map((s) => s.id),
          date: new Date(date + "T12:00:00.000Z").toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al conciliar.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Conciliar ventas — {account.name}</div>
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          <div className="text-xs text-neutral-500">
            Vienen todas tildadas — destildá la que no aparezca en tu extracto bancario, va a quedar pendiente.
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={sales.length > 0 && selectedIds.size === sales.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < sales.length;
                      }}
                      onChange={() => (selectedIds.size === sales.length ? deselectAll() : selectAll())}
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-medium">Fecha y hora</th>
                  <th className="px-2 py-2 text-left font-medium">Método</th>
                  <th className="px-2 py-2 text-left font-medium">Referencia</th>
                  <th className="px-2 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className={`border-b last:border-b-0 ${s.overdueDays > 1 ? "bg-amber-50" : ""}`}>
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleDateString("es-AR")}{" "}
                      {new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-2 text-xs">{s.method}</td>
                    <td className="px-2 py-2 text-xs">{saleReference(s)}</td>
                    <td className="px-2 py-2 text-right">{formatArsFromCents(s.amountCents)}</td>
                  </tr>
                ))}
                {!sales.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-neutral-500">
                      No hay ventas pendientes de conciliar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-neutral-600">Bruto seleccionado</span><span>{formatArsFromCents(totalGrossCents)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">− Retención bancaria (estimada)</span><span>{formatArsFromCents(withholdingCents)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">− Comisión bancaria (estimada)</span><span>{formatArsFromCents(feesCents)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">− Ingresos Brutos</span><span>{formatArsFromCents(iibbCents)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">− Impuesto al débito/crédito</span><span>{formatArsFromCents(taxDebCredCents)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Neto a acreditar</span><span>{formatArsFromCents(netCents)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha de conciliación</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading || !selectedSales.length} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : `Conciliar ${selectedSales.length} venta${selectedSales.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigModal({ account, onClose, onSuccess }: { account: Account; onClose: () => void; onSuccess: () => void }) {
  const [rows, setRows] = useState(() =>
    PAYMENT_METHODS.map((m) => {
      const existing = account.paymentMethodConfigs.find((c) => c.method === m.value);
      return {
        method: m.value,
        label: m.label,
        enabled: !!existing,
        settlementBusinessDays: existing?.settlementBusinessDays ?? 0,
        withholdingPercent: existing?.withholdingPercent != null ? String(existing.withholdingPercent) : "",
        feesPercent: existing?.feesPercent != null ? String(existing.feesPercent) : "",
        iibbPercent: existing?.iibbPercent != null ? String(existing.iibbPercent) : "",
        taxDebCredPercent: existing?.taxDebCredPercent != null ? String(existing.taxDebCredPercent) : "",
      };
    })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciliationStartDate, setReconciliationStartDate] = useState(
    account.reconciliationStartDate ? account.reconciliationStartDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  function updateRow(method: string, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r) => (r.method === method ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/egresos/cuentas/${account.id}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          configs: rows.map((r) => ({
            method: r.method,
            enabled: r.enabled,
            settlementBusinessDays: Number(r.settlementBusinessDays) || 0,
            withholdingPercent: r.withholdingPercent === "" ? null : Number(r.withholdingPercent),
            feesPercent: r.feesPercent === "" ? null : Number(r.feesPercent),
            iibbPercent: r.iibbPercent === "" ? null : Number(r.iibbPercent),
            taxDebCredPercent: r.taxDebCredPercent === "" ? null : Number(r.taxDebCredPercent),
          })),
          reconciliationStartDate: reconciliationStartDate
            ? new Date(reconciliationStartDate + "T00:00:00.000Z").toISOString()
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4 font-semibold text-neutral-800">Configurar — {account.name}</div>
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-neutral-500">
            Para cada método que se acredita en esta cuenta: días hábiles hasta que acredita, y % de retención/comisión que suele descontar el banco (se usan como sugerencia al conciliar, siempre editable). Editable en cualquier momento.
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Conciliar ventas a partir de</label>
            <input
              type="date"
              value={reconciliationStartDate}
              onChange={(e) => setReconciliationStartDate(e.target.value)}
              className="w-full max-w-xs rounded border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Las ventas anteriores a esta fecha no se van a pedir conciliar.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Método</th>
                  <th className="px-2 py-2 text-center font-medium">Aplica</th>
                  <th className="px-2 py-2 text-center font-medium">Días hábiles</th>
                  <th className="px-2 py-2 text-center font-medium">% Retención</th>
                  <th className="px-2 py-2 text-center font-medium">% Comisión</th>
                  <th className="px-2 py-2 text-center font-medium">% Ing. Brutos</th>
                  <th className="px-2 py-2 text-center font-medium">% Imp. Déb/Créd</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.method} className="border-b last:border-b-0">
                    <td className="px-2 py-2">{r.label}</td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={r.enabled} onChange={(e) => updateRow(r.method, { enabled: e.target.checked })} />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        disabled={!r.enabled}
                        value={r.settlementBusinessDays}
                        onChange={(e) => updateRow(r.method, { settlementBusinessDays: Number(e.target.value) })}
                        className="w-20 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        disabled={!r.enabled}
                        value={r.withholdingPercent}
                        onChange={(e) => updateRow(r.method, { withholdingPercent: e.target.value })}
                        className="w-20 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        disabled={!r.enabled}
                        value={r.feesPercent}
                        onChange={(e) => updateRow(r.method, { feesPercent: e.target.value })}
                        className="w-20 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        disabled={!r.enabled}
                        value={r.iibbPercent}
                        onChange={(e) => updateRow(r.method, { iibbPercent: e.target.value })}
                        className="w-20 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        disabled={!r.enabled}
                        value={r.taxDebCredPercent}
                        onChange={(e) => updateRow(r.method, { taxDebCredPercent: e.target.value })}
                        className="w-20 rounded border px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
