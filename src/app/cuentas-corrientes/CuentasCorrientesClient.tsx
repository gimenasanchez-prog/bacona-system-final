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

function ars(ars: string) {
  return Math.round(parseFloat(ars || "0") * 100);
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printConsumosWindow(customerName: string, period: string, sales: UnbilledSale[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = sales
    .map(
      (s) =>
        `<tr>
          <td>${formatDate(s.createdAt)}</td>
          <td>${s.items.map((i) => `${i.qty}× ${i.productName}`).join(", ") || "Consumo"}</td>
          <td style="text-align:right">${formatArsFromCents(s.ccAmountCents)}</td>
        </tr>`
    )
    .join("");
  const total = formatArsFromCents(sales.reduce((s, x) => s + x.ccAmountCents, 0));
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Consumos ${customerName}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      h2{margin:0 0 4px;font-size:14px}p{margin:0 0 12px;color:#666;font-size:11px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:5px 8px;border:1px solid #ddd;font-size:11px}
      th{background:#f0f0f0;text-align:left}
      .right{text-align:right}.bold{font-weight:bold}
    </style></head><body>
    <h2>${customerName}</h2><p>Detalle de consumos — ${period}</p>
    <table>
      <thead><tr><th>Fecha</th><th>Consumo</th><th class="right">Monto</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2" class="bold right">Total a pagar</td><td class="bold right">${total}</td></tr></tfoot>
    </table>
    </body></html>`);
  win.document.close();
  win.print();
}

function printInvoiceDetailWindow(detail: InvoiceDetail) {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = detail.sales
    .map(
      (s) =>
        `<tr>
          <td>${formatDate(s.createdAt)}</td>
          <td>${s.items.map((i) => `${i.qty}× ${i.productName}`).join(", ") || "Consumo"}</td>
          <td style="text-align:right">${formatArsFromCents(s.ccAmountCents)}</td>
        </tr>`
    )
    .join("");
  const inv = detail.invoice;
  const facturaLabel = inv.arcaFacturaNumber ? `Factura ARCA: ${inv.arcaFacturaNumber}` : "";
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura ${detail.account.customerName}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      h2{margin:0 0 2px;font-size:14px}p{margin:0 0 2px;color:#666;font-size:11px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{padding:5px 8px;border:1px solid #ddd;font-size:11px}
      th{background:#f0f0f0;text-align:left}
      .right{text-align:right}.bold{font-weight:bold}
      .totales{margin-top:12px;max-width:320px;margin-left:auto}
      .totales-row{display:flex;justify-content:space-between;padding:3px 0;font-size:11px}
      .totales-row.bold{border-top:1px solid #ddd;padding-top:6px;margin-top:3px}
    </style></head><body>
    <h2>${detail.account.customerName}</h2>
    <p>Período: ${formatPeriod(inv.periodFrom, inv.periodTo)}</p>
    <p>Emitida: ${formatDate(inv.billingDate)} · Vence: ${formatDate(inv.estimatedPaymentDate)}</p>
    ${facturaLabel ? `<p>${facturaLabel}</p>` : ""}
    <table>
      <thead><tr><th>Fecha</th><th>Consumo</th><th class="right">Monto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totales">
      <div class="totales-row"><span>Subtotal</span><span>${formatArsFromCents(inv.subtotalCents)}</span></div>
      ${inv.ivaAmountCents > 0 ? `<div class="totales-row"><span>IVA discriminado</span><span>+ ${formatArsFromCents(inv.ivaAmountCents)}</span></div>` : ""}
      ${inv.bankWithholdingCents > 0 ? `<div class="totales-row"><span>Ret. bancaria</span><span>− ${formatArsFromCents(inv.bankWithholdingCents)}</span></div>` : ""}
      ${inv.bankFeesCents > 0 ? `<div class="totales-row"><span>Comisión bancaria</span><span>− ${formatArsFromCents(inv.bankFeesCents)}</span></div>` : ""}
      ${inv.ivaRetentionCents > 0 ? `<div class="totales-row"><span>Ret. IVA</span><span>− ${formatArsFromCents(inv.ivaRetentionCents)}</span></div>` : ""}
      ${inv.gananciasRetentionCents > 0 ? `<div class="totales-row"><span>Ret. Ganancias</span><span>− ${formatArsFromCents(inv.gananciasRetentionCents)}</span></div>` : ""}
      ${inv.rentasRetentionCents > 0 ? `<div class="totales-row"><span>Ret. Rentas</span><span>− ${formatArsFromCents(inv.rentasRetentionCents)}</span></div>` : ""}
      <div class="totales-row bold"><span>Neto a cobrar</span><span>${formatArsFromCents(inv.totalAmountCents)}</span></div>
    </div>
    </body></html>`);
  win.document.close();
  win.print();
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
                {detail.invoice.arcaFacturaNumber && (
                  <div className="text-neutral-600 font-medium">Factura ARCA: {detail.invoice.arcaFacturaNumber}</div>
                )}
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
                  <div className="flex justify-between text-neutral-500"><span>Ret. bancaria (0.94%)</span><span>− {formatArsFromCents(detail.invoice.bankWithholdingCents)}</span></div>
                )}
                {detail.invoice.bankFeesCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Comisión bancaria (2.5%)</span><span>− {formatArsFromCents(detail.invoice.bankFeesCents)}</span></div>
                )}
                {detail.invoice.ivaRetentionCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Ret. IVA</span><span>− {formatArsFromCents(detail.invoice.ivaRetentionCents)}</span></div>
                )}
                {detail.invoice.gananciasRetentionCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Ret. Ganancias</span><span>− {formatArsFromCents(detail.invoice.gananciasRetentionCents)}</span></div>
                )}
                {detail.invoice.rentasRetentionCents > 0 && (
                  <div className="flex justify-between text-neutral-500"><span>Ret. Rentas</span><span>− {formatArsFromCents(detail.invoice.rentasRetentionCents)}</span></div>
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
        <div className="border-t px-6 py-3 flex justify-between">
          <button
            onClick={() => detail && printInvoiceDetailWindow(detail)}
            disabled={!detail}
            className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
          >
            Imprimir / PDF
          </button>
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Consumos Preview Modal ───────────────────────────────────────────────────

function ConsumosPreviewModal({ customerName, currentPeriod, unbilledSales, onClose }: {
  customerName: string; currentPeriod: BillingPeriod;
  unbilledSales: UnbilledSale[]; onClose: () => void;
}) {
  const total = unbilledSales.reduce((s, x) => s + x.ccAmountCents, 0);
  const period = formatPeriod(currentPeriod.from, currentPeriod.to);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-neutral-800">{customerName}</div>
            <div className="text-xs text-neutral-400 mt-0.5">Consumos sin facturar — {period}</div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-neutral-400 uppercase tracking-wide border-b">
                <th className="text-left pb-2 font-medium pr-4">Fecha</th>
                <th className="text-left pb-2 font-medium pr-4">Consumo</th>
                <th className="text-right pb-2 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {unbilledSales.map((sale) => (
                <tr key={sale.id}>
                  <td className="py-2 pr-4 text-neutral-600 whitespace-nowrap">{formatDate(sale.createdAt)}</td>
                  <td className="py-2 pr-4 text-neutral-700">
                    {sale.items.length > 0
                      ? sale.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")
                      : "Consumo"}
                  </td>
                  <td className="py-2 text-right text-neutral-800 font-medium">{formatArsFromCents(sale.ccAmountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-300">
                <td colSpan={2} className="pt-3 font-bold text-neutral-800">Total a pagar</td>
                <td className="pt-3 text-right font-bold text-neutral-900">{formatArsFromCents(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t px-6 py-3 flex justify-between items-center">
          <p className="text-xs text-neutral-400">{unbilledSales.length} venta{unbilledSales.length !== 1 ? "s" : ""} · Sin factura ARCA asignada aún</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cerrar</button>
            <button
              onClick={() => printConsumosWindow(customerName, period, unbilledSales)}
              className="rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Imprimir / PDF
            </button>
          </div>
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

// ─── Ingresar Factura Modal ───────────────────────────────────────────────────

function IngresarFacturaModal({ accountId, customerName, currentPeriod, unbilledSales, onClose, onSuccess }: {
  accountId: string; customerName: string; currentPeriod: BillingPeriod;
  unbilledSales: UnbilledSale[]; onClose: () => void; onSuccess: () => void;
}) {
  const subtotalCents = unbilledSales.reduce((sum, s) => sum + s.ccAmountCents, 0);
  const defaultPaymentDate = new Date();
  defaultPaymentDate.setDate(defaultPaymentDate.getDate() + 30);

  const [arcaFacturaNumber, setArcaFacturaNumber] = useState("");
  const [periodFrom, setPeriodFrom] = useState(toDateInputValue(currentPeriod.from));
  const [periodTo, setPeriodTo] = useState(toDateInputValue(currentPeriod.to));
  const [estimatedPaymentDate, setEstimatedPaymentDate] = useState(toDateInputValue(defaultPaymentDate));
  const [ivaExento, setIvaExento] = useState(true);
  const [ivaDiscriminado, setIvaDiscriminado] = useState(false);
  const [ivaAmountCents, setIvaAmountCents] = useState(0);
  const [bankWithholdingArs, setBankWithholdingArs] = useState((Math.round(subtotalCents * BANK_WITHHOLDING_RATE) / 100).toFixed(2));
  const [bankFeesArs, setBankFeesArs] = useState((Math.round(subtotalCents * BANK_FEES_RATE) / 100).toFixed(2));
  const [ivaRetentionArs, setIvaRetentionArs] = useState("0.00");
  const [gananciasRetentionArs, setGananciasRetentionArs] = useState("0.00");
  const [rentasRetentionArs, setRentasRetentionArs] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankWithholdingCents = ars(bankWithholdingArs);
  const bankFeesCents = ars(bankFeesArs);
  const ivaRetentionCents = ars(ivaRetentionArs);
  const gananciasRetentionCents = ars(gananciasRetentionArs);
  const rentasRetentionCents = ars(rentasRetentionArs);
  const totalAmountCents =
    subtotalCents + ivaAmountCents -
    bankWithholdingCents - bankFeesCents -
    ivaRetentionCents - gananciasRetentionCents - rentasRetentionCents;

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
          arcaFacturaNumber: arcaFacturaNumber || undefined,
          ivaExento, ivaDiscriminado: ivaExento ? false : ivaDiscriminado,
          ivaAmountCents: ivaExento ? 0 : ivaAmountCents,
          bankWithholdingCents, bankFeesCents,
          ivaRetentionCents, gananciasRetentionCents, rentasRetentionCents,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al ingresar factura.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4">
          <div className="font-semibold text-neutral-800">Ingresar Factura ARCA — {customerName}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Registrá la factura generada en ARCA para este período</div>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Nro. ARCA */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Número de factura ARCA <span className="text-neutral-400">(opcional)</span></label>
            <input
              type="text"
              value={arcaFacturaNumber}
              onChange={(e) => setArcaFacturaNumber(e.target.value)}
              placeholder="Ej: 00001-000083"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          {/* Período */}
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

          {/* Vencimiento */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha de vencimiento <span className="text-amber-600 font-medium">(Mora si se supera)</span></label>
            <input type="date" value={estimatedPaymentDate} onChange={(e) => setEstimatedPaymentDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>

          {/* Consumos del período */}
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

          {/* IVA */}
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

          {/* Retenciones bancarias */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Retenciones bancarias</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Ret. bancaria (0.94%)</label>
                <input type="number" min="0" step="0.01" value={bankWithholdingArs} onChange={(e) => setBankWithholdingArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Comisión bancaria (2.5%)</label>
                <input type="number" min="0" step="0.01" value={bankFeesArs} onChange={(e) => setBankFeesArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Retenciones impositivas */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Retenciones impositivas</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">IVA ($)</label>
                <input type="number" min="0" step="0.01" value={ivaRetentionArs} onChange={(e) => setIvaRetentionArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Ganancias ($)</label>
                <input type="number" min="0" step="0.01" value={gananciasRetentionArs} onChange={(e) => setGananciasRetentionArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Rentas ($)</label>
                <input type="number" min="0" step="0.01" value={rentasRetentionArs} onChange={(e) => setRentasRetentionArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{formatArsFromCents(subtotalCents)}</span></div>
            {ivaAmountCents > 0 && <div className="flex justify-between text-neutral-600"><span>+ IVA discriminado</span><span>{formatArsFromCents(ivaAmountCents)}</span></div>}
            {bankWithholdingCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>− Ret. bancaria</span><span>{formatArsFromCents(bankWithholdingCents)}</span></div>}
            {bankFeesCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>− Comisión bancaria</span><span>{formatArsFromCents(bankFeesCents)}</span></div>}
            {ivaRetentionCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>− Ret. IVA</span><span>{formatArsFromCents(ivaRetentionCents)}</span></div>}
            {gananciasRetentionCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>− Ret. Ganancias</span><span>{formatArsFromCents(gananciasRetentionCents)}</span></div>}
            {rentasRetentionCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>− Ret. Rentas</span><span>{formatArsFromCents(rentasRetentionCents)}</span></div>}
            <div className="flex justify-between font-semibold text-blue-800 border-t border-blue-200 pt-2 mt-1"><span>Neto esperado a cobrar</span><span>{formatArsFromCents(totalAmountCents)}</span></div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border px-3 py-2 text-sm resize-none" placeholder="Observaciones..." />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading || unbilledSales.length === 0} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Guardando..." : "Ingresar factura"}
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

function InvoiceActionMenu({ invoice, onOpenPayment, onOpenDetail, onTogglePaid, onEditUrl, onVoid }: {
  invoice: InvoiceSummary;
  onOpenPayment: (inv: InvoiceSummary) => void;
  onOpenDetail: (id: string) => void;
  onTogglePaid: (id: string) => Promise<void>;
  onEditUrl: (id: string, url: string | null) => void;
  onVoid: (id: string) => Promise<void>;
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

  async function handleVoid() {
    setOpen(false);
    if (!window.confirm("¿Anular esta factura? Las ventas volverán a aparecer como sin facturar. Esta acción no se puede deshacer.")) return;
    await onVoid(invoice.id);
  }

  const canVoid = !invoice.isPaid && invoice.paidAmountCents === 0;

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
          {canVoid && (
            <button onClick={handleVoid} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">
              Anular factura
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Invoices Sub-Table ───────────────────────────────────────────────────────

function InvoicesSubTable({ account, onRefresh }: { account: AccountWithBillingState; onRefresh: () => void }) {
  const [ingresarModal, setIngresarModal] = useState(false);
  const [consumosModal, setConsumosModal] = useState(false);
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

  async function handleVoid(invoiceId: string) {
    const res = await fetch(`/api/cuentas-corrientes/invoices/${invoiceId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Error al anular factura."); return; }
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
            <div className="flex gap-2">
              <button
                onClick={() => setConsumosModal(true)}
                className="rounded border border-green-600 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
              >
                Ver consumos
              </button>
              <button
                onClick={() => setIngresarModal(true)}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Ingresar Factura
              </button>
            </div>
          </div>
        )}

        {/* Invoices table */}
        {allInvoices.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-400 uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">Período</th>
                <th className="text-left pb-2 font-medium">Factura ARCA</th>
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
                    <td className="py-2 pr-4 text-neutral-500 text-xs">{inv.arcaFacturaNumber ?? <span className="text-neutral-300">—</span>}</td>
                    <td className={`py-2 pr-4 ${isOverdue && !inv.isPaid ? "text-red-600 font-medium" : "text-neutral-500"}`}>
                      {formatDate(inv.estimatedPaymentDate)}
                    </td>
                    <td className="py-2 pr-4 text-right text-neutral-700">{formatArsFromCents(inv.subtotalCents)}</td>
                    <td className="py-2 pr-4 text-right text-neutral-500">
                      {inv.bankWithholdingCents + inv.bankFeesCents + inv.ivaRetentionCents + inv.gananciasRetentionCents + inv.rentasRetentionCents > 0
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
                        onVoid={handleVoid}
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

      {consumosModal && (
        <ConsumosPreviewModal
          customerName={account.customerName}
          currentPeriod={account.currentPeriod}
          unbilledSales={account.unbilledSales}
          onClose={() => setConsumosModal(false)}
        />
      )}
      {ingresarModal && (
        <IngresarFacturaModal
          accountId={account.id} customerName={account.customerName}
          currentPeriod={account.currentPeriod} unbilledSales={account.unbilledSales}
          onClose={() => setIngresarModal(false)}
          onSuccess={() => { setIngresarModal(false); onRefresh(); }}
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
  const totalRetenciones = allInvoices.reduce(
    (s, i) => s + i.bankWithholdingCents + i.bankFeesCents + i.ivaRetentionCents + i.gananciasRetentionCents + i.rentasRetentionCents,
    0
  );

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
      <div className="grid grid-cols-5 gap-3">
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
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-purple-400 font-medium uppercase tracking-wide">Retenciones est.</div>
          <div className={`text-lg font-bold mt-1 ${totalRetenciones > 0 ? "text-purple-600" : "text-neutral-400"}`}>{formatArsFromCents(totalRetenciones)}</div>
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
