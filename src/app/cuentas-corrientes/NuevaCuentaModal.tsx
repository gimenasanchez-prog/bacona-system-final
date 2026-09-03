"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createCcAccountAction,
  type CreateCcAccountState,
} from "@/modules/cuentas_corrientes/actions/createCcAccountAction";
import { PLAN_CODES, PLAN_LABELS } from "@/modules/cuentas_corrientes/lib/planTariffs";

const IVA_CONDITION_LABELS: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: "Responsable Inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
  CONSUMIDOR_FINAL: "Consumidor Final",
  OTRO: "Otro",
};

export function NuevaCuentaModal({ onCreated }: { onCreated: (createdId?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [accountKind, setAccountKind] = useState<"CORPORATIVA" | "TRANSITORIA">("CORPORATIVA");
  const [planCode, setPlanCode] = useState("");
  const [uncapped, setUncapped] = useState(true);
  const [coverageInput, setCoverageInput] = useState("");
  const [confirmDespiteSimilar, setConfirmDespiteSimilar] = useState(false);

  const initialState: CreateCcAccountState = useMemo(() => ({ error: null, createdId: null }), []);
  const [state, action, pending] = useActionState(createCcAccountAction, initialState);

  useEffect(() => {
    if (state.createdId) {
      setOpen(false);
      setAccountKind("CORPORATIVA");
      setPlanCode("");
      setUncapped(true);
      setCoverageInput("");
      setConfirmDespiteSimilar(false);
      onCreated(state.createdId ?? undefined);
    }
  }, [state.createdId, onCreated]);

  function selectExistingAccount(id: string) {
    setOpen(false);
    setAccountKind("CORPORATIVA");
    setPlanCode("");
    setUncapped(true);
    setCoverageInput("");
    setConfirmDespiteSimilar(false);
    onCreated(id);
  }

  // Sugerencia de tope de cobertura según la tarifa elegida.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cuentas-corrientes/plan-suggestion?planCode=${encodeURIComponent(planCode)}`);
        if (!res.ok || cancelled) return;
        const data: { suggestedCoverageAmountCents: number | null } = await res.json();
        if (cancelled) return;
        if (data.suggestedCoverageAmountCents == null) {
          setUncapped(true);
          setCoverageInput("");
        } else {
          setUncapped(false);
          setCoverageInput(String(data.suggestedCoverageAmountCents / 100));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, planCode]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + Nuevo cliente / cuenta corriente
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-base font-semibold">Nuevo cliente / cuenta corriente</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Da de alta un cliente con cuenta corriente. Va a aparecer inmediatamente en este listado y como
                  opción en el POS.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-2 py-1 text-sm text-neutral-500"
              >
                Cerrar
              </button>
            </div>

            <form action={action} className="space-y-4">
              <div className="space-y-3 rounded-md border border-neutral-200 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Datos de la cuenta</div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">Nombre del cliente</label>
                  <input
                    type="text"
                    name="displayName"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Ej: Empresa SAU"
                    onChange={() => setConfirmDespiteSimilar(false)}
                    required
                  />
                  <input type="hidden" name="confirmDespiteSimilar" value={confirmDespiteSimilar ? "true" : "false"} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">Tipo de cuenta</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAccountKind("CORPORATIVA")}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                        accountKind === "CORPORATIVA" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      Corporativa
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountKind("TRANSITORIA")}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                        accountKind === "TRANSITORIA" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      Transitoria
                    </button>
                  </div>
                  <input type="hidden" name="accountKind" value={accountKind} />
                  <div className="text-xs text-neutral-400">
                    {accountKind === "CORPORATIVA"
                      ? "Cliente con convenio fijo: ciclo de facturación, tarifa y tope de cobertura."
                      : "Cliente esporádico sin convenio. No aparece como opción de cuenta corriente en el POS. Se factura con la fecha de pago que se indique."}
                  </div>
                </div>

                {accountKind === "CORPORATIVA" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium">Ciclo de facturación</label>
                        <select
                          name="billingCycle"
                          defaultValue="MENSUAL"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          required
                        >
                          <option value="MENSUAL">Mensual</option>
                          <option value="QUINCENAL">Quincenal</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium">Tarifa</label>
                        <select
                          name="planCode"
                          value={planCode}
                          onChange={(ev) => setPlanCode(ev.target.value)}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">— Sin plan (ve todo el menú) —</option>
                          {PLAN_CODES.map((code) => (
                            <option key={code} value={code}>{PLAN_LABELS[code]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Tope de cobertura por comensal (pesos)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          name="coverageAmountCents"
                          value={coverageInput}
                          onChange={(ev) => setCoverageInput(ev.target.value)}
                          disabled={uncapped}
                          required={!uncapped}
                          min={1}
                          step={1}
                          className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
                          placeholder="Ej: 13500"
                        />
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-600">
                          <input
                            type="checkbox"
                            checked={uncapped}
                            onChange={(ev) => setUncapped(ev.target.checked)}
                          />
                          Sin tope
                        </label>
                      </div>
                      <input type="hidden" name="uncapped" value={uncapped ? "true" : "false"} />
                      <div className="text-xs text-neutral-400">
                        Sugerido automáticamente según la tarifa elegida (precio del producto corporativo más caro
                        habilitado). Se puede sobrescribir.
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Fecha de pago estipulada</label>
                    <input
                      type="date"
                      name="estimatedPaymentDate"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      required
                    />
                    <div className="text-xs text-neutral-400">
                      Cuando se cobre una venta a esta cuenta por cuenta corriente, se va a facturar automáticamente
                      con esta fecha de vencimiento.
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-md border border-neutral-200 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Datos de contacto y fiscales <span className="normal-case font-normal">(opcional)</span>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">Domicilio</label>
                  <input type="text" name="address" className="w-full rounded-md border px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Razón social</label>
                    <input type="text" name="razonSocial" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">CUIT</label>
                    <input
                      type="text"
                      name="cuit"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="20-12345678-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">Condición IVA</label>
                  <select name="ivaCondition" defaultValue="" className="w-full rounded-md border px-3 py-2 text-sm">
                    <option value="">— Sin especificar —</option>
                    {Object.entries(IVA_CONDITION_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Contacto 1 — Nombre</label>
                    <input type="text" name="contactName1" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Teléfono</label>
                    <input type="text" name="contactPhone1" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Email</label>
                    <input type="email" name="contactEmail1" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Contacto 2 — Nombre</label>
                    <input type="text" name="contactName2" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Teléfono</label>
                    <input type="text" name="contactPhone2" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Email</label>
                    <input type="email" name="contactEmail2" className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {state.error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {state.error}
                </div>
              )}

              {!state.error && state.similarAccounts && state.similarAccounts.length > 0 && !confirmDespiteSimilar && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div>Ya existe{state.similarAccounts.length > 1 ? "n" : ""} una cuenta parecida. ¿Es la misma?</div>
                  <div className="space-y-1">
                    {state.similarAccounts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-white px-2 py-1.5">
                        <span className="text-neutral-700">
                          {a.displayName}{" "}
                          <span className="text-xs text-neutral-400">
                            ({a.accountKind === "TRANSITORIA" ? "Transitoria" : "Corporativa"})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => selectExistingAccount(a.id)}
                          className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Usar esta cuenta
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDespiteSimilar(true)}
                    className="text-xs font-medium text-amber-800 underline"
                  >
                    No, es un cliente distinto — crear de todos modos
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
