"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { formatArsFromCents } from "@/lib/money";
import {
  sealAndCloseShiftAction,
  transferOpenTableAction,
  type SealAndCloseState,
} from "@/modules/caja/actions/cashSessionActions";
import { LocalExpenseModal } from "../LocalExpenseModal";

type Step = "mesas" | "gastos" | "sobre" | "confirmar";

const STEPS: { key: Step; label: string }[] = [
  { key: "mesas", label: "Mesas" },
  { key: "gastos", label: "Gastos" },
  { key: "sobre", label: "Sobre" },
  { key: "confirmar", label: "Confirmar" },
];

function pesosToCents(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function centsToPesosInput(cents: number) {
  return String(cents / 100);
}

/**
 * Cierre de turno paso a paso: mesas abiertas → gastos en efectivo → cuánto va en el sobre →
 * confirmación con responsabilidad → sella el sobre y cierra el turno en un solo paso.
 */
export function CloseShiftWizard(props: {
  cashSessionId: string;
  openTables: { id: string; label: string; totalCents: number; hasPayments: boolean }[];
  expenses: { id: string; supplierNameSnapshot: string; description: string | null; amountCents: number }[];
  suppliers: { id: string; name: string }[];
  inventoryItems: { id: string; name: string; unit: string }[];
  cashCents: number;
  shiftCashExpensesCents: number;
  expectedEnvelopeCents: number;
  sealedEnvelope: { envelopeCode: string; declaredAmountCents: number | null; expectedAmountCents: number } | null;
  custodianName: string | null;
  isCustodian: boolean;
}) {
  const hasTables = props.openTables.length > 0;
  const [step, setStep] = useState<Step>(hasTables ? "mesas" : "gastos");
  const [declaredRaw, setDeclaredRaw] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);

  const initial: SealAndCloseState = useMemo(() => ({ error: null }), []);
  const [state, action, pending] = useActionState(sealAndCloseShiftAction, initial);

  const expected = props.expectedEnvelopeCents;
  const noCash = expected === 0 && !props.sealedEnvelope;
  const declaredCents = props.sealedEnvelope?.declaredAmountCents ?? (noCash ? 0 : pesosToCents(declaredRaw));
  const diff = declaredCents == null ? null : declaredCents - expected;
  const custodian = props.custodianName ?? "la encargada de sobres";

  // Si quedan mesas, siempre se vuelve al paso 1 (el servidor también lo valida).
  const current: Step = hasTables ? "mesas" : step;
  const tablesDone = current === "mesas" && !hasTables;
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="space-y-4">
      <ol className="flex gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`flex-1 rounded-md border px-2 py-1.5 text-center text-xs font-medium ${
              i === currentIndex
                ? "border-neutral-900 bg-neutral-900 text-white"
                : i < currentIndex
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "text-neutral-400"
            }`}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {tablesDone && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
            ✓ No quedan mesas abiertas.
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setStep("gastos")}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Seguir
            </button>
          </div>
        </div>
      )}

      {current === "mesas" && hasTables && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-base font-semibold">Quedan mesas abiertas</div>
          <div className="mt-1 text-sm text-neutral-600">
            Antes de cerrar, cobrá cada mesa desde Ventas o pasala al turno siguiente: la cobra y la pone en su sobre
            quien esté en ese turno.
          </div>
          <div className="mt-3 divide-y rounded-md border">
            {props.openTables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">Mesa {t.label}</span>{" "}
                  <span className="text-neutral-600">· {formatArsFromCents(t.totalCents)}</span>
                  {t.hasPayments ? (
                    <div className="text-xs text-red-700">Tiene un cobro parcial: terminá de cobrarla en Ventas.</div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link href="/pos" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">
                    Cobrar en Ventas
                  </Link>
                  {!t.hasPayments && (
                    <form action={transferOpenTableAction}>
                      <input type="hidden" name="saleId" value={t.id} />
                      <input type="hidden" name="returnTo" value="/caja/turno/cerrar" />
                      <button className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50">
                        Pasar al turno siguiente
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {current === "gastos" && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-base font-semibold">¿Pagaste algo con la plata del turno?</div>
          <div className="mt-1 text-sm text-neutral-600">
            Cargá todo lo que pagaste en efectivo del cajón (compras, gas, arreglos). Esa plata no va al sobre.
          </div>
          {props.expenses.length ? (
            <div className="mt-3 divide-y rounded-md border">
              {props.expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {e.supplierNameSnapshot}
                    {e.description ? <span className="text-neutral-500"> · {e.description}</span> : null}
                  </span>
                  <span className="font-medium">{formatArsFromCents(e.amountCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              No cargaste gastos en este turno.
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <LocalExpenseModal
              cashSessionId={props.cashSessionId}
              suppliers={props.suppliers}
              inventoryItems={props.inventoryItems}
              buttonLabel="+ Agregar un gasto"
              variant="secondary"
              shiftCashOnly
            />
            <button
              onClick={() => setStep("sobre")}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              {props.expenses.length ? "No hay más gastos, seguir" : "No hubo gastos, seguir"}
            </button>
          </div>
        </div>
      )}

      {current === "sobre" && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-base font-semibold">Armá el sobre</div>
          {props.sealedEnvelope ? (
            <div className="mt-2 text-sm text-neutral-700">
              El sobre de este turno ya está sellado (<span className="font-mono">{props.sealedEnvelope.envelopeCode}</span>).
              Solo falta cerrar el turno.
            </div>
          ) : noCash ? (
            <div className="mt-2 text-sm text-neutral-700">
              No cobraste efectivo en este turno (o se usó todo en gastos): no hace falta sobre.
            </div>
          ) : (
            <>
              <div className="mt-3 space-y-1 rounded-md border bg-neutral-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span>Cobraste en efectivo</span>
                  <span>{formatArsFromCents(props.cashCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gastos pagados con la plata del turno</span>
                  <span>− {formatArsFromCents(props.shiftCashExpensesCents)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <span>Tiene que ir en el sobre</span>
                  <span>{formatArsFromCents(expected)}</span>
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <label className="text-sm font-medium" htmlFor="declared">
                  Contá la plata. ¿Cuánto estás metiendo en el sobre?
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">$</span>
                  <input
                    id="declared"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={declaredRaw}
                    onChange={(e) => setDeclaredRaw(e.target.value)}
                    className="w-48 rounded-md border px-3 py-2 text-base font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setDeclaredRaw(centsToPesosInput(expected))}
                    className="text-xs text-neutral-500 underline"
                  >
                    Es justo {formatArsFromCents(expected)}
                  </button>
                </div>
              </div>
            </>
          )}
          <div className="mt-4 flex justify-between">
            <button onClick={() => setStep("gastos")} className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
              Volver
            </button>
            <button
              onClick={() => {
                setAccepted(false);
                setStep("confirmar");
              }}
              disabled={declaredCents == null}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Seguir
            </button>
          </div>
        </div>
      )}

      {current === "confirmar" && declaredCents != null && (
        <form action={action} className="rounded-lg border-2 border-neutral-900 bg-white p-4 shadow-sm">
          <input type="hidden" name="cashSessionId" value={props.cashSessionId} />
          <input type="hidden" name="declaredPesos" value={String(declaredCents / 100)} />

          {props.sealedEnvelope || noCash ? (
            <>
              <div className="text-base font-semibold">¿Cerrás el turno?</div>
              <div className="mt-1 text-sm text-neutral-600">Después de cerrar no se pueden cargar más ventas ni gastos.</div>
              <input type="hidden" name="acceptedResponsibility" value="1" />
            </>
          ) : (
            <>
              <div className="text-base font-semibold">
                Vas a sellar un sobre con {formatArsFromCents(declaredCents)}
              </div>
              {diff !== 0 && diff != null ? (
                <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  <div className="font-semibold">
                    El sistema dice {formatArsFromCents(expected)}:{" "}
                    {diff < 0 ? `faltan ${formatArsFromCents(-diff)}` : `sobran ${formatArsFromCents(diff)}`}.
                  </div>
                  <div className="mt-1">
                    Revisá si falta cargar un gasto o si algún cobro con tarjeta, QR o transferencia quedó como efectivo.
                    Si igual no coincide, la diferencia queda registrada a tu nombre.
                  </div>
                  <label className="mt-2 block text-xs font-medium" htmlFor="note">
                    Motivo (obligatorio)
                  </label>
                  <input
                    id="note"
                    name="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <div className="mt-2 text-sm text-green-700">Coincide con lo que dice el sistema ✓</div>
              )}
              <label className="mt-4 flex items-start gap-2 rounded-md border bg-neutral-50 p-3 text-sm">
                <input
                  type="checkbox"
                  name="acceptedResponsibility"
                  value="1"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Conté la plata y confirmo que el sobre tiene <b>{formatArsFromCents(declaredCents)}</b>.{" "}
                  {props.isCustodian
                    ? "Queda a mi cargo como encargada de sobres."
                    : `Me hago responsable de este sobre hasta entregárselo en mano a ${custodian}.`}
                </span>
              </label>
            </>
          )}

          {state.error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
          ) : null}

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep("sobre")}
              className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={
                pending ||
                (!props.sealedEnvelope && !noCash && (!accepted || (diff !== 0 && !note.trim())))
              }
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {pending ? "Cerrando…" : props.sealedEnvelope || noCash ? "Cerrar turno" : "Sellar sobre y cerrar turno"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
