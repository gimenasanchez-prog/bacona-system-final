"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Eye, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { formatArsFromCents } from "@/lib/money";
import { formatBusinessDate } from "@/lib/dates";
import { saveComercialBatchAction } from "@/modules/ventas_comerciales/actions/comercialSaleActions";
import { NuevaCuentaModal } from "@/app/cuentas-corrientes/NuevaCuentaModal";
import { printComercialBatchPreview } from "@/modules/ventas_comerciales/lib/printPreview";

function LineField({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-[70px]">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={emphasis ? "text-sm font-semibold text-neutral-800" : "text-sm text-neutral-700"}>{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  title,
  onClick,
  children,
  variant = "default",
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded border p-1.5 ${
        variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

type LineStatus = "PENDIENTE" | "ENTREGADA" | "CANCELADA";

type BatchLine = {
  id: string;
  status: LineStatus;
  deliveryDate: string | Date;
  clienteLabel: string;
  tipoVianda: string;
  cant: number;
  horarioRetiro: string;
  unitPriceCents: number;
  formaDePagoPlanificada: string | null;
  viandasCobradasPlanned: number;
  detalleComanda: string | null;
  facturacionRazonSocial: string | null;
  facturacionCuit: string | null;
  facturacionNotas: string | null;
  products: { id: string }[];
};

type BillingClient = { id: string; razonSocial: string; cuit: string | null };

function findBillingClientCuit(razonSocial: string, billingClients: BillingClient[]): string | null {
  const name = razonSocial.trim().toLowerCase();
  if (!name) return null;
  const match = billingClients.find((c) => c.razonSocial.trim().toLowerCase() === name);
  return match?.cuit ?? null;
}

type Batch = {
  id: string;
  notes: string | null;
  createdAt: string | Date;
  cuentaCorrienteAccount: { customer: { displayName: string } } | null;
  lines: BatchLine[];
};

type Account = {
  id: string;
  customerName: string;
  razonSocial: string | null;
  cuit: string | null;
  ivaCondition: string | null;
  address: string | null;
};

const STATUS_LABELS: Record<LineStatus, string> = {
  PENDIENTE: "Pendiente",
  ENTREGADA: "Entregada",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<LineStatus, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  ENTREGADA: "bg-green-100 text-green-700",
  CANCELADA: "bg-red-100 text-red-700",
};

function toDateInputValue(d: string | Date) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatDate(d: string | Date) {
  return formatBusinessDate(d);
}

type LineDraft = {
  deliveryDate: string;
  clienteLabel: string;
  tipoVianda: string;
  cant: string;
  horarioRetiro: string;
  unitPriceArs: string;
  formaDePagoPlanificada: string;
  viandasCobradasPlanned: string;
  detalleComanda: string;
  facturacionRazonSocial: string;
  facturacionCuit: string;
  facturacionNotas: string;
};

function emptyLine(clienteLabel: string): LineDraft {
  return {
    deliveryDate: "",
    clienteLabel,
    tipoVianda: "",
    cant: "1",
    horarioRetiro: "",
    unitPriceArs: "",
    formaDePagoPlanificada: "",
    viandasCobradasPlanned: "1",
    detalleComanda: "",
    facturacionRazonSocial: "",
    facturacionCuit: "",
    facturacionNotas: "",
  };
}

export default function VentasComercialesClient({ initialBatches, role }: { initialBatches: Batch[]; role: string }) {
  const canEdit = role === "GERENCIA" || role === "COMERCIAL";
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [view, setView] = useState<"list" | "form">("list");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ batchId: string; lineId: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ batchId: string; lineId: string } | null>(null);
  const [addLineBatchId, setAddLineBatchId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine("")]);
  const [billingClients, setBillingClients] = useState<BillingClient[]>([]);

  const refreshBatches = useCallback(async () => {
    const res = await fetch("/api/ventas-comerciales");
    if (res.ok) setBatches(await res.json());
  }, []);

  const refreshAccounts = useCallback(async () => {
    const res = await fetch("/api/ventas-comerciales/accounts");
    if (res.ok) setAccounts(await res.json());
  }, []);

  const refreshBillingClients = useCallback(async () => {
    const res = await fetch("/api/ventas-comerciales/billing-clients");
    if (res.ok) setBillingClients(await res.json());
  }, []);

  async function handleDeleteLine(lineId: string) {
    setListError(null);
    if (!window.confirm("¿Eliminar esta línea del cierre?")) return;
    try {
      const res = await fetch(`/api/ventas-comerciales/lines/${lineId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Error al eliminar la línea.");
      await refreshBatches();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Error al eliminar la línea.");
    }
  }

  const handleAccountCreated = useCallback(
    async (createdId?: string) => {
      await refreshAccounts();
      if (createdId) setAccountId(createdId);
    },
    [refreshAccounts]
  );

  useEffect(() => {
    refreshAccounts();
    refreshBillingClients();
  }, [refreshAccounts, refreshBillingClients]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  function resetForm() {
    setAccountId("");
    setNotes("");
    setLines([emptyLine("")]);
    setError(null);
  }

  function openNewForm() {
    resetForm();
    setView("form");
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(selectedAccount?.customerName ?? "")]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  useEffect(() => {
    if (!selectedAccount) return;
    setLines((prev) => prev.map((l) => (l.clienteLabel ? l : { ...l, clienteLabel: selectedAccount.customerName })));
  }, [selectedAccount]);

  function parsedLines() {
    return lines.map((l) => ({
      deliveryDate: l.deliveryDate,
      clienteLabel: l.clienteLabel.trim(),
      tipoVianda: l.tipoVianda.trim(),
      cant: parseInt(l.cant, 10) || 0,
      horarioRetiro: l.horarioRetiro.trim(),
      unitPriceCents: Math.round((parseFloat(l.unitPriceArs) || 0) * 100),
      formaDePagoPlanificada: l.formaDePagoPlanificada.trim(),
      viandasCobradasPlanned: parseInt(l.viandasCobradasPlanned, 10) || 0,
      detalleComanda: l.detalleComanda.trim(),
      facturacionRazonSocial: l.facturacionRazonSocial.trim(),
      facturacionCuit: l.facturacionCuit.trim(),
      facturacionNotas: l.facturacionNotas.trim(),
    }));
  }

  const totalCents = parsedLines().reduce((sum, l) => sum + l.unitPriceCents * l.viandasCobradasPlanned, 0);

  function buildFormData(): FormData | null {
    const parsed = parsedLines();
    for (const l of parsed) {
      if (!l.deliveryDate) {
        setError("Completá el día de entrega en todas las filas.");
        return null;
      }
      if (!l.clienteLabel || !l.tipoVianda || !l.horarioRetiro) {
        setError("Completá cliente, tipo de vianda y horario en todas las filas.");
        return null;
      }
      if (l.cant < 1) {
        setError("La cantidad debe ser mayor a cero en todas las filas.");
        return null;
      }
    }

    const fd = new FormData();
    if (accountId) fd.set("cuentaCorrienteAccountId", accountId);
    fd.set("notes", notes);
    fd.set("linesJson", JSON.stringify(parsed));
    return fd;
  }

  function handlePreview() {
    setError(null);
    const parsed = parsedLines();
    printComercialBatchPreview({
      account: selectedAccount
        ? {
            customerName: selectedAccount.customerName,
            razonSocial: selectedAccount.razonSocial,
            cuit: selectedAccount.cuit,
            ivaCondition: selectedAccount.ivaCondition,
            address: selectedAccount.address,
          }
        : null,
      lines: parsed,
    });
  }

  async function handleSave() {
    const fd = buildFormData();
    if (!fd) return;
    setPending(true);
    setError(null);
    const result = await saveComercialBatchAction({ error: null, batchId: null }, fd);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await refreshBatches();
    await refreshBillingClients();
    setView("list");
  }

  return (
    <div className="space-y-4">
      <datalist id="billing-clients-datalist">
        {billingClients.map((c) => (
          <option key={c.id} value={c.razonSocial} />
        ))}
      </datalist>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ventas Comerciales</h1>
        {view === "list" && canEdit && (
          <button
            type="button"
            onClick={openNewForm}
            className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Nuevo cierre comercial
          </button>
        )}
      </div>

      {view === "list" && (
        <div className="space-y-3">
          {listError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {listError}
            </div>
          )}
          {batches.length === 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
              Todavía no hay cierres comerciales cargados.
            </div>
          )}
          {batches.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2">
                <div>
                  <div className="text-sm font-medium">
                    {b.cuentaCorrienteAccount?.customer.displayName ?? "Sin cuenta corriente asociada"}
                  </div>
                  {b.notes && <div className="text-xs text-neutral-500">{b.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-neutral-400">{formatDate(b.createdAt)}</div>
                  {canEdit && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                      onClick={() => setAddLineBatchId(b.id)}
                    >
                      <Plus size={13} /> Agregar línea
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-neutral-100">
                {b.lines.map((l) => (
                  <div key={l.id} className="p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">
                        <LineField label="Día" value={formatDate(l.deliveryDate)} />
                        <LineField label="Cliente" value={l.clienteLabel} />
                        <LineField label="Vianda" value={l.tipoVianda} />
                        <LineField label="Cant." value={String(l.cant)} />
                        <LineField label="Horario" value={l.horarioRetiro} />
                        <LineField label="Precio unit." value={formatArsFromCents(l.unitPriceCents)} />
                        <LineField label="Forma de pago" value={l.formaDePagoPlanificada || "—"} />
                        <LineField label="Cobradas" value={String(l.viandasCobradasPlanned)} />
                        <LineField
                          label="Total"
                          value={formatArsFromCents(l.unitPriceCents * l.viandasCobradasPlanned)}
                          emphasis
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status]}`}>
                          {STATUS_LABELS[l.status]}
                        </span>
                        <IconButton title="Ver detalle" onClick={() => setDetailTarget({ batchId: b.id, lineId: l.id })}>
                          <Eye size={14} />
                        </IconButton>
                        {canEdit && l.status === "PENDIENTE" && (
                          <>
                            <IconButton title="Editar" onClick={() => setEditTarget({ batchId: b.id, lineId: l.id })}>
                              <Pencil size={14} />
                            </IconButton>
                            <IconButton title="Eliminar" variant="danger" onClick={() => handleDeleteLine(l.id)}>
                              <Trash2 size={14} />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </div>
                    {l.detalleComanda && (
                      <div className="mt-2 text-xs text-neutral-500">
                        <span className="text-neutral-400">Detalle: </span>
                        {l.detalleComanda}
                      </div>
                    )}
                    {(l.facturacionRazonSocial || l.facturacionCuit || l.facturacionNotas) && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded bg-neutral-50 px-2 py-1.5">
                        <LineField label="Facturar a" value={l.facturacionRazonSocial || "—"} />
                        <LineField label="CUIT" value={l.facturacionCuit || "—"} />
                        {l.facturacionNotas && <LineField label="Notas fact." value={l.facturacionNotas} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "form" && (
        <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Nuevo cierre comercial</div>
            <button
              type="button"
              onClick={() => setView("list")}
              className="rounded-md border px-2 py-1 text-sm text-neutral-500"
            >
              Cancelar
            </button>
          </div>

          <div className="space-y-3 rounded-md border border-neutral-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Cliente</div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="block text-xs font-medium">
                  Cuenta corriente <span className="text-neutral-400">(opcional si se cobra en el momento)</span>
                </label>
                <select
                  value={accountId}
                  onChange={(ev) => setAccountId(ev.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— Sin cuenta corriente —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.customerName}
                    </option>
                  ))}
                </select>
              </div>
              <NuevaCuentaModal onCreated={handleAccountCreated} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium">Notas <span className="text-neutral-400">(opcional)</span></label>
              <input
                type="text"
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ej: Coordinado con Juan de EfeBus"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Líneas de entrega</div>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <Plus size={13} /> Agregar línea
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-md border border-neutral-200 p-2">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-4">
                      <FormField label="Día">
                        <input
                          type="date"
                          value={l.deliveryDate}
                          onChange={(ev) => updateLine(i, { deliveryDate: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Cliente">
                        <input
                          type="text"
                          value={l.clienteLabel}
                          onChange={(ev) => updateLine(i, { clienteLabel: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Tipo vianda">
                        <input
                          type="text"
                          value={l.tipoVianda}
                          onChange={(ev) => updateLine(i, { tipoVianda: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                          placeholder="ALMUERZO"
                        />
                      </FormField>
                      <FormField label="Cant.">
                        <input
                          type="number"
                          min={1}
                          value={l.cant}
                          onChange={(ev) => updateLine(i, { cant: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Horario">
                        <input
                          type="text"
                          value={l.horarioRetiro}
                          onChange={(ev) => updateLine(i, { horarioRetiro: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                          placeholder="12:00"
                        />
                      </FormField>
                      <FormField label="Precio $">
                        <input
                          type="number"
                          min={0}
                          value={l.unitPriceArs}
                          onChange={(ev) => updateLine(i, { unitPriceArs: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Forma de pago">
                        <input
                          type="text"
                          value={l.formaDePagoPlanificada}
                          onChange={(ev) => updateLine(i, { formaDePagoPlanificada: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                          placeholder="transferencia"
                        />
                      </FormField>
                      <FormField label="Cobradas">
                        <input
                          type="number"
                          min={0}
                          value={l.viandasCobradasPlanned}
                          onChange={(ev) => updateLine(i, { viandasCobradasPlanned: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Detalle">
                        <input
                          type="text"
                          value={l.detalleComanda}
                          onChange={(ev) => updateLine(i, { detalleComanda: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                      <FormField label="Facturar a">
                        <input
                          type="text"
                          list="billing-clients-datalist"
                          value={l.facturacionRazonSocial}
                          onChange={(ev) => updateLine(i, { facturacionRazonSocial: ev.target.value })}
                          onBlur={() => {
                            if (l.facturacionCuit.trim()) return;
                            const cuit = findBillingClientCuit(l.facturacionRazonSocial, billingClients);
                            if (cuit) updateLine(i, { facturacionCuit: cuit });
                          }}
                          className="w-full rounded border px-1.5 py-1"
                          placeholder="Razón social"
                        />
                      </FormField>
                      <FormField label="CUIT">
                        <input
                          type="text"
                          value={l.facturacionCuit}
                          onChange={(ev) => updateLine(i, { facturacionCuit: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                          placeholder="20-12345678-9"
                        />
                      </FormField>
                      <FormField label="Notas facturación">
                        <input
                          type="text"
                          value={l.facturacionNotas}
                          onChange={(ev) => updateLine(i, { facturacionNotas: ev.target.value })}
                          className="w-full rounded border px-1.5 py-1"
                        />
                      </FormField>
                    </div>
                    <IconButton title="Eliminar línea" variant="danger" onClick={() => removeLine(i)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1 text-sm font-semibold">Total estimado: {formatArsFromCents(totalCents)}</div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handlePreview}
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Printer size={15} /> Vista previa / Imprimir
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleSave}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Guardando..." : "Guardar cierre"}
            </button>
          </div>
        </div>
      )}

      {detailTarget && (
        <LineDetailModal
          batchId={detailTarget.batchId}
          lineId={detailTarget.lineId}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {editTarget && (
        <LineEditModal
          line={batches.find((b) => b.id === editTarget.batchId)!.lines.find((l) => l.id === editTarget.lineId)!}
          billingClients={billingClients}
          onClose={() => setEditTarget(null)}
          onSaved={() => { refreshBatches(); refreshBillingClients(); }}
        />
      )}

      {addLineBatchId && (
        <AddLineModal
          batchId={addLineBatchId}
          defaultClienteLabel={
            batches.find((b) => b.id === addLineBatchId)?.cuentaCorrienteAccount?.customer.displayName ?? ""
          }
          billingClients={billingClients}
          onClose={() => setAddLineBatchId(null)}
          onSaved={() => { refreshBatches(); refreshBillingClients(); }}
        />
      )}
    </div>
  );
}

type LineDetail = Omit<BatchLine, "products"> & {
  products: { id: string; qtyPerUnit: string; product: { name: string } }[];
  actualQty: number | null;
  actualCobradas: number | null;
  paymentMethod: string | null;
  deliveredAt: string | Date | null;
  cancellationReason: string | null;
  deliveredByEmployee: { displayName: string } | null;
};

function LineDetailModal({
  batchId,
  lineId,
  onClose,
}: {
  batchId: string;
  lineId: string;
  onClose: () => void;
}) {
  const [line, setLine] = useState<LineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ventas-comerciales/${batchId}`);
        if (!res.ok) throw new Error(await res.text());
        const batch = await res.json();
        const found = (batch.lines as LineDetail[]).find((l) => l.id === lineId) ?? null;
        if (!found) throw new Error("No se encontró la línea.");
        setLine(found);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar el detalle.");
      }
    })();
  }, [batchId, lineId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">Detalle de la línea</div>
          <button type="button" onClick={onClose} className="rounded-md border px-2 py-1 text-sm text-neutral-500">
            Cerrar
          </button>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!line && !error && <div className="text-sm text-neutral-400">Cargando...</div>}

        {line && (
          <div className="space-y-4 text-sm">
            <div className="text-xs text-neutral-400">
              {line.clienteLabel} · {line.tipoVianda} · {formatDate(line.deliveryDate)}
            </div>

            <div className="rounded-md border border-neutral-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Productos cargados por cocina
              </div>
              {line.products.length === 0 ? (
                <div className="text-xs text-amber-600">Todavía no se cargaron productos.</div>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4">
                  {line.products.map((p) => (
                    <li key={p.id}>
                      {p.product.name} — x{p.qtyPerUnit} por vianda
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-neutral-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Estado</div>
              <div className="mb-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[line.status]}`}>
                  {STATUS_LABELS[line.status]}
                </span>
              </div>
              {line.status === "ENTREGADA" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-neutral-400">Cantidad entregada:</span> {line.actualQty ?? "—"}</div>
                  <div><span className="text-neutral-400">Cobradas reales:</span> {line.actualCobradas ?? "—"}</div>
                  <div><span className="text-neutral-400">Medio de pago:</span> {line.paymentMethod ?? "—"}</div>
                  <div><span className="text-neutral-400">Entregada el:</span> {line.deliveredAt ? formatDate(line.deliveredAt) : "—"}</div>
                  <div className="col-span-2">
                    <span className="text-neutral-400">Entregada por:</span> {line.deliveredByEmployee?.displayName ?? "—"}
                  </div>
                </div>
              )}
              {line.status === "CANCELADA" && line.cancellationReason && (
                <div><span className="text-neutral-400">Motivo:</span> {line.cancellationReason}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LineEditModal({
  line,
  billingClients,
  onClose,
  onSaved,
}: {
  line: BatchLine;
  billingClients: BillingClient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deliveryDate, setDeliveryDate] = useState(toDateInputValue(line.deliveryDate));
  const [clienteLabel, setClienteLabel] = useState(line.clienteLabel);
  const [tipoVianda, setTipoVianda] = useState(line.tipoVianda);
  const [cant, setCant] = useState(String(line.cant));
  const [horarioRetiro, setHorarioRetiro] = useState(line.horarioRetiro);
  const [unitPriceArs, setUnitPriceArs] = useState(String(line.unitPriceCents / 100));
  const [formaDePagoPlanificada, setFormaDePagoPlanificada] = useState(line.formaDePagoPlanificada ?? "");
  const [viandasCobradasPlanned, setViandasCobradasPlanned] = useState(String(line.viandasCobradasPlanned));
  const [detalleComanda, setDetalleComanda] = useState(line.detalleComanda ?? "");
  const [facturacionRazonSocial, setFacturacionRazonSocial] = useState(line.facturacionRazonSocial ?? "");
  const [facturacionCuit, setFacturacionCuit] = useState(line.facturacionCuit ?? "");
  const [facturacionNotas, setFacturacionNotas] = useState(line.facturacionNotas ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const cantNum = parseInt(cant, 10);
    const cobradasNum = parseInt(viandasCobradasPlanned, 10);
    const priceCents = Math.round((parseFloat(unitPriceArs) || 0) * 100);
    if (!deliveryDate || !clienteLabel.trim() || !tipoVianda.trim() || !horarioRetiro.trim()) {
      setError("Completá todos los campos obligatorios.");
      return;
    }
    if (!Number.isFinite(cantNum) || cantNum < 1) {
      setError("Cantidad inválida.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/ventas-comerciales/lines/${line.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deliveryDate: new Date(deliveryDate + "T12:00:00.000Z").toISOString(),
          clienteLabel: clienteLabel.trim(),
          tipoVianda: tipoVianda.trim(),
          cant: cantNum,
          horarioRetiro: horarioRetiro.trim(),
          unitPriceCents: priceCents,
          formaDePagoPlanificada,
          viandasCobradasPlanned: cobradasNum,
          detalleComanda,
          facturacionRazonSocial,
          facturacionCuit,
          facturacionNotas,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Error al guardar.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">Editar línea</div>
          <button type="button" onClick={onClose} className="rounded-md border px-2 py-1 text-sm text-neutral-500">
            Cerrar
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Día de entrega</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Horario</span>
              <input
                type="text"
                value={horarioRetiro}
                onChange={(e) => setHorarioRetiro(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">Cliente</span>
            <input
              type="text"
              value={clienteLabel}
              onChange={(e) => setClienteLabel(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">Tipo de vianda</span>
            <input
              type="text"
              value={tipoVianda}
              onChange={(e) => setTipoVianda(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Cantidad</span>
              <input
                type="number"
                min={1}
                value={cant}
                onChange={(e) => setCant(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Precio unitario ($)</span>
              <input
                type="number"
                min={0}
                value={unitPriceArs}
                onChange={(e) => setUnitPriceArs(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Cobradas planificadas</span>
              <input
                type="number"
                min={0}
                value={viandasCobradasPlanned}
                onChange={(e) => setViandasCobradasPlanned(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">
              Forma de pago planificada <span className="text-neutral-400">(opcional)</span>
            </span>
            <input
              type="text"
              value={formaDePagoPlanificada}
              onChange={(e) => setFormaDePagoPlanificada(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">
              Detalle <span className="text-neutral-400">(opcional)</span>
            </span>
            <input
              type="text"
              value={detalleComanda}
              onChange={(e) => setDetalleComanda(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-3 rounded-md border border-neutral-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Datos de facturación <span className="normal-case font-normal">(opcional)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="block text-xs font-medium">Facturar a (razón social)</span>
                <input
                  type="text"
                  list="billing-clients-datalist"
                  value={facturacionRazonSocial}
                  onChange={(e) => setFacturacionRazonSocial(e.target.value)}
                  onBlur={() => {
                    if (facturacionCuit.trim()) return;
                    const cuit = findBillingClientCuit(facturacionRazonSocial, billingClients);
                    if (cuit) setFacturacionCuit(cuit);
                  }}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium">CUIT</span>
                <input
                  type="text"
                  value={facturacionCuit}
                  onChange={(e) => setFacturacionCuit(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="20-12345678-9"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Notas de facturación</span>
              <input
                type="text"
                value={facturacionNotas}
                onChange={(e) => setFacturacionNotas(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddLineModal({
  batchId,
  defaultClienteLabel,
  billingClients,
  onClose,
  onSaved,
}: {
  batchId: string;
  defaultClienteLabel: string;
  billingClients: BillingClient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deliveryDate, setDeliveryDate] = useState("");
  const [clienteLabel, setClienteLabel] = useState(defaultClienteLabel);
  const [tipoVianda, setTipoVianda] = useState("");
  const [cant, setCant] = useState("1");
  const [horarioRetiro, setHorarioRetiro] = useState("");
  const [unitPriceArs, setUnitPriceArs] = useState("");
  const [formaDePagoPlanificada, setFormaDePagoPlanificada] = useState("");
  const [viandasCobradasPlanned, setViandasCobradasPlanned] = useState("1");
  const [detalleComanda, setDetalleComanda] = useState("");
  const [facturacionRazonSocial, setFacturacionRazonSocial] = useState("");
  const [facturacionCuit, setFacturacionCuit] = useState("");
  const [facturacionNotas, setFacturacionNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const cantNum = parseInt(cant, 10);
    const cobradasNum = parseInt(viandasCobradasPlanned, 10);
    const priceCents = Math.round((parseFloat(unitPriceArs) || 0) * 100);
    if (!deliveryDate || !clienteLabel.trim() || !tipoVianda.trim() || !horarioRetiro.trim()) {
      setError("Completá todos los campos obligatorios.");
      return;
    }
    if (!Number.isFinite(cantNum) || cantNum < 1) {
      setError("Cantidad inválida.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/ventas-comerciales/${batchId}/lines`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deliveryDate,
          clienteLabel: clienteLabel.trim(),
          tipoVianda: tipoVianda.trim(),
          cant: cantNum,
          horarioRetiro: horarioRetiro.trim(),
          unitPriceCents: priceCents,
          formaDePagoPlanificada,
          viandasCobradasPlanned: cobradasNum,
          detalleComanda,
          facturacionRazonSocial,
          facturacionCuit,
          facturacionNotas,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Error al guardar.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">Agregar línea al cierre</div>
          <button type="button" onClick={onClose} className="rounded-md border px-2 py-1 text-sm text-neutral-500">
            Cerrar
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Día de entrega</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Horario</span>
              <input
                type="text"
                value={horarioRetiro}
                onChange={(e) => setHorarioRetiro(e.target.value)}
                placeholder="12:00"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">Cliente</span>
            <input
              type="text"
              value={clienteLabel}
              onChange={(e) => setClienteLabel(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">Tipo de vianda</span>
            <input
              type="text"
              value={tipoVianda}
              onChange={(e) => setTipoVianda(e.target.value)}
              placeholder="ALMUERZO"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Cantidad</span>
              <input
                type="number"
                min={1}
                value={cant}
                onChange={(e) => setCant(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Precio unitario ($)</span>
              <input
                type="number"
                min={0}
                value={unitPriceArs}
                onChange={(e) => setUnitPriceArs(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Cobradas planificadas</span>
              <input
                type="number"
                min={0}
                value={viandasCobradasPlanned}
                onChange={(e) => setViandasCobradasPlanned(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">
              Forma de pago planificada <span className="text-neutral-400">(opcional)</span>
            </span>
            <input
              type="text"
              value={formaDePagoPlanificada}
              onChange={(e) => setFormaDePagoPlanificada(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">
              Detalle <span className="text-neutral-400">(opcional)</span>
            </span>
            <input
              type="text"
              value={detalleComanda}
              onChange={(e) => setDetalleComanda(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-3 rounded-md border border-neutral-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Datos de facturación <span className="normal-case font-normal">(opcional)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="block text-xs font-medium">Facturar a (razón social)</span>
                <input
                  type="text"
                  list="billing-clients-datalist"
                  value={facturacionRazonSocial}
                  onChange={(e) => setFacturacionRazonSocial(e.target.value)}
                  onBlur={() => {
                    if (facturacionCuit.trim()) return;
                    const cuit = findBillingClientCuit(facturacionRazonSocial, billingClients);
                    if (cuit) setFacturacionCuit(cuit);
                  }}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium">CUIT</span>
                <input
                  type="text"
                  value={facturacionCuit}
                  onChange={(e) => setFacturacionCuit(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="20-12345678-9"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="block text-xs font-medium">Notas de facturación</span>
              <input
                type="text"
                value={facturacionNotas}
                onChange={(e) => setFacturacionNotas(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Agregar línea"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
