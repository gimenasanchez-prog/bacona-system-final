"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  displayUnit: string;
  dimension: string;
};

type FormLine = {
  inventoryItemId: string;
  qty: string;
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? res.statusText);
  return json as T;
}

export default function StockEntradaPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locationCode, setLocationCode] = useState<"BACONA" | "SALTA" | "EN_TRANSITO">("BACONA");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const data = await apiGet<{ items: InventoryItem[] }>("/api/stock/items");
        setItems(data.items);
        // Initialize with first item if available
        if (data.items.length > 0) {
          setLines([{ inventoryItemId: data.items[0].id, qty: "" }]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, []);

  function updateLine(idx: number, patch: Partial<FormLine>) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  }

  function addLine() {
    const first = items[0];
    if (!first) return;
    setLines((p) => [...p, { inventoryItemId: first.id, qty: "" }]);
  }

  const canSubmit = useMemo(
    () => lines.length > 0 && lines.every((l) => l.inventoryItemId && Number(l.qty) > 0),
    [lines]
  );

  async function submit() {
    try {
      setError(null);
      setSuccess(null);
      setLoading(true);

      const movementLines = lines
        .filter((l) => l.inventoryItemId && Number(l.qty) > 0)
        .map((l) => ({
          inventoryItemId: l.inventoryItemId,
          direction: "IN",
          qty: Number(l.qty),
        }));

      if (!movementLines.length) {
        setError("No hay líneas válidas para cargar");
        return;
      }

      await apiJson("/api/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          type: "INVENTORY_COUNT",
          locationCode,
          notes: new Date().toLocaleDateString("es-AR"),
          lines: movementLines,
        }),
      });

      setSuccess(`Inventario cargado exitosamente (${movementLines.length} ítems)`);
      setLines([{ inventoryItemId: items[0]?.id ?? "", qty: "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Entrada de Stock</div>
          <div className="text-sm text-neutral-600">Carga inicial del inventario (toma de stock).</div>
        </div>
        <Link href="/stock" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
          Volver a stock
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      )}

      <div className="rounded-lg border bg-white p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-700">
            Ubicación
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value as any)}
            >
              <option value="BACONA">Bacoña (consumo/venta)</option>
              <option value="SALTA">Salta (origen)</option>
              <option value="EN_TRANSITO">En tránsito</option>
            </select>
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-neutral-700 mb-2">Ítems</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {lines.map((line, idx) => {
              const item = items.find((i) => i.id === line.inventoryItemId);
              return (
                <div key={idx} className="flex gap-2 items-end">
                  <select
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                    value={line.inventoryItemId}
                    onChange={(e) => updateLine(idx, { inventoryItemId: e.target.value })}
                  >
                    <option value="">— Seleccionar ítem —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.displayUnit})
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      className="w-24 rounded-md border px-3 py-2 text-sm"
                      placeholder="Cantidad"
                      value={line.qty}
                      min={0}
                      step="0.001"
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                    />
                    <span className="text-xs text-neutral-600 whitespace-nowrap">
                      {item?.displayUnit || ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border text-sm hover:bg-neutral-50"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                    disabled={lines.length <= 1}
                    title="Quitar línea"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
            onClick={addLine}
          >
            + Agregar ítem
          </button>
        </div>

        <button
          type="button"
          className={canSubmit ? "w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white" : "w-full rounded-md bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500"}
          disabled={!canSubmit || loading}
          onClick={submit}
        >
          {loading ? "Cargando..." : "Confirmar entrada de stock"}
        </button>
      </div>
    </div>
  );
}
