"use client";

import { useState } from "react";
import { formatArsFromCents } from "@/lib/money";
import { openAndControlEnvelopeAction } from "@/modules/caja_local/actions/localCashBoxActions";

type Envelope = {
  id: string;
  envelopeCode: string;
  expectedAmountCents: number;
  cashSession: {
    businessDate: string | Date;
    shift: string;
    employee: { displayName: string };
  };
};

export function OpenEnvelopeModal({ envelopes }: { envelopes: Envelope[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [pesos, setPesos] = useState("");
  const [actualCents, setActualCents] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const selected = envelopes.find((e) => e.id === selectedId) ?? null;
  const expected = selected?.expectedAmountCents ?? 0;
  const actual = actualCents ?? 0;
  const diff = actual - expected;

  function close() {
    setOpen(false);
    setStep(1);
    setSelectedId("");
    setPesos("");
    setActualCents(null);
    setNotes("");
  }

  if (!envelopes.length) {
    return (
      <div className="text-sm text-neutral-400 italic">No hay sobres cerrados disponibles.</div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
      >
        Abrir sobre
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex gap-1.5">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? "bg-neutral-900" : "bg-neutral-200"}`}
                />
              ))}
            </div>

            {step === 1 && (
              <div>
                <div className="text-base font-semibold">Elegí el sobre</div>
                <div className="mt-1 text-sm text-neutral-500">
                  Seleccioná el sobre del turno que vas a abrir.
                </div>
                <select
                  className="mt-4 w-full rounded-md border px-2 py-2 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  autoFocus
                >
                  <option value="">—</option>
                  {envelopes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.envelopeCode} · {e.cashSession.employee.displayName} ·{" "}
                      {new Date(e.cashSession.businessDate).toLocaleDateString("es-AR")} ·{" "}
                      {e.cashSession.shift}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div className="mt-4 rounded-lg bg-neutral-50 p-4">
                    <div className="text-xs text-neutral-500">Monto esperado en el sobre</div>
                    <div className="mt-1 text-2xl font-bold">
                      {formatArsFromCents(selected.expectedAmountCents)}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={close}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!selectedId}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && selected && (
              <div>
                <div className="text-base font-semibold">Abrí el sobre físico</div>
                <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed space-y-2">
                  <p>
                    Buscá el sobre físico con el código:{" "}
                    <span className="font-mono font-semibold">{selected.envelopeCode}</span>
                  </p>
                  <p className="text-neutral-600">
                    Turno <strong>{selected.cashSession.shift}</strong> del{" "}
                    <strong>
                      {new Date(selected.cashSession.businessDate).toLocaleDateString("es-AR")}
                    </strong>
                    , a cargo de{" "}
                    <strong>{selected.cashSession.employee.displayName}</strong>.
                  </p>
                  <p className="font-medium text-neutral-800">
                    Abrilo y dejá la plata lista para contar.
                  </p>
                </div>

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← Atrás
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Ya abrí el sobre →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && selected && (
              <div>
                <div className="text-base font-semibold">Contá el dinero</div>
                <div className="mt-1 text-sm text-neutral-500">
                  Ingresá el total que contaste adentro del sobre.
                </div>

                <div className="mt-4 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    className="w-full rounded-md border py-3 pl-7 pr-3 text-lg font-semibold"
                    placeholder="0"
                    value={pesos}
                    autoFocus
                    onChange={(e) => {
                      setPesos(e.target.value);
                      setActualCents(
                        e.target.value !== "" ? Math.round(parseFloat(e.target.value) * 100) : null
                      );
                    }}
                  />
                </div>

                {actualCents !== null && (
                  <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Esperado</span>
                      <span className="font-medium">{formatArsFromCents(expected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Contado</span>
                      <span className="font-medium">{formatArsFromCents(actual)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="font-medium">Diferencia</span>
                      <span
                        className={`font-semibold ${diff === 0 ? "text-green-700" : "text-red-700"}`}
                      >
                        {diff === 0
                          ? "✓ Coincide"
                          : diff > 0
                          ? `Hay ${formatArsFromCents(diff)} de más`
                          : `Faltan ${formatArsFromCents(Math.abs(diff))}`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← Atrás
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    disabled={actualCents === null}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {step === 4 && selected && (
              <div>
                <div className="text-base font-semibold">Confirmá el ingreso a Caja BCN</div>

                <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Sobre</span>
                    <span className="font-mono font-medium">{selected.envelopeCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Empleada/o</span>
                    <span>{selected.cashSession.employee.displayName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Esperado</span>
                    <span className="font-medium">{formatArsFromCents(expected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Contado</span>
                    <span className="font-semibold">{formatArsFromCents(actual)}</span>
                  </div>
                  {diff !== 0 && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-neutral-500">Diferencia</span>
                      <span className="font-semibold text-red-700">
                        {diff > 0
                          ? `+${formatArsFromCents(diff)}`
                          : `-${formatArsFromCents(Math.abs(diff))}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-neutral-500">Resultado</span>
                    <span
                      className={`font-semibold ${diff === 0 ? "text-green-700" : "text-orange-700"}`}
                    >
                      {diff === 0 ? "CONTROLADO" : "NO CONTROLADO"}
                    </span>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
                />

                <form action={openAndControlEnvelopeAction} className="mt-6 flex justify-between">
                  <input type="hidden" name="envelopeId" value={selected.id} />
                  <input type="hidden" name="actualAmountCents" value={actual} />
                  <input type="hidden" name="notes" value={notes} />
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← Atrás
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Guardar en la caja
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
