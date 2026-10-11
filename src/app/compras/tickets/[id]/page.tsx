"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatArsFromCents } from "@/lib/money";

type Uom = { id: string; label: string; unit: string; multiplierToBase: string; isDefaultForEntry: boolean };
type InventoryItem = { id: string; name: string; unit: string; displayUnit: string; dimension: string; uoms: Uom[] };
type Supplier = { id: string; name: string };
type CashBox = { id: string; name: string; kind: "EFECTIVO" | "CUENTA_BANCARIA" };
type CreditCard = { id: string; name: string };
type MatchSource = "ALIAS" | "AI" | "MANUAL" | "NONE";

type TicketLine = {
  id: string;
  rawDescription: string;
  qty: string;
  unitRaw: string | null;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  inventoryItemId: string | null;
  uomId: string | null;
  matchSource: MatchSource;
  ignored: boolean;
};

type Ticket = {
  id: string;
  driveFileName: string;
  mimeType: string;
  status: "PENDING_REVIEW" | "CONFIRMED" | "DISCARDED" | "ERROR";
  errorMessage: string | null;
  supplierNameRaw: string | null;
  supplierId: string | null;
  supplierCuit: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
  purchasedAt: string | null;
  totalCents: number | null;
  type: "APROVISIONAMIENTO" | "IN_SITU";
  locationCode: string;
  purchaseId: string | null;
  reviewedAt: string | null;
  reviewedByEmployee: { displayName: string } | null;
  lines: TicketLine[];
};

type Duplicate = { id: string; purchasedAt: string; invoiceNumber: string | null; invoiceTotalCents: number | null };

type FormLine = {
  id: string | null;
  rawDescription: string;
  qty: string;
  unit: string;
  uomId: string;
  inventoryItemId: string;
  unitPriceArs: string;
  ignored: boolean;
  matchSource: MatchSource;
  lineTotalCents: number | null; // importe de la línea según el ticket
};

// Clases de formulario mobile-first: 16px en el celular para que iPhone no haga zoom al tocar un campo
const LABEL = "block text-sm text-neutral-700 sm:text-xs";
const INPUT = "mt-1 w-full rounded-md border bg-white px-3 py-2.5 text-base sm:py-2 sm:text-sm";
const CELL = "w-full rounded-md border bg-white px-2 py-2.5 text-base sm:py-2 sm:text-sm";

const STD_UNITS: Record<string, string[]> = { VOLUME: ["ML", "L"], MASS: ["G", "KG"], COUNT: ["UN"] };

const MATCH_BADGE: Record<MatchSource, { label: string; className: string }> = {
  ALIAS: { label: "Aprendido", className: "bg-green-100 text-green-800" },
  AI: { label: "Sugerido", className: "bg-blue-100 text-blue-800" },
  MANUAL: { label: "Elegido a mano", className: "bg-neutral-100 text-neutral-700" },
  NONE: { label: "Sin vincular", className: "bg-amber-100 text-amber-800" },
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || `Error ${res.status}`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? res.statusText);
  return json as T;
}

function ars(v: string): number {
  return Math.round(Number(v || "0") * 100);
}

function centsToArsInput(c: number | null): string {
  return c == null ? "" : (c / 100).toFixed(2);
}

/** Unidad inicial de una línea: la presentación si hay, si no la que leyó el ticket si es compatible, si no la del insumo. */
function initialUnit(item: InventoryItem | undefined, unitRaw: string | null, uomId: string | null) {
  if (!item) return { unit: unitRaw ?? "UN", uomId: "" };
  if (uomId && item.uoms.some((u) => u.id === uomId)) {
    return { unit: item.uoms.find((u) => u.id === uomId)!.unit, uomId };
  }
  if (unitRaw && (STD_UNITS[item.dimension] ?? ["UN"]).includes(unitRaw)) return { unit: unitRaw, uomId: "" };
  return { unit: item.unit, uomId: "" };
}

export default function TicketReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);

  const [form, setForm] = useState({
    supplierId: "",
    invoiceNumber: "",
    invoiceTotalArs: "",
    purchasedAt: new Date().toISOString().slice(0, 10),
    type: "IN_SITU" as "APROVISIONAMIENTO" | "IN_SITU",
    locationCode: "BACONA" as "BACONA" | "SALTA" | "EN_TRANSITO",
    paymentMode: "PENDING" as "PENDING" | "PAID_NOW",
    paymentMethod: "EFECTIVO_CAJA" as "EFECTIVO_CAJA" | "TRANSFERENCIA" | "TARJETA_CREDITO",
    cashBoxId: "",
    creditCardId: "",
    installments: "1",
    skipCashImpact: false,
  });
  const [lines, setLines] = useState<FormLine[]>([]);

  async function load() {
    const [t, it, sup, cb, cbBanco, cc] = await Promise.all([
      apiGet<{ ticket: Ticket; possibleDuplicates: Duplicate[] }>(`/api/compras/tickets/${id}`),
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
      apiGet<{ items: Supplier[] }>("/api/proveedores"),
      apiGet<{ items: CashBox[] }>("/api/egresos/cuentas?kind=EFECTIVO").catch(() => ({ items: [] })),
      apiGet<{ items: CashBox[] }>("/api/egresos/cuentas?kind=CUENTA_BANCARIA").catch(() => ({ items: [] })),
      apiGet<{ items: CreditCard[] }>("/api/egresos/tarjetas").catch(() => ({ items: [] })),
    ]);
    setTicket(t.ticket);
    setDuplicates(t.possibleDuplicates);
    setItems(it.items);
    setSuppliers(sup.items);
    setCashBoxes([...cb.items, ...cbBanco.items]);
    setCreditCards(cc.items);

    const tk = t.ticket;
    setForm((p) => ({
      ...p,
      supplierId: tk.supplierId ?? "",
      invoiceNumber: tk.invoiceNumber ?? "",
      invoiceTotalArs: centsToArsInput(tk.totalCents),
      purchasedAt: tk.purchasedAt ? tk.purchasedAt.slice(0, 10) : p.purchasedAt,
      type: tk.type,
      locationCode: (tk.locationCode as typeof p.locationCode) ?? "BACONA",
    }));
    setLines(
      tk.lines.map((l) => {
        const item = it.items.find((i) => i.id === l.inventoryItemId);
        const { unit, uomId } = initialUnit(item, l.unitRaw, l.uomId);
        return {
          id: l.id,
          rawDescription: l.rawDescription,
          qty: String(Number(l.qty)),
          unit,
          uomId,
          inventoryItemId: item ? item.id : "",
          unitPriceArs: centsToArsInput(l.unitPriceCents),
          lineTotalCents: l.lineTotalCents,
          ignored: l.ignored,
          matchSource: l.matchSource,
        };
      }),
    );
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateLine(idx: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function onItemChange(idx: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    const current = lines[idx]!;
    let unit = item?.unit ?? "UN";
    let uomId = "";
    const defaultUom = item?.uoms.find((u) => u.isDefaultForEntry);
    if (item && !current.uomId && (STD_UNITS[item.dimension] ?? ["UN"]).includes(current.unit)) {
      unit = current.unit; // la unidad que se leyó del ticket sigue sirviendo
    } else if (defaultUom) {
      unit = defaultUom.unit;
      uomId = defaultUom.id;
    }
    updateLine(idx, { inventoryItemId: itemId, unit, uomId, matchSource: "MANUAL" });
  }

  function unitOptions(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return [];
    return [
      ...(STD_UNITS[item.dimension] ?? ["UN"]).map((u) => ({ value: `unit:${u}`, label: u })),
      ...item.uoms.map((u) => ({ value: `uom:${u.id}`, label: `${u.label} (${u.multiplierToBase} ${item.unit})` })),
    ];
  }

  function onUnitChange(idx: number, value: string) {
    if (value.startsWith("uom:")) {
      const uomId = value.slice(4);
      const item = items.find((i) => i.id === lines[idx]!.inventoryItemId);
      updateLine(idx, { uomId, unit: item?.uoms.find((u) => u.id === uomId)?.unit ?? "" });
    } else {
      updateLine(idx, { unit: value.slice(5), uomId: "" });
    }
  }

  const activeLines = lines.filter((l) => !l.ignored);
  // La suma incluye las líneas que no van al stock (bolsas, etc.): también están en el total del ticket.
  // Importe de cada línea: el del ticket si lo trae (no depende de la unidad elegida, ej. kg → g), si no cantidad × precio.
  const lineAmountCents = (l: FormLine) => l.lineTotalCents ?? Math.round(ars(l.unitPriceArs) * Number(l.qty || 0));
  const linesSumCents = lines.reduce((acc, l) => acc + lineAmountCents(l), 0);
  const totalCents = ars(form.invoiceTotalArs);
  const allPriced = lines.length > 0 && lines.every((l) => l.lineTotalCents != null || l.unitPriceArs);
  const sumMismatch = allPriced && totalCents > 0 && Math.abs(linesSumCents - totalCents) > Math.max(100, totalCents * 0.01);

  const missingItems = activeLines.filter((l) => !l.inventoryItemId).length;
  const canConfirm = useMemo(() => {
    if (!form.supplierId || totalCents <= 0) return false;
    if (!activeLines.length) return false;
    if (form.paymentMode === "PAID_NOW") {
      if (form.paymentMethod === "TARJETA_CREDITO" ? !form.creditCardId : !form.cashBoxId) return false;
    }
    return activeLines.every((l) => l.inventoryItemId && Number(l.qty) > 0);
  }, [form, totalCents, activeLines]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/compras/tickets/${id}/confirm`, {
        supplierId: form.supplierId,
        invoiceNumber: form.invoiceNumber || null,
        invoiceTotalCents: totalCents,
        purchasedAt: new Date(form.purchasedAt + "T12:00:00.000Z").toISOString(),
        type: form.type,
        locationCode: form.locationCode,
        payment:
          form.paymentMode === "PENDING"
            ? { mode: "PENDING" }
            : {
                mode: "PAID_NOW",
                method: form.paymentMethod,
                cashBoxId: form.paymentMethod !== "TARJETA_CREDITO" ? form.cashBoxId || null : null,
                creditCardId: form.paymentMethod === "TARJETA_CREDITO" ? form.creditCardId || null : null,
                installments: form.paymentMethod === "TARJETA_CREDITO" ? Number(form.installments) || 1 : undefined,
                skipCashImpact: form.paymentMethod !== "TARJETA_CREDITO" ? form.skipCashImpact : undefined,
              },
        lines: lines.map((l) => ({
          id: l.id,
          rawDescription: l.rawDescription,
          qty: Number(l.qty),
          unit: l.uomId ? null : l.unit || null,
          uomId: l.uomId || null,
          inventoryItemId: l.inventoryItemId || null,
          // Costo por unidad cargada: si se cambió la unidad (ej. kg → g) el precio del ticket ya no aplica
          unitPriceCents:
            l.lineTotalCents != null && Number(l.qty) > 0
              ? Math.round(l.lineTotalCents / Number(l.qty))
              : l.unitPriceArs ? ars(l.unitPriceArs) : null,
          ignored: l.ignored,
        })),
      });
      router.push("/compras/tickets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  async function createSupplier() {
    const name = window.prompt("Nombre del proveedor nuevo:", ticket?.supplierNameRaw ?? "")?.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 403) throw new Error("Solo Gerencia puede crear proveedores nuevos.");
      const created = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
      if (!res.ok || !created.id) throw new Error("No se pudo crear el proveedor.");
      setSuppliers((prev) => [...prev, { id: created.id!, name: created.name ?? name }].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((p) => ({ ...p, supplierId: created.id! }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function simpleAction(action: "discard" | "reprocess") {
    if (action === "discard" && !window.confirm("¿Descartar este ticket? No se va a cargar nada al stock.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/compras/tickets/${id}/${action}`);
      if (action === "discard") router.push("/compras/tickets");
      else {
        await load();
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  if (!ticket) {
    return (
      <div className="space-y-3">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
        <div className="text-sm text-neutral-600">Cargando ticket…</div>
      </div>
    );
  }

  const editable = ticket.status === "PENDING_REVIEW";
  const isPdf = ticket.mimeType === "application/pdf";
  const docUrl = `/api/compras/tickets/${id}/image`;
  const note = editable ? ticket.errorMessage : null;

  return (
    <div className={`space-y-3 ${editable ? "pb-32 lg:pb-0" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-semibold">Revisar ticket</div>
          <div className="truncate text-sm text-neutral-600">{ticket.driveFileName}</div>
        </div>
        <Link href="/compras/tickets" className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
          Volver
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {ticket.status === "CONFIRMED" ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Cargado al stock{ticket.reviewedByEmployee ? ` por ${ticket.reviewedByEmployee.displayName}` : ""}
          {ticket.reviewedAt ? ` el ${new Date(ticket.reviewedAt).toLocaleString("es-AR")}` : ""}.{" "}
          <Link href="/compras" className="underline">Ver en compras</Link>
        </div>
      ) : null}
      {ticket.status === "DISCARDED" ? (
        <div className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-700">Este ticket fue descartado.</div>
      ) : null}
      {ticket.status === "ERROR" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div>No se pudo leer este ticket: {ticket.errorMessage ?? "error desconocido"}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button type="button" disabled={busy} onClick={() => simpleAction("reprocess")}
              className="rounded-md border border-red-300 bg-white px-3 py-2.5 text-sm hover:bg-red-50">
              {busy ? "Leyendo…" : "Volver a leer"}
            </button>
            <button type="button" disabled={busy} onClick={() => simpleAction("discard")}
              className="rounded-md border border-red-300 bg-white px-3 py-2.5 text-sm hover:bg-red-50">
              Descartar
            </button>
          </div>
        </div>
      ) : null}
      {note ? (
        <button type="button" onClick={() => setNoteOpen((v) => !v)}
          className="block w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800">
          <span className={noteOpen ? "" : "line-clamp-2"}>
            <b>Nota de lectura:</b> {note}
          </span>
          <span className="mt-1 block text-xs font-medium underline">{noteOpen ? "Ver menos" : "Ver nota completa"}</span>
        </button>
      ) : null}
      {editable && duplicates.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <b>Ojo, puede estar repetido.</b> Ya hay compras de este proveedor parecidas:{" "}
          {duplicates
            .map(
              (d) =>
                `${new Date(d.purchasedAt).toLocaleDateString("es-AR", { timeZone: "UTC" })}` +
                (d.invoiceNumber ? ` n° ${d.invoiceNumber}` : "") +
                (d.invoiceTotalCents ? ` ${formatArsFromCents(d.invoiceTotalCents)}` : ""),
            )
            .join(" · ")}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-4">
        {/* Comprobante. En el celular: tarjeta chica que abre el visor del teléfono (Android no muestra PDFs embebidos). */}
        <div className="rounded-lg border bg-white p-3 lg:sticky lg:top-2 lg:self-start lg:p-2">
          <div className="flex items-center justify-between gap-2 lg:hidden">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">Comprobante</div>
              {ticket.invoiceType || ticket.supplierCuit ? (
                <div className="truncate text-xs text-neutral-500">
                  {ticket.invoiceType ? `Factura ${ticket.invoiceType}` : ""}
                  {ticket.supplierCuit ? ` · CUIT ${ticket.supplierCuit}` : ""}
                </div>
              ) : null}
            </div>
            <a href={docUrl} target="_blank" rel="noreferrer"
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white">
              Ver comprobante
            </a>
          </div>
          {!isPdf ? (
            <a href={docUrl} target="_blank" rel="noreferrer" title="Abrir en grande" className="mt-3 block lg:mt-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={docUrl} alt="Foto del ticket" className="max-h-56 w-full rounded object-contain lg:max-h-[75vh]" />
            </a>
          ) : (
            <iframe src={docUrl} className="hidden h-[75vh] w-full rounded lg:block" title="Ticket" />
          )}
          {ticket.invoiceType || ticket.supplierCuit ? (
            <div className="mt-2 hidden px-1 text-xs text-neutral-500 lg:block">
              {ticket.invoiceType ? `Comprobante: ${ticket.invoiceType}` : ""}
              {ticket.supplierCuit ? ` · CUIT ${ticket.supplierCuit}` : ""}
            </div>
          ) : null}
        </div>

        <fieldset disabled={!editable || busy} className="min-w-0 space-y-3">
          <div className="rounded-lg border bg-white p-3">
            <div className="text-base font-semibold sm:text-sm">Datos de la compra</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Proveedor
                <select className={INPUT} value={form.supplierId}
                  onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))}>
                  <option value="">— Elegir proveedor —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  {ticket.supplierNameRaw ? <span>En el ticket dice: {ticket.supplierNameRaw}</span> : null}
                  {editable ? (
                    <button type="button" onClick={createSupplier} className="py-1 text-blue-700 underline">
                      + Nuevo proveedor
                    </button>
                  ) : null}
                </span>
              </label>
              <label className={LABEL}>
                N° de factura o ticket
                <input className={INPUT} value={form.invoiceNumber}
                  onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <label className={LABEL}>
                  Fecha
                  <input type="date" className={INPUT} value={form.purchasedAt}
                    onChange={(e) => setForm((p) => ({ ...p, purchasedAt: e.target.value }))} />
                </label>
                <label className={LABEL}>
                  Total ($)
                  <input type="number" inputMode="decimal" min={0} step="0.01" className={INPUT}
                    value={form.invoiceTotalArs} onChange={(e) => setForm((p) => ({ ...p, invoiceTotalArs: e.target.value }))} />
                </label>
              </div>
              <label className={LABEL}>
                Tipo de compra
                <select className={INPUT} value={form.type}
                  onChange={(e) => {
                    const type = e.target.value as "APROVISIONAMIENTO" | "IN_SITU";
                    setForm((p) => ({ ...p, type, locationCode: type === "APROVISIONAMIENTO" ? "SALTA" : "BACONA" }));
                  }}>
                  <option value="IN_SITU">Compra en el local (San Antonio)</option>
                  <option value="APROVISIONAMIENTO">Aprovisionamiento (Salta)</option>
                </select>
              </label>
              <label className={LABEL}>
                ¿Dónde entra la mercadería?
                <select className={INPUT} value={form.locationCode}
                  onChange={(e) => setForm((p) => ({ ...p, locationCode: e.target.value as typeof p.locationCode }))}>
                  <option value="BACONA">Bacoña</option>
                  <option value="SALTA">Salta</option>
                  <option value="EN_TRANSITO">En tránsito</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold sm:text-sm">Productos ({lines.length})</div>
              {editable && missingItems ? (
                <div className="text-sm text-amber-700 sm:text-xs">Faltan {missingItems} por vincular</div>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-neutral-500 sm:text-xs">
              Elegí a qué insumo del stock corresponde cada producto. Lo que corrijas se recuerda para el próximo ticket de este proveedor.
              Usá &quot;No va al stock&quot; para bolsas, descuentos o cosas que no se controlan.
            </div>

            <div className="mt-3 space-y-3">
              {lines.map((l, idx) => {
                const badge = l.inventoryItemId ? MATCH_BADGE[l.matchSource] : MATCH_BADGE.NONE;
                return (
                  <div key={l.id ?? `new-${idx}`}
                    className={`rounded-md border p-3 sm:p-2 ${l.ignored ? "bg-neutral-50" : l.inventoryItemId ? "" : "border-amber-300"}`}>
                    {l.id ? (
                      <div className={`break-words px-1 text-base font-medium sm:text-sm ${l.ignored ? "text-neutral-500 line-through" : ""}`}>
                        {l.rawDescription}
                      </div>
                    ) : (
                      <input
                        className="w-full rounded border px-2 py-1.5 text-base font-medium sm:py-1 sm:text-sm"
                        value={l.rawDescription}
                        onChange={(e) => updateLine(idx, { rawDescription: e.target.value })}
                        aria-label="Nombre del producto agregado"
                      />
                    )}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {!l.ignored ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
                      ) : (
                        <span className="text-xs text-neutral-500">No se carga al stock</span>
                      )}
                      <button type="button" onClick={() => updateLine(idx, { ignored: !l.ignored })}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${l.ignored ? "border-neutral-900 bg-neutral-900 text-white" : "text-neutral-700"}`}>
                        {l.ignored ? "Volver a incluir" : "No va al stock"}
                      </button>
                    </div>
                    {!l.ignored ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_150px_110px]">
                        <select className={`col-span-2 sm:col-span-1 ${CELL} ${l.inventoryItemId ? "" : "border-amber-400"}`}
                          value={l.inventoryItemId} onChange={(e) => onItemChange(idx, e.target.value)} aria-label="Insumo">
                          <option value="">— Elegir insumo —</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.displayUnit})</option>)}
                        </select>
                        <input type="number" inputMode="decimal" min={0} step="0.001" className={CELL}
                          value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} aria-label="Cantidad" />
                        <select className={CELL} disabled={!l.inventoryItemId} aria-label="Unidad"
                          value={l.uomId ? `uom:${l.uomId}` : `unit:${l.unit}`} onChange={(e) => onUnitChange(idx, e.target.value)}>
                          {unitOptions(l.inventoryItemId).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input type="number" inputMode="decimal" min={0} step="0.01" className={`col-span-2 sm:col-span-1 ${CELL}`}
                          placeholder="Precio unitario $" value={l.unitPriceArs} aria-label="Precio unitario ($)"
                          onChange={(e) => updateLine(idx, { unitPriceArs: e.target.value })} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {editable ? (
              <button type="button" className="mt-3 w-full rounded-md border px-3 py-2.5 text-sm hover:bg-neutral-50 sm:w-auto sm:py-2"
                onClick={() => setLines((p) => [...p, {
                  id: null, rawDescription: "Producto agregado", qty: "1", unit: "UN", uomId: "",
                  inventoryItemId: "", unitPriceArs: "", ignored: false, matchSource: "MANUAL", lineTotalCents: null,
                }])}>
                + Agregar producto
              </button>
            ) : null}

            {allPriced ? (
              <div className={`mt-3 text-sm sm:text-xs ${sumMismatch ? "text-amber-700" : "text-neutral-500"}`}>
                Suma de productos: {formatArsFromCents(linesSumCents)}
                {sumMismatch
                  ? ticket.invoiceType === "A"
                    ? ` — el total del ticket es ${formatArsFromCents(totalCents)}. En facturas A es normal: los productos suelen figurar sin IVA y el total suma IVA y percepciones.`
                    : ` — no coincide con el total del ticket (${formatArsFromCents(totalCents)}). Revisá cantidades y precios.`
                  : ""}
              </div>
            ) : null}
          </div>

          {editable ? (
            <div className="rounded-lg border bg-white p-3">
              <div className="text-base font-semibold sm:text-sm">¿Cómo se pagó?</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
                {([["PENDING", "Queda pendiente"], ["PAID_NOW", "Ya se pagó"]] as const).map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => setForm((p) => ({ ...p, paymentMode: mode }))}
                    className={`rounded-md border px-3 py-2.5 text-sm sm:py-2 ${form.paymentMode === mode ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {form.paymentMode === "PAID_NOW" ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <select className={CELL} value={form.paymentMethod} aria-label="Medio de pago"
                    onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as typeof p.paymentMethod, cashBoxId: "", creditCardId: "" }))}>
                    <option value="EFECTIVO_CAJA">Efectivo de caja</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="TARJETA_CREDITO">Tarjeta de crédito</option>
                  </select>
                  {form.paymentMethod !== "TARJETA_CREDITO" ? (
                    <select className={CELL} value={form.cashBoxId} aria-label="Caja o cuenta"
                      onChange={(e) => setForm((p) => ({ ...p, cashBoxId: e.target.value }))}>
                      <option value="">Elegir caja/cuenta…</option>
                      {cashBoxes
                        .filter((b) => (form.paymentMethod === "EFECTIVO_CAJA" ? b.kind === "EFECTIVO" : b.kind === "CUENTA_BANCARIA"))
                        .map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <div className="grid grid-cols-[1fr_90px] gap-2 sm:contents">
                      <select className={CELL} value={form.creditCardId} aria-label="Tarjeta"
                        onChange={(e) => setForm((p) => ({ ...p, creditCardId: e.target.value }))}>
                        <option value="">Elegir tarjeta…</option>
                        {creditCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="number" inputMode="numeric" min={1} max={24} className={CELL} placeholder="Cuotas" aria-label="Cuotas"
                        value={form.installments} onChange={(e) => setForm((p) => ({ ...p, installments: e.target.value }))} />
                    </div>
                  )}
                </div>
              ) : null}
              {form.paymentMode === "PAID_NOW" && form.paymentMethod !== "TARJETA_CREDITO" ? (
                <label className="mt-3 flex items-start gap-3 rounded-md border p-3 text-sm text-neutral-700 sm:gap-2 sm:p-2 sm:text-xs">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 sm:h-4 sm:w-4" checked={form.skipCashImpact}
                    onChange={(e) => setForm((p) => ({ ...p, skipCashImpact: e.target.checked }))} />
                  <span>
                    <b>La plata ya se descontó</b> de esta caja o cuenta (no volver a descontarla). Usalo cuando el pago
                    ya está registrado en el saldo, por ejemplo una transferencia que ya figura en los movimientos de la cuenta.
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          {editable ? (
            <div className="flex justify-center lg:justify-end">
              <button type="button" onClick={() => simpleAction("discard")}
                className="w-full rounded-md border px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 sm:w-auto sm:py-2">
                Descartar ticket
              </button>
            </div>
          ) : null}
        </fieldset>
      </div>

      {/* Barra de confirmación: fija abajo en el celular, al final del formulario en la compu */}
      {editable ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mx-auto flex max-w-screen-lg flex-col gap-2 lg:items-end">
            {!canConfirm ? (
              <div className="text-center text-xs text-neutral-600 lg:text-right">
                {missingItems
                  ? `Faltan ${missingItems} producto${missingItems === 1 ? "" : "s"} por vincular`
                  : !form.supplierId
                    ? "Falta elegir el proveedor"
                    : totalCents <= 0
                      ? "Falta el total del ticket"
                      : form.paymentMode === "PAID_NOW"
                        ? "Falta elegir con qué se pagó"
                        : "Revisá los datos"}
              </div>
            ) : null}
            <button type="button" onClick={confirm} disabled={!canConfirm || busy}
              className={`w-full rounded-md px-4 py-3 text-base font-medium lg:w-auto lg:py-2 lg:text-sm ${canConfirm && !busy
                ? "bg-neutral-900 text-white"
                : "bg-neutral-200 text-neutral-500"}`}>
              {busy ? "Cargando…" : "Confirmar y cargar al stock"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
