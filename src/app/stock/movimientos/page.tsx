"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MovementLine = {
  id: string;
  direction: "IN" | "OUT";
  qty: string;
  inventoryItem: { id: string; name: string; unit: string };
  location: { id: string; code: string; label: string };
};

type Movement = {
  id: string;
  type: string;
  occurredAt: string;
  notes: string | null;
  lines: MovementLine[];
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

function toIsoInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StockMovimientosPage() {
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return toIsoInput(d);
  });
  const [to, setTo] = useState(() => toIsoInput(new Date()));
  const [movements, setMovements] = useState<Movement[]>([]);

  async function load() {
    const data = await apiGet<{ movements: Movement[] }>(`/api/stock/movements?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`);
    setMovements(data.movements);
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalLines = useMemo(() => movements.reduce((s, m) => s + m.lines.length, 0), [movements]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Movimientos de stock</div>
          <div className="text-sm text-neutral-600">
            {movements.length} movimientos · {totalLines} líneas
          </div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
          Volver a stock
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="rounded-lg border bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-neutral-700">
            Desde
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs text-neutral-700">
            Hasta
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
              onClick={async () => {
                try {
                  setError(null);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(m.occurredAt).toLocaleString("es-AR")}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full border bg-white px-2 py-1 text-xs font-medium">{m.type}</span>
                  {m.notes ? <div className="mt-1 text-xs text-neutral-500">{m.notes}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    {m.lines.map((l) => (
                      <div key={l.id} className="text-xs text-neutral-700">
                        <b className={l.direction === "IN" ? "text-emerald-700" : "text-red-700"}>{l.direction}</b>{" "}
                        {l.qty} {l.inventoryItem.unit} · {l.inventoryItem.name} · {l.location.label}
                      </div>
                    ))}
                    {!m.lines.length ? <div className="text-xs text-neutral-500">Sin líneas</div> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!movements.length ? (
              <tr>
                <td className="px-3 py-8 text-sm text-neutral-600" colSpan={3}>
                  Sin movimientos en el rango seleccionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

