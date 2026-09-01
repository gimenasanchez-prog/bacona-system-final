"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArsFromCents } from "@/lib/money";
import { saveComercialBatchAction } from "@/modules/ventas_comerciales/actions/comercialSaleActions";
import { NuevaCuentaModal } from "@/app/cuentas-corrientes/NuevaCuentaModal";
import { printComercialBatchPreview } from "@/modules/ventas_comerciales/lib/printPreview";

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
  products: { id: string }[];
};

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

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  };
}

export default function VentasComercialesClient({ initialBatches }: { initialBatches: Batch[] }) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [view, setView] = useState<"list" | "form">("list");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ batchId: string; lineId: string } | null>(null);

  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine("")]);

  const refreshBatches = useCallback(async () => {
    const res = await fetch("/api/ventas-comerciales");
    if (res.ok) setBatches(await res.json());
  }, []);

  const refreshAccounts = useCallback(async () => {
    const res = await fetch("/api/ventas-comerciales/accounts");
    if (res.ok) setAccounts(await res.json());
  }, []);

  const handleAccountCreated = useCallback(
    async (createdId?: string) => {
      await refreshAccounts();
      if (createdId) setAccountId(createdId);
    },
    [refreshAccounts]
  );

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

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
    setView("list");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ventas Comerciales</h1>
        {view === "list" && (
          <button
            type="button"
            onClick={openNewForm}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            + Nuevo cierre comercial
          </button>
        )}
      </div>

      {view === "list" && (
        <div className="space-y-3">
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
                <div className="text-xs text-neutral-400">{formatDate(b.createdAt)}</div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Día</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Vianda</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2">Horario</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.id} className="border-t border-neutral-100">
                      <td className="px-3 py-2">{formatDate(l.deliveryDate)}</td>
                      <td className="px-3 py-2">{l.clienteLabel}</td>
                      <td className="px-3 py-2">{l.tipoVianda}</td>
                      <td className="px-3 py-2 text-right">{l.cant}</td>
                      <td className="px-3 py-2">{l.horarioRetiro}</td>
                      <td className="px-3 py-2 text-right">
                        {formatArsFromCents(l.unitPriceCents * l.viandasCobradasPlanned)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status]}`}>
                          {STATUS_LABELS[l.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                          onClick={() => setDetailTarget({ batchId: b.id, lineId: l.id })}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                className="rounded-md border px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                + Agregar línea
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="text-left text-[11px] font-semibold text-neutral-500">
                  <tr>
                    <th className="px-1 py-1">Día</th>
                    <th className="px-1 py-1">Cliente</th>
                    <th className="px-1 py-1">Tipo vianda</th>
                    <th className="px-1 py-1">Cant.</th>
                    <th className="px-1 py-1">Horario</th>
                    <th className="px-1 py-1">Precio $</th>
                    <th className="px-1 py-1">Forma de pago</th>
                    <th className="px-1 py-1">Cobradas</th>
                    <th className="px-1 py-1">Detalle</th>
                    <th className="px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-1 py-1">
                        <input
                          type="date"
                          value={l.deliveryDate}
                          onChange={(ev) => updateLine(i, { deliveryDate: ev.target.value })}
                          className="w-32 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={l.clienteLabel}
                          onChange={(ev) => updateLine(i, { clienteLabel: ev.target.value })}
                          className="w-36 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={l.tipoVianda}
                          onChange={(ev) => updateLine(i, { tipoVianda: ev.target.value })}
                          className="w-28 rounded border px-1.5 py-1"
                          placeholder="ALMUERZO"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={1}
                          value={l.cant}
                          onChange={(ev) => updateLine(i, { cant: ev.target.value })}
                          className="w-16 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={l.horarioRetiro}
                          onChange={(ev) => updateLine(i, { horarioRetiro: ev.target.value })}
                          className="w-20 rounded border px-1.5 py-1"
                          placeholder="12:00"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          value={l.unitPriceArs}
                          onChange={(ev) => updateLine(i, { unitPriceArs: ev.target.value })}
                          className="w-24 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={l.formaDePagoPlanificada}
                          onChange={(ev) => updateLine(i, { formaDePagoPlanificada: ev.target.value })}
                          className="w-28 rounded border px-1.5 py-1"
                          placeholder="transferencia"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          value={l.viandasCobradasPlanned}
                          onChange={(ev) => updateLine(i, { viandasCobradasPlanned: ev.target.value })}
                          className="w-16 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={l.detalleComanda}
                          onChange={(ev) => updateLine(i, { detalleComanda: ev.target.value })}
                          className="w-32 rounded border px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded border px-1.5 py-1 text-neutral-400 hover:bg-neutral-50"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Vista previa / Imprimir
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
            <div className="rounded-md border border-neutral-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Planificado</div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-neutral-400">Día:</span> {formatDate(line.deliveryDate)}</div>
                <div><span className="text-neutral-400">Horario:</span> {line.horarioRetiro}</div>
                <div><span className="text-neutral-400">Cliente:</span> {line.clienteLabel}</div>
                <div><span className="text-neutral-400">Tipo de vianda:</span> {line.tipoVianda}</div>
                <div><span className="text-neutral-400">Cantidad:</span> {line.cant}</div>
                <div><span className="text-neutral-400">Precio unitario:</span> {formatArsFromCents(line.unitPriceCents)}</div>
                <div><span className="text-neutral-400">Forma de pago planificada:</span> {line.formaDePagoPlanificada || "—"}</div>
                <div><span className="text-neutral-400">Cobradas planificadas:</span> {line.viandasCobradasPlanned}</div>
              </div>
              {line.detalleComanda && (
                <div className="mt-2"><span className="text-neutral-400">Detalle:</span> {line.detalleComanda}</div>
              )}
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
