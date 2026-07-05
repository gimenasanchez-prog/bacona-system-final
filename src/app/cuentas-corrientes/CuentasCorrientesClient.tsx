"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { formatArsFromCents } from "@/lib/money";
import type {
  AccountWithBillingState,
  InvoiceSummary,
  PeriodSummary,
  DirectCharge,
  InvoiceDetail,
} from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import { CargosDirectosModal } from "./CargosDirectosModal";


function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPeriod(from: Date | string, to: Date | string) {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

function toDateInputValue(d: Date | string) {
  return new Date(d).toISOString().split("T")[0];
}

function ars(v: string) {
  return Math.round(parseFloat(v || "0") * 100);
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printConsumosWindow(customerName: string, period: string, sales: PeriodSummary["sales"], directCharges: DirectCharge[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const salesRows = sales
    .map(
      (s) =>
        `<tr>
          <td>${formatDate(s.createdAt)}</td>
          <td>${s.items.map((i) => {
            const mods = i.modifiers.length > 0 ? ` (${i.modifiers.join(", ")})` : "";
            return `${i.qty}× ${i.productName}${mods}`;
          }).join(", ") || "Consumo"}</td>
          <td>${s.comandaNumber ? `#${s.comandaNumber}` : ""}</td>
          <td style="text-align:right">${formatArsFromCents(s.ccAmountCents)}${s.totalCents > s.ccAmountCents ? ` <span style="color:#94a3b8;font-size:10px">(+${formatArsFromCents(s.totalCents - s.ccAmountCents)} pers.)</span>` : ""}</td>
        </tr>`
    )
    .join("");
  const chargeRows = directCharges
    .map(
      (c) =>
        `<tr style="background:#fffbeb">
          <td>${formatDate(c.date)}</td>
          <td>${CHARGE_CATEGORY_LABELS[c.category] ?? c.category} — ${c.description}</td>
          <td>${c.comandaNumber ? `#${c.comandaNumber}` : ""}</td>
          <td style="text-align:right">${formatArsFromCents(c.amountCents)}</td>
        </tr>`
    )
    .join("");
  const total = formatArsFromCents(
    sales.reduce((s, x) => s + x.ccAmountCents, 0) +
    directCharges.reduce((s, x) => s + x.amountCents, 0)
  );
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
      <thead><tr><th>Fecha</th><th>Consumo</th><th>Comanda</th><th class="right">Monto</th></tr></thead>
      <tbody>${salesRows}${chargeRows}</tbody>
      <tfoot><tr><td colspan="3" class="bold right">Total a pagar</td><td class="bold right">${total}</td></tr></tfoot>
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
          <td>${s.items.map((i) => {
            const mods = i.modifiers.length > 0 ? ` (${i.modifiers.join(", ")})` : "";
            return `${i.qty}× ${i.productName}${mods}`;
          }).join(", ") || "Consumo"}</td>
          <td style="text-align:right">${formatArsFromCents(s.ccAmountCents)}${s.totalCents > s.ccAmountCents ? ` <span style="color:#94a3b8;font-size:10px">(+${formatArsFromCents(s.totalCents - s.ccAmountCents)} pers.)</span>` : ""}</td>
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
      ${inv.ivaAmountCents > 0 ? `<div class="totales-row"><span>del cual IVA discriminado</span><span>${formatArsFromCents(inv.ivaAmountCents)}</span></div>` : ""}
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
                          <span className="font-medium text-neutral-700">
                            {formatArsFromCents(sale.ccAmountCents)}
                            {sale.totalCents > sale.ccAmountCents && (
                              <span className="ml-1 text-xs font-normal text-slate-400">
                                (+{formatArsFromCents(sale.totalCents - sale.ccAmountCents)} pers.)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600 space-y-0.5">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>
                                {item.qty}× {item.productName}
                                {item.modifiers.length > 0 && (
                                  <span className="text-neutral-400 ml-1">({item.modifiers.join(", ")})</span>
                                )}
                              </span>
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
                {detail.invoice.bankWithholdingCents > 0 && <div className="flex justify-between text-neutral-500"><span>Ret. bancaria (0.94%)</span><span>− {formatArsFromCents(detail.invoice.bankWithholdingCents)}</span></div>}
                {detail.invoice.bankFeesCents > 0 && <div className="flex justify-between text-neutral-500"><span>Comisión bancaria (2.5%)</span><span>− {formatArsFromCents(detail.invoice.bankFeesCents)}</span></div>}
                {detail.invoice.ivaRetentionCents > 0 && <div className="flex justify-between text-neutral-500"><span>Ret. IVA</span><span>− {formatArsFromCents(detail.invoice.ivaRetentionCents)}</span></div>}
                {detail.invoice.gananciasRetentionCents > 0 && <div className="flex justify-between text-neutral-500"><span>Ret. Ganancias</span><span>− {formatArsFromCents(detail.invoice.gananciasRetentionCents)}</span></div>}
                {detail.invoice.rentasRetentionCents > 0 && <div className="flex justify-between text-neutral-500"><span>Ret. Rentas</span><span>− {formatArsFromCents(detail.invoice.rentasRetentionCents)}</span></div>}
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
          <button onClick={() => detail && printInvoiceDetailWindow(detail)} disabled={!detail} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">
            Imprimir / PDF
          </button>
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Consumos Preview Modal ───────────────────────────────────────────────────

function ComandaInlineEdit({ url, onSaved }: { url: string; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comandaNumber: value.trim() }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="N° comanda"
        className="w-24 rounded border px-2 py-0.5 text-xs"
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      <button
        onClick={handleSave}
        disabled={saving || !value.trim()}
        className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-white disabled:opacity-40"
      >
        {saving ? "..." : "Guardar"}
      </button>
    </div>
  );
}

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  CONSUMO_OLVIDADO: "Consumo olvidado",
  SERVICIO_ESPECIAL: "Servicio especial",
  CORRECCION: "Corrección",
  OTRO: "Otro",
};

function ConsumosPreviewModal({ customerName, period, sales, directCharges, onClose, onRefresh }: {
  customerName: string;
  period: { from: Date | string; to: Date | string };
  sales: PeriodSummary["sales"];
  directCharges: DirectCharge[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const salesTotal = sales.reduce((s, x) => s + x.ccAmountCents, 0);
  const chargesTotal = directCharges.reduce((s, x) => s + x.amountCents, 0);
  const total = salesTotal + chargesTotal;
  const periodStr = formatPeriod(period.from, period.to);
  const isEmpty = sales.length === 0 && directCharges.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-neutral-800">{customerName}</div>
            <div className="text-xs text-neutral-400 mt-0.5">Consumos — {periodStr}</div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {isEmpty ? (
            <p className="text-sm text-neutral-400">Sin consumos en este período.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-neutral-400 uppercase tracking-wide border-b">
                  <th className="text-left pb-2 font-medium pr-4">Fecha</th>
                  <th className="text-left pb-2 font-medium pr-4">Consumo</th>
                  <th className="text-left pb-2 font-medium pr-4">Comanda</th>
                  <th className="text-right pb-2 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="py-2 pr-4 text-neutral-600 whitespace-nowrap">{formatDate(sale.createdAt)}</td>
                    <td className="py-2 pr-4 text-neutral-700">
                      {sale.items.length > 0
                        ? sale.items.map((i) => {
                            const mods = i.modifiers.length > 0 ? ` (${i.modifiers.join(", ")})` : "";
                            return `${i.qty}× ${i.productName}${mods}`;
                          }).join(", ")
                        : "Consumo"}
                    </td>
                    <td className="py-2 pr-4">
                      {sale.comandaNumber
                        ? <span className="font-mono text-neutral-700">#{sale.comandaNumber}</span>
                        : <ComandaInlineEdit url={`/api/pos/sales/${sale.id}`} onSaved={onRefresh} />
                      }
                    </td>
                    <td className="py-2 text-right text-neutral-800 font-medium whitespace-nowrap">
                      {formatArsFromCents(sale.ccAmountCents)}
                      {sale.totalCents > sale.ccAmountCents && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          (+{formatArsFromCents(sale.totalCents - sale.ccAmountCents)} pers.)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {directCharges.map((charge) => (
                  <tr key={charge.id} className="bg-amber-50/60">
                    <td className="py-2 pr-4 text-neutral-600 whitespace-nowrap">{formatDate(charge.date)}</td>
                    <td className="py-2 pr-4 text-neutral-700">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          {CHARGE_CATEGORY_LABELS[charge.category] ?? charge.category}
                        </span>
                        <span>{charge.description}</span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5">Motivo: {charge.motive}</div>
                    </td>
                    <td className="py-2 pr-4">
                      {charge.comandaNumber
                        ? <span className="font-mono text-neutral-700">#{charge.comandaNumber}</span>
                        : <ComandaInlineEdit url={`/api/cuentas-corrientes/direct-charges/${charge.id}`} onSaved={onRefresh} />
                      }
                    </td>
                    <td className="py-2 text-right text-neutral-800 font-medium">{formatArsFromCents(charge.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-300">
                  <td colSpan={3} className="pt-3 font-bold text-neutral-800 pr-4">Total</td>
                  <td className="pt-3 text-right font-bold text-neutral-900">{formatArsFromCents(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div className="border-t px-6 py-3 flex justify-between items-center">
          <p className="text-xs text-neutral-400">
            {sales.length} venta{sales.length !== 1 ? "s" : ""}
            {directCharges.length > 0 && ` · ${directCharges.length} cargo${directCharges.length !== 1 ? "s" : ""} directo${directCharges.length !== 1 ? "s" : ""}`}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cerrar</button>
            <button onClick={() => printConsumosWindow(customerName, periodStr, sales, directCharges)} className="rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900">
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
  const [ivaRetentionArs, setIvaRetentionArs] = useState("0.00");
  const [gananciasRetentionArs, setGananciasRetentionArs] = useState("0.00");
  const [rentasRetentionArs, setRentasRetentionArs] = useState("0.00");
  const [sussRetentionArs, setSussRetentionArs] = useState("0.00");
  const [tisshRetentionArs, setTisshRetentionArs] = useState("0.00");
  const [paymentDate, setPaymentDate] = useState(toDateInputValue(new Date()));
  const [reference, setReference] = useState(invoice.paymentReference ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ivaRetentionCents = ars(ivaRetentionArs);
  const gananciasRetentionCents = ars(gananciasRetentionArs);
  const rentasRetentionCents = ars(rentasRetentionArs);
  const sussRetentionCents = ars(sussRetentionArs);
  const tisshRetentionCents = ars(tisshRetentionArs);
  const netoCents = invoice.totalAmountCents - ivaRetentionCents - gananciasRetentionCents - rentasRetentionCents - sussRetentionCents - tisshRetentionCents;

  const [amountArs, setAmountArs] = useState("");
  const [amountManual, setAmountManual] = useState(false);

  const displayedAmountArs = amountManual ? amountArs : (netoCents / 100).toFixed(2);
  const paidAmountCents = amountManual ? ars(amountArs) : netoCents;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-corrientes/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "recordPayment",
          paidAmountCents,
          paymentDate: new Date(paymentDate + "T12:00:00.000Z").toISOString(),
          paymentReference: reference || undefined,
          ivaRetentionCents,
          gananciasRetentionCents,
          rentasRetentionCents,
          sussRetentionCents,
          tisshRetentionCents,
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
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="border-b px-6 py-4">
          <div className="font-semibold text-neutral-800">Registrar pago recibido</div>
          <div className="text-xs text-neutral-400 mt-0.5">Período {formatPeriod(invoice.periodFrom, invoice.periodTo)} · Factura {formatArsFromCents(invoice.totalAmountCents)}</div>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Retenciones impositivas (cliente)</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">IVA ($)</label>
                <input type="number" min="0" step="0.01" value={ivaRetentionArs} onChange={(e) => { setIvaRetentionArs(e.target.value); setAmountManual(false); }} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Ganancias ($)</label>
                <input type="number" min="0" step="0.01" value={gananciasRetentionArs} onChange={(e) => { setGananciasRetentionArs(e.target.value); setAmountManual(false); }} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Rentas ($)</label>
                <input type="number" min="0" step="0.01" value={rentasRetentionArs} onChange={(e) => { setRentasRetentionArs(e.target.value); setAmountManual(false); }} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">SUSS ($)</label>
                <input type="number" min="0" step="0.01" value={sussRetentionArs} onChange={(e) => { setSussRetentionArs(e.target.value); setAmountManual(false); }} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">TISSH SAC ($)</label>
                <input type="number" min="0" step="0.01" value={tisshRetentionArs} onChange={(e) => { setTisshRetentionArs(e.target.value); setAmountManual(false); }} className="w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-neutral-600"><span>Total factura</span><span>{formatArsFromCents(invoice.totalAmountCents)}</span></div>
            {(ivaRetentionCents + gananciasRetentionCents + rentasRetentionCents + sussRetentionCents + tisshRetentionCents) > 0 && (
              <div className="flex justify-between text-neutral-500 text-xs"><span>− Ret. impositivas</span><span>{formatArsFromCents(ivaRetentionCents + gananciasRetentionCents + rentasRetentionCents + sussRetentionCents + tisshRetentionCents)}</span></div>
            )}
            <div className="flex justify-between text-neutral-500 text-xs border-t border-neutral-200 pt-1 mt-1"><span>Neto estimado</span><span>{formatArsFromCents(netoCents)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Monto recibido ($) <span className="text-neutral-400">(editable si difiere del neto estimado)</span></label>
            <input type="number" min="0" step="0.01" value={displayedAmountArs} onChange={(e) => { setAmountArs(e.target.value); setAmountManual(true); }} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha de pago</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Referencia bancaria <span className="text-neutral-400">(opcional)</span></label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nro. de transferencia..." className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
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

function IngresarFacturaModal({ accountId, customerName, period, sales, directCharges, onClose, onSuccess }: {
  accountId: string; customerName: string;
  period: { from: Date | string; to: Date | string };
  sales: PeriodSummary["sales"];
  directCharges: DirectCharge[];
  onClose: () => void; onSuccess: () => void;
}) {
  const subtotalCents =
    sales.reduce((sum, s) => sum + s.ccAmountCents, 0) +
    directCharges.reduce((sum, c) => sum + c.amountCents, 0);
  const defaultPaymentDate = new Date();
  defaultPaymentDate.setDate(defaultPaymentDate.getDate() + 30);

  const [arcaFacturaNumber, setArcaFacturaNumber] = useState("");
  const [periodFrom, setPeriodFrom] = useState(toDateInputValue(period.from));
  const [periodTo, setPeriodTo] = useState(toDateInputValue(period.to));
  const [estimatedPaymentDate, setEstimatedPaymentDate] = useState(toDateInputValue(defaultPaymentDate));
  const [ivaExento, setIvaExento] = useState(true);
  const [ivaDiscriminado, setIvaDiscriminado] = useState(false);
  const [ivaAmountArs, setIvaAmountArs] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ivaAmountCents = ars(ivaAmountArs);
  const totalAmountCents = subtotalCents;

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
          <div className="text-xs text-neutral-400 mt-0.5">Período {formatPeriod(period.from, period.to)}</div>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Número de factura ARCA <span className="text-neutral-400">(opcional)</span></label>
            <input type="text" value={arcaFacturaNumber} onChange={(e) => setArcaFacturaNumber(e.target.value)} placeholder="Ej: 00001-000083" className="w-full rounded border px-3 py-2 text-sm" />
          </div>
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
            <label className="block text-xs font-medium text-neutral-500 mb-1">Fecha de vencimiento <span className="text-amber-600 font-medium">(Mora si se supera)</span></label>
            <input type="date" value={estimatedPaymentDate} onChange={(e) => setEstimatedPaymentDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between font-medium text-neutral-700">
              <span>
                {sales.length} venta{sales.length !== 1 ? "s" : ""}
                {directCharges.length > 0 && ` · ${directCharges.length} cargo${directCharges.length !== 1 ? "s" : ""} directo${directCharges.length !== 1 ? "s" : ""}`}
              </span>
              <span>{formatArsFromCents(subtotalCents)}</span>
            </div>
            {sales.slice(0, 4).map((s) => (
              <div key={s.id} className="flex justify-between text-xs text-neutral-400">
                <span>{formatDate(s.createdAt)} · {s.items.map((i) => {
                  const mods = i.modifiers.length > 0 ? ` (${i.modifiers.join(", ")})` : "";
                  return `${i.qty}× ${i.productName}${mods}`;
                }).join(", ") || "Venta"}</span>
                <span>{formatArsFromCents(s.ccAmountCents)}</span>
              </div>
            ))}
            {sales.length > 4 && <div className="text-xs text-neutral-400">+ {sales.length - 4} ventas más...</div>}
            {directCharges.map((c) => (
              <div key={c.id} className="flex justify-between text-xs text-amber-700 bg-amber-50/80 rounded px-1 py-0.5">
                <span>{formatDate(c.date)} · {CHARGE_CATEGORY_LABELS[c.category] ?? c.category} — {c.description}</span>
                <span>{formatArsFromCents(c.amountCents)}</span>
              </div>
            ))}
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
                    <input type="number" min="0" step="0.01" value={ivaAmountArs} onChange={(e) => setIvaAmountArs(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{formatArsFromCents(subtotalCents)}</span></div>
            {ivaAmountCents > 0 && <div className="flex justify-between text-neutral-500 text-xs"><span>del cual IVA discriminado</span><span>{formatArsFromCents(ivaAmountCents)}</span></div>}
            <div className="flex justify-between font-semibold text-blue-800 border-t border-blue-200 pt-2 mt-1"><span>Total factura</span><span>{formatArsFromCents(totalAmountCents)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border px-3 py-2 text-sm resize-none" placeholder="Observaciones..." />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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
        <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border bg-white shadow-lg py-1 text-sm">
          <button onClick={() => { setOpen(false); onOpenDetail(invoice.id); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">Ver detalle</button>
          <button onClick={() => { setOpen(false); onOpenPayment(invoice); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.paidAmountCents > 0 ? "Editar pago" : "Registrar pago"}
          </button>
          <button onClick={handleToggle} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.isPaid ? "Desmarcar pagada" : "Marcar pagada"}
          </button>
          <button onClick={() => { setOpen(false); onEditUrl(invoice.id, invoice.digitalInvoiceUrl); }} className="w-full text-left px-4 py-2 hover:bg-neutral-50">
            {invoice.digitalInvoiceUrl ? "📎 Ver/editar URL" : "+ URL factura"}
          </button>
          {!invoice.isPaid && (
            <button onClick={handleVoid} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">Anular factura</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Period Row ───────────────────────────────────────────────────────────────

function PeriodRow({ ps, customerName, accountId, onRefresh }: {
  ps: PeriodSummary;
  customerName: string;
  accountId: string;
  onRefresh: () => void;
}) {
  const [consumosModal, setConsumosModal] = useState(false);
  const [ingresarModal, setIngresarModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState<InvoiceSummary | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editUrlState, setEditUrlState] = useState<{ id: string; url: string | null } | null>(null);

  const inv = ps.invoice;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const isOverdue = inv && !inv.isPaid && inv.estimatedPaymentDate <= today;
  const outstanding = inv ? inv.totalAmountCents - inv.paidAmountCents : 0;

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

  return (
    <>
      <div className={`flex items-start justify-between gap-4 px-4 py-3 border-b last:border-0 ${inv?.isPaid ? "opacity-50" : ""}`}>
        {/* Izquierda: período + consumo */}
        <div className="flex items-center gap-3 min-w-0">
          {ps.isCurrentPeriod && <span className="shrink-0 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Actual</span>}
          <div>
            <div className="text-sm font-medium text-neutral-700">{formatPeriod(ps.period.from, ps.period.to)}</div>
            <div className="text-xs text-neutral-400 mt-0.5">
              {formatArsFromCents(ps.totalConsumptionCents)} · {ps.sales.length} venta{ps.sales.length !== 1 ? "s" : ""}
              {ps.directCharges.length > 0 && (
                <span className="ml-1 text-amber-600">· {ps.directCharges.length} cargo{ps.directCharges.length !== 1 ? "s" : ""} directo{ps.directCharges.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setConsumosModal(true)}
            className="shrink-0 text-xs text-neutral-400 underline hover:text-neutral-600"
          >
            Ver consumos
          </button>
        </div>

        {/* Derecha: estado de facturación */}
        <div className="flex items-center gap-3 shrink-0">
          {!inv ? (
            // Sin factura
            <>
              <span className="text-xs text-neutral-400">Sin factura</span>
              <button
                onClick={() => setIngresarModal(true)}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Ingresar Factura
              </button>
            </>
          ) : (
            // Con factura
            <>
              <div className="text-right">
                {inv.arcaFacturaNumber && (
                  <div className="text-xs font-medium text-neutral-600">{inv.arcaFacturaNumber}</div>
                )}
                <div className="text-xs text-neutral-400">
                  {inv.isPaid ? (
                    <span className="text-green-600 font-medium">Pagada ✓</span>
                  ) : isOverdue ? (
                    <span className="text-red-600 font-medium">Mora · {formatArsFromCents(outstanding)}</span>
                  ) : (
                    <span className="text-amber-600">Vence {formatDate(inv.estimatedPaymentDate)}</span>
                  )}
                </div>
                {!inv.isPaid && inv.paidAmountCents > 0 && (
                  <div className="text-xs text-green-600">Cobrado {formatArsFromCents(inv.paidAmountCents)}</div>
                )}
                {!inv.isPaid && outstanding > 0 && inv.paidAmountCents > 0 && (
                  <div className="text-xs text-neutral-500">Pendiente {formatArsFromCents(outstanding)}</div>
                )}
                {!inv.isPaid && !isOverdue && inv.paidAmountCents === 0 && (
                  <div className="text-xs text-neutral-500">{formatArsFromCents(inv.totalAmountCents)}</div>
                )}
              </div>
              <InvoiceActionMenu
                invoice={inv}
                onOpenPayment={setPaymentModal}
                onOpenDetail={setDetailId}
                onTogglePaid={handleTogglePaid}
                onEditUrl={(id, url) => setEditUrlState({ id, url })}
                onVoid={handleVoid}
              />
            </>
          )}
        </div>
      </div>

      {consumosModal && (
        <ConsumosPreviewModal
          customerName={customerName}
          period={ps.period}
          sales={ps.sales}
          directCharges={ps.directCharges}
          onClose={() => setConsumosModal(false)}
          onRefresh={onRefresh}
        />
      )}
      {ingresarModal && (
        <IngresarFacturaModal
          accountId={accountId}
          customerName={customerName}
          period={ps.period}
          sales={ps.sales}
          directCharges={ps.directCharges}
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

// ─── Periods Table ────────────────────────────────────────────────────────────

function PeriodsTable({ account, onRefresh }: { account: AccountWithBillingState; onRefresh: () => void }) {
  const [showPaid, setShowPaid] = useState(false);

  const activePeriods = account.periods.filter((p) => !p.invoice?.isPaid);
  const paidPeriods = account.periods.filter((p) => p.invoice?.isPaid);

  return (
    <div className="bg-neutral-50 border-t">
      {activePeriods.length === 0 && paidPeriods.length === 0 && (
        <p className="px-6 py-4 text-xs text-neutral-400">Sin actividad en esta cuenta.</p>
      )}
      {activePeriods.map((ps) => (
        <PeriodRow key={ps.period.from.toString()} ps={ps} customerName={account.customerName} accountId={account.id} onRefresh={onRefresh} />
      ))}
      {paidPeriods.length > 0 && (
        <>
          <button
            onClick={() => setShowPaid((v) => !v)}
            className="w-full px-4 py-2 text-xs text-neutral-400 hover:text-neutral-600 text-left border-t"
          >
            {showPaid ? "▲" : "▼"} {paidPeriods.length} período{paidPeriods.length !== 1 ? "s" : ""} pagado{paidPeriods.length !== 1 ? "s" : ""}
          </button>
          {showPaid && paidPeriods.map((ps) => (
            <PeriodRow key={ps.period.from.toString()} ps={ps} customerName={account.customerName} accountId={account.id} onRefresh={onRefresh} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Account Row ──────────────────────────────────────────────────────────────

function AccountRow({ account, expanded, onToggle, onRefresh }: {
  account: AccountWithBillingState;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const hasActivity = account.periods.length > 0;
  const overdueTotal = account.overdueInvoicesTotalCents;
  const totalDebt = account.unbilledTotalCents + account.pendingInvoicesTotalCents + account.overdueInvoicesTotalCents;

  return (
    <>
      <tr
        onClick={hasActivity ? onToggle : undefined}
        className={`border-b transition-colors ${hasActivity ? "cursor-pointer hover:bg-neutral-50" : ""} ${expanded ? "bg-neutral-50" : "bg-white"}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasActivity && <span className="text-neutral-300 text-xs">{expanded ? "▼" : "▶"}</span>}
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
          {account.pendingInvoicesTotalCents > 0
            ? <span className="text-amber-600">{formatArsFromCents(account.pendingInvoicesTotalCents)}</span>
            : <span className="text-neutral-300">—</span>}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {overdueTotal > 0
            ? <span className="font-medium text-red-600">{formatArsFromCents(overdueTotal)}</span>
            : <span className="text-neutral-300">—</span>}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {account.cobradoCents > 0
            ? <span className="text-green-700">{formatArsFromCents(account.cobradoCents)}</span>
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
          <td colSpan={7} className="p-0">
            <PeriodsTable account={account} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function CuentasCorrientesClient({ initialAccounts, role }: { initialAccounts: AccountWithBillingState[]; role: string }) {
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

  const totalUnbilled = accounts.reduce((s, a) => s + a.unbilledTotalCents, 0);
  const totalUnbilledClosed = accounts.reduce((s, a) => s + a.unbilledClosedCents, 0);
  const totalUnbilledOpen = accounts.reduce((s, a) => s + a.unbilledOpenCents, 0);
  const totalAdeudado = accounts.reduce((s, a) => s + a.pendingInvoicesTotalCents, 0);
  const totalDueSoon = accounts.reduce((s, a) => s + a.pendingDueSoonCents, 0);
  const totalDueLater = accounts.reduce((s, a) => s + a.pendingDueLaterCents, 0);
  const totalMora = accounts.reduce((s, a) => s + a.overdueInvoicesTotalCents, 0);
  const totalCobrado = accounts.reduce((s, a) => s + a.cobradoCents, 0);
  const totalRetencionesCobrado = accounts.reduce((s, a) => s + a.retencionesCobradoCents, 0);
  const totalRetenciones = accounts.reduce((s, a) => s + a.totalRetencionesCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas Corrientes</h1>
        <div className="flex items-center gap-3">
          {(role === "GERENCIA" || role === "ADMINISTRATIVO") && (
            <CargosDirectosModal
              accounts={accounts.map((a) => ({ id: a.id, customerName: a.customerName }))}
              onCreated={refresh}
            />
          )}
          <button onClick={refresh} disabled={refreshing} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
            {refreshing ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Sin facturar</div>
          <div className={`text-lg font-bold mt-1 ${totalUnbilled > 0 ? "text-neutral-800" : "text-neutral-400"}`}>{formatArsFromCents(totalUnbilled)}</div>
          {totalUnbilledClosed > 0 && (
            <div className="text-xs text-amber-600 mt-1">Listo para facturar: {formatArsFromCents(totalUnbilledClosed)}</div>
          )}
          {totalUnbilledOpen > 0 && (
            <div className="text-xs text-neutral-400 mt-0.5">Período abierto: {formatArsFromCents(totalUnbilledOpen)}</div>
          )}
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-amber-500 font-medium uppercase tracking-wide">Adeudado</div>
          <div className={`text-lg font-bold mt-1 ${totalAdeudado > 0 ? "text-amber-600" : "text-neutral-400"}`}>{formatArsFromCents(totalAdeudado)}</div>
          {totalDueSoon > 0 && (
            <div className="text-xs text-orange-500 mt-1">Vence esta quincena: {formatArsFromCents(totalDueSoon)}</div>
          )}
          {totalDueLater > 0 && (
            <div className="text-xs text-neutral-400 mt-0.5">Vence prox. quincena: {formatArsFromCents(totalDueLater)}</div>
          )}
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-red-400 font-medium uppercase tracking-wide">En mora</div>
          <div className={`text-lg font-bold mt-1 ${totalMora > 0 ? "text-red-600" : "text-neutral-400"}`}>{formatArsFromCents(totalMora)}</div>
          <div className="text-xs text-neutral-300 mt-0.5">Facturado, vencido</div>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-green-500 font-medium uppercase tracking-wide">Cobrado</div>
          <div className={`text-lg font-bold mt-1 ${totalCobrado > 0 ? "text-green-600" : "text-neutral-400"}`}>{formatArsFromCents(totalCobrado)}</div>
          {totalRetencionesCobrado > 0 && (
            <div className="text-xs text-neutral-400 mt-1">Retenciones: {formatArsFromCents(totalRetencionesCobrado)}</div>
          )}
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="text-xs text-purple-400 font-medium uppercase tracking-wide">Retenciones est.</div>
          <div className={`text-lg font-bold mt-1 ${totalRetenciones > 0 ? "text-purple-600" : "text-neutral-400"}`}>{formatArsFromCents(totalRetenciones)}</div>
          <div className="text-xs text-neutral-300 mt-0.5">Sobre facturas activas</div>
        </div>
      </div>

      {/* Accounts table */}
      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr className="text-xs text-neutral-400 uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-left font-medium">Ciclo</th>
              <th className="px-4 py-2 text-right font-medium">Sin facturar</th>
              <th className="px-4 py-2 text-right font-medium">Adeudado</th>
              <th className="px-4 py-2 text-right font-medium">Mora</th>
              <th className="px-4 py-2 text-right font-medium">Cobrado</th>
              <th className="px-4 py-2 text-right font-medium">Deuda activa</th>
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
