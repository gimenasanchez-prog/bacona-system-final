"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { formatArsFromCents } from "@/lib/money";
import type {
  AccountWithBillingState,
  InvoiceSummary,
  UnbilledSale,
  BillingPeriod,
  InvoiceDetail,
} from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

const BANK_WITHHOLDING_RATE = 0.0094;
const BANK_FEES_RATE = 0.025;

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPeriod(from: Date | string, to: Date | string) {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

function toDateInputValue(d: Date | string) {
  return new Date(d).toISOString().split("T")[0];
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    fetch(`/api/cuentas-corrientes/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setDetail(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="font-semibold text-neutral-800">Detalle de factura</div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && <p className="text-sm text-neutral-400">Cargando...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <div className="text-lg font-bold text-neutral-800">{detail.account.customerName}</div>
                <div className="text-neutral-500">Período: {formatPeriod(detail.invoice.periodFrom, detail.invoice.periodTo)}</div>
                <div className="text-neutral-500">Facturado: {formatDate(detail.invoice.billingDate)} · Vence: {formatDate(detail.invoice.estimatedPaymentDate)}</div>
              </div>
              <div>
                <div className="font-medium text-neutral-600 mb-2">Detalle de consumo</div>
                {detail.sales.length === 0 ? (
                  <p className="text-neutral-400 text-xs">Sin ventas asociadas.</p>
                ) : (
                  <div className="divide-y border rounded-lg">
                    {detail.sales.map((sale) => (
                      <div key={sale.id} className="px-4 py-2">
                        <div className="flex justify-between text-xs text-neutral-400 mb-1">
                          <span>{formatDate(sale.createdAt)}</span>
                          <span className="font-medium text-neutral-700">{formatArsFromCents(sale.ccAmountCents)}</span>
                        </div>
                        <div className="text-xs text-neutral-600 space-y-0.5">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>{item.qty}× {item.productName}</span>
                              <span>{formatArsFromCents(item.lineTotalCents)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-neutral-50 px-4 py-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-neutral-600">Subtotal</span><span className="font-medium">{formatArsFromCents(detail.invoice.subtotalCents)}</span></div>
                {detail.invoice.ivaExento && <div className="flex justify-between text-neutral-400 text-xs"><span>IVA Exento</span><span>—</span></div>}
                {!detail.invoice.ivaExento && detail.invoice.ivaDiscriminado && detail.invoice.ivaAmountCents > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-600">IVA discriminado</span><span>+ {formatArsFromCents(detail.invoice.ivaAmountCents)}</span></div>
                )}
                {detail.invoice.bankWithholdingCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Retención bancaria (est. 0.94%)</span><span>− {formatArsFromCents(detail.invoice.bankWithholdingCents)}</span></div>
                )}
                {detail.invoice.bankFeesCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Comisión bancaria (est. 2.5%)</span><span>− {formatArsFromCents(detail.invoice.bankFeesCents)}</span></div>
                )}
                <div className="flex justify-between font-bold text-blue-800 border-t pt-2 mt-1"><span>Total neto a cobrar</span><span>{formatArsFromCents(detail.invoice.totalAmountCents)}</span></div>
              </div>
              {(detail.invoice.paidAmountCents > 0 || detail.invoice.isPaid) && (
                <div className={`rounded-lg px-4 py-3 text-sm ${detail.invoice.isPaid ? "bg-green-50" : "bg-amber-50"}`}>
                  <div className="font-medium mb-1">{detail.invoice.isPaid ? "✓ Pagada" : "Pago registrado"}</div>
                  {detail.invoice.paidAmountCents > 0 && (
                    <div className="text-xs space-y-0.5 text-neutral-600">
                      <div>Monto recibido: {formatArsFromCents(detail.invoice.paidAmountCents)}</div>
                      {detail.invoice.paymentDate && <div>Fecha: {formatDate(detail.invoice.paymentDate)}</div>}
                      {detail.invoice.paymentReference && <div>Ref: {detail.invoice.paymentReference}</div>}
                    </div>
                  )}
                </div>
              )}
              {detail.invoice.digitalInvoiceUrl && (
                <a href={detail.invoice.digitalInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline block">Ver factura digital</a>
              )}
            </div>
          )}
        </div>
        <div className="border-t px-6 py-3 flex justify-end">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ invoice, onClose, onSuccess }: { invoice: InvoiceSummary; onClose: () => void; onSuccess: () => void }) {
  const [amountArs, setAmountArs] = useState((invoice.totalAmountCents / 100).toFixed(2));
  const [paymentDate, setPaymentDate] = useState(toDateInputValue(new Date()));
  const [reference, setReference] = useState(invoice.paymentReference ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-corrientes/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "recordPayment",
          paidAmountCents: Math.round(parseFloat(amountArs || "0") * 100),
          paymentDate: new Date(paymentDate + "T12:00:00.000Z").toISOString(),
          paymentReference: reference || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar pago.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="font-semibold text-neutral-800">Registrar pago recibido</div>
        <div className="text-xs text-neutral-400">Período {formatPeriod(invoice.periodFrom, invoice.periodTo)} · Total {formatArsFromCents(invoice.totalAmountCents)}</div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto recibido ($)</label>
            <input type="number" min="0" step="0.01" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha de pago</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Referencia bancaria <span className="text-neutral-400">(opcional)</span></label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nro. de transferencia..." className="w-full rounded border px-3 py-2 text-sm" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Registrar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Generate Invoice Modal ───────────────────────────────────────────────────

function GenerateInvoiceModal({ accountId, customerName, currentPeriod, unbilledSales, onClose, onSuccess }: {
  accountId: string; customerName: string; currentPeriod: BillingPeriod;
  unbilledSales: UnbilledSale[]; onClose: () => void; onSuccess: () => void;
}) {
  const subtotalCents = unbilledSales.reduce((sum, s) => sum + s.ccAmountCents, 0);
  const defaultPaymentDate = new Date();
  defaultPaymentDate.setDate(defaultPaymentDate.getDate() + 30);

  const [periodFrom, setPeriodFrom] = useState(toDateInputValue(currentPeriod.from));
  const [periodTo, setPeriodTo] = useState(toDateInputValue(currentPeriod.to));
  const [estimatedPaymentDate, setEstimatedPaymentDate] = useState(toDateInputValue(defaultPaymentDate));
  const [ivaExento, setIvaExento] = useState(true);
  const [ivaDiscriminado, setIvaDiscriminado] = useState(false);
  const [ivaAmountCents, setIvaAmountCents] = useState(0);
  const [bankWithholdingArs, setBankWithholdingArs] = useState((Math.round(subtotalCents * BANK_WITHHOLDING_RATE) / 100).toFixed(2));
  const [bankFeesArs, setBankFeesArs] = useState((Math.round(subtotalCents * BANK_FEES_RATE) / 100).toFixed(2));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankWithholdingCents = Math.round(parseFloat(bankWithholdingArs || "0") * 100);
  const bankFeesCents = Math.round(parseFloat(bankFeesArs || "0") * 100);
  const totalAmountCents = subtotalCents - bankWithholdingCents - bankFeesCents + ivaAmountCents;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-corrientes/${accountId}/invoices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodFrom: new Date(periodFrom + "T00:00:00.000Z").toISOString(),
          periodTo: new Date(periodTo + "T23:59:59.999Z").toISOString(),
          estimatedPaymentDate: new Date(estimatedPaymentDate + "T12:00:00.000Z").toISOString(),
          ivaExento, ivaDiscriminado: ivaExento ? false : ivaDiscriminado,
          ivaAmountCents: ivaExento ? 0 : ivaAmountCents,
          bankWithholdingCents, bankFeesCents, notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar factura.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="border-b px-6 py-4">
          <div className="font-semibold text-neutral-800">Generar factura — {customerName}</div>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Período desde</label>
              <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Período hasta</label>
              <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha estimada de pago</label>
            <input type="date" value={estimatedPaymentDate} onChange={(e) => setEstimatedPaymentDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between font-medium text-neutral-700">
              <span>{unbilledSales.length} ventas en el período</span>
              <span>{formatArsFromCents(subtotalCents)}</span>
            </div>
            {unbilledSales.slice(0, 5).map((s) => (
              <div key={s.id} className="flex justify-between text-xs text-neutral-400">
                <span>{formatDate(s.createdAt)} · {s.items.map((i) => `${i.qty}× ${i.productName}`).join(", ") || "Venta"}</span>
                <span>{formatArsFromCents(s.ccAmountCents)}</span>
              </div>
            ))}
            {unbilledSales.length > 5 && <div className="text-xs text-neutral-400">+ {unbilledSales.length - 5} más...</div>}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ivaExento} onChange={(e) => setIvaExento(e.target.checked)} className="rounded" />
              IVA Exento
            </label>
            {!ivaExento && (
              <div className="space-y-2 pl-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ivaDiscriminado} onChange={(e) => setIvaDiscriminado(e.target.checked)} className="rounded" />
                  IVA Discriminado
                </label>
                {ivaDiscriminado && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Monto IVA ($)</label>
                    <input type="number" min="0" step="0.01" value={(ivaAmountCents / 100).toFixed(2)} onChange={(e) => setIvaAmountCents(Math.round(parseFloat(e.target.value || "0") * 100))} className="w-full rounded border px-3 py-2 text-sm" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Retención bancaria (0.94%)</label>
              <input type="number" min="0" step="0.01" value={bankWithholdingArs} onChange={(e) => setBankWithholdingArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Comisión bancaria (2.5%)</label>
              <input type="number" min="0" step="0.01" value={bankFeesArs} onChange={(e) => setBankFeesArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm">
            <div className="flex justify-between font-semibold text-blue-800"><span>Neto esperado a cobrar</span><span>{formatArsFromCents(totalAmountCents)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border px-3 py-2 text-sm resize-none" placeholder="Observaciones..." />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading || unbilledSales.length === 0} className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? "Generando..." : "Generar factura"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit URL Modal ───────────────────────────────────────────────────────────

function EditUrlModal({ invoiceId, currentUrl, onClose, onSuccess }: { invoiceId: string; currentUrl: string | null; onClose: () => void; onSuccess: () => void }) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-corrientes/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", digitalInvoiceUrl: url || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="font-semibold text-neutral-800">URL de factura digital</div>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded border px-3 py-2 text-sm" />
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Abrir en nueva pestaña</a>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Action Menu ──────────────────────────────────────────────────────

function InvoiceActionMenu({ invoice, onOpenPayment, onOpenDetail, onTogglePaid, onEditUrl }: {
  invoice: InvoiceSummary;
  onOpenPayment: (inv: InvoiceSummary) => void;
  onOpenDetail: (id: string) => void;
  onTogglePaid: (id: string) => Promise<void>;
  onEditUrl: (id: string, url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleToggle() {
    setOpen(false);
    setToggling(true);
    try { await onTogglePaid(invoice.id); } finally { setToggling(false); }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={toggling}
        className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
      >
        {toggling ? "..." : "···"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border bg-white shadow-lg py-1 text-sm">
          <button onClick={() => { setOpen(false); onOpenDetail(invoice.id); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            Ver detalle
          </button>
          <button onClick={() => { setOpen(false); onOpenPayment(invoice); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.paidAmountCents > 0 ? "Editar pago" : "Registrar pago"}
          </button>
          <button onClick={handleToggle} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.isPaid ? "Desmarcar pagada" : "Marcar pagada"}
          </button>
          <button onClick={() => { setOpen(false); onEditUrl(invoice.id, invoice.digitalInvoiceUrl); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.digitalInvoiceUrl ? "📎 Ver/editar URL" : "+ URL factura"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Invoices Sub-Table ───────────────────────────────────────────────────────

function InvoicesSubTable({ account, onRefresh }: { account: AccountWithBillingState; onRefresh: () => void }) {
  const [generateModal, setGenerateModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState<InvoiceSummary | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editUrlState, setEditUrlState] = useState<{ id: string; url: string | null } | null>(null);

  async function handleTogglePaid(invoiceId: string) {
    await fetch(`/api/cuentas-corrientes/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "togglePaid" }),
    });
    onRefresh();
  }

  const allInvoices = [
    ...account.overdueInvoices.map((i) => ({ ...i, _bucket: "mora" as const })),
    ...account.pendingInvoices.map((i) => ({ ...i, _bucket: "pending" as const })),
  ];

  return (
    <>
      <div className="bg-neutral-50 border-t border-b px-6 py-4 space-y-3">
        {/* Próxima factura banner */}
        {account.unbilledSales.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm">
            <div className="text-green-800">
              <span className="font-medium">Próxima factura:</span>{" "}
              {formatArsFromCents(account.unbilledTotalCents)}
              <span className="text-green-600 ml-2 text-xs">
                {account.unbilledSales.length} venta{account.unbilledSales.length !== 1 ? "s" : ""} ·
                período {formatDate(account.currentPeriod.from)}–{formatDate(account.currentPeriod.to)}
              </span>
            </div>
            <button
              onClick={() => setGenerateModal(true)}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
            >
              Generar factura
            </button>
          </div>
        )}

        {/* Invoices table */}
        {allInvoices.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-400 uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">Período</th>
                <th className="text-left pb-2 font-medium">Emitida</th>
                <th className="text-left pb-2 font-medium">Vence</th>
                <th className="text-right pb-2 font-medium">Subtotal</th>
                <th className="text-right pb-2 font-medium">Neto</th>
                <th className="text-center pb-2 font-medium">Estado</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {allInvoices.map((inv) => {
                const isOverdue = inv._bucket === "mora";
                return (
                  <tr key={inv.id} className={`${inv.isPaid ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-4 text-neutral-700">{formatPeriod(inv.periodFrom, inv.periodTo)}</td>
                    <td className="py-2 pr-4 text-neutral-500">{formatDate(inv.billingDate)}</td>
                    <td className={`py-2 pr-4 ${isOverdue && !inv.isPaid ? "text-red-600 font-medium" : "text-neutral-500"}`}>
                      {formatDate(inv.estimatedPaymentDate)}
                    </td>
                    <td className="py-2 pr-4 text-right text-neutral-700">{formatArsFromCents(inv.subtotalCents)}</td>
                    <td className="py-2 pr-4 text-right text-neutral-500">
                      {inv.bankWithholdingCents + inv.bankFeesCents > 0
                        ? formatArsFromCents(inv.totalAmountCents)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      {inv.isPaid ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Pagada</span>
                      ) : isOverdue ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Mora</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <InvoiceActionMenu
                        invoice={inv}
                        onOpenPayment={setPaymentModal}
                        onOpenDetail={setDetailId}
                        onTogglePaid={handleTogglePaid}
                        onEditUrl={(id, url) => setEditUrlState({ id, url })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : account.unbilledSales.length === 0 ? (
          <p className="text-xs text-neutral-400">Sin actividad en esta cuenta.</p>
        ) : null}
      </div>

      {generateModal && (
        <GenerateInvoiceModal
          accountId={account.id} customerName={account.customerName}
          currentPeriod={account.currentPeriod} unbilledSales={account.unbilledSales}
          onClose={() => setGenerateModal(false)}
          onSuccess={() => { setGenerateModal(false); onRefresh(); }}
        />
      )}
      {paymentModal && (
        <RecordPaymentModal invoice={paymentModal} onClose={() => setPaymentModal(null)} onSuccess={() => { setPaymentModal(null); onRefresh(); }} />
      )}
      {detailId && <InvoiceDetailModal invoiceId={detailId} onClose={() => setDetailId(null)} />}
      {editUrlState && (
        <EditUrlModal invoiceId={editUrlState.id} currentUrl={editUrlState.url}
          onClose={() => setEditUrlState(null)}
          onSuccess={() => { setEditUrlState(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Account Row ──────────────────────────────────────────────────────────────

function AccountRow({ account, expanded, onToggle, onRefresh }: {
  account: AccountWithBillingState;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const allInvoices = [...account.pendingInvoices, ...account.overdueInvoices];
  const totalInvoicedDebt = allInvoices.reduce((s, i) => s + i.totalAmountCents, 0);
  const totalDebt = totalInvoicedDebt + account.unbilledTotalCents;
  const overdueTotal = account.overdueInvoices.reduce((s, i) => s + i.totalAmountCents, 0);
  const hasActivity = totalDebt > 0 || allInvoices.length > 0;

  return (
    <>
      <tr
        onClick={hasActivity ? onToggle : undefined}
        className={`border-b transition-colors ${hasActivity ? "cursor-pointer hover:bg-neutral-50" : ""} ${expanded ? "bg-neutral-50" : "bg-white"}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasActivity && (
              <span className="text-neutral-300 text-xs">{expanded ? "▼" : "▶"}</span>
            )}
            <div>
              <div className="font-medium text-neutral-800 text-sm">{account.customerName}</div>
              {account.planCode && <div className="text-xs text-neutral-400">{account.planCode}</div>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-neutral-500">
          {account.billingCycle === "QUINCENAL" ? "Quincenal" : "Mensual"}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {account.unbilledTotalCents > 0
            ? <span className="text-neutral-700">{formatArsFromCents(account.unbilledTotalCents)}</span>
            : <span className="text-neutral-300">—</span>}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {totalInvoicedDebt - overdueTotal > 0
            ? <span className="text-amber-600">{formatArsFromCents(totalInvoicedDebt - overdueTotal)}</span>
            : <span className="text-neutral-300">—</span>}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {overdueTotal > 0
            ? <span className="font-medium text-red-600">{formatArsFromCents(overdueTotal)}</span>
            : <span className="text-neutral-300">—</span>}
        </td>
        <td className="px-4 py-3 text-sm text-right font-semibold">
          {totalDebt > 0
            ? <span className={overdueTotal > 0 ? "text-red-700" : "text-neutral-800"}>{formatArsFromCents(totalDebt)}</span>
            : <span className="text-green-600 font-normal text-xs">Al día</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="p-0">
            <InvoicesSubTable account={account} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function CuentasCorrientesClient({ initialAccounts }: { initialAccounts: AccountWithBillingState[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cuentas-corrientes");
      if (res.ok) setAccounts(await res.json());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const allInvoices = accounts.flatMap((a) => [...a.pendingInvoices, ...a.overdueInvoices]);
  const totalUnbilled = accounts.reduce((s, a) => s + a.unbilledTotalCents, 0);
  const totalInvoiced = allInvoices.reduce((s, i) => s + i.totalAmountCents, 0);
  const totalOverdue = accounts.reduce((s, a) => s + a.overdueInvoices.reduce((si, i) => si + i.totalAmountCents, 0), 0);
  const totalDebt = totalUnbilled + totalInvoiced;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas Corrientes</h1>
        <button onClick={refresh} disabled={refreshing} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Deuda total</div>
          <div className={`text-lg font-bold mt-1 ${totalDebt > 0 ? "text-neutral-800" : "text-neutral-400"}`}>{formatArsFromCents(totalDebt)}</div>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Sin facturar</div>
          <div className="text-lg font-bold text-neutral-700 mt-1">{formatArsFromCents(totalUnbilled)}</div>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-amber-500 font-medium uppercase tracking-wide">Facturado</div>
          <div className="text-lg font-bold text-amber-600 mt-1">{formatArsFromCents(totalInvoiced)}</div>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-red-400 font-medium uppercase tracking-wide">En mora</div>
          <div className={`text-lg font-bold mt-1 ${totalOverdue > 0 ? "text-red-600" : "text-neutral-400"}`}>{formatArsFromCents(totalOverdue)}</div>
        </div>
      </div>

      {/* Accounts table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr className="text-xs text-neutral-400 uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-left font-medium">Ciclo</th>
              <th className="px-4 py-2 text-right font-medium">Sin facturar</th>
              <th className="px-4 py-2 text-right font-medium">Facturado</th>
              <th className="px-4 py-2 text-right font-medium">Mora</th>
              <th className="px-4 py-2 text-right font-medium">Deuda total</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <AccountRow
                key={acc.id}
                account={acc}
                expanded={expandedId === acc.id}
                onToggle={() => setExpandedId(expandedId === acc.id ? null : acc.id)}
                onRefresh={refresh}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
