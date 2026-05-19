"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Uom = {
  id: string;
  label: string;
  unit: string;
  multiplierToBase: string;
  isDefaultForEntry: boolean;
  sortOrder: number;
};

type DashboardItem = {
  id: string;
  name: string;
  unit: string;
  displayUnit: string;
  category: { id: string; name: string };
  targetDaysCover: number;
  currentQty: string;
  recommendedQty: string;
  semaforo: "GREEN" | "YELLOW" | "RED";
};

type Dashboard = {
  location: { id: string; code: string; label: string };
  items: DashboardItem[];
};

type InventoryCategory = { id: string; name: string };
type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  dimension: string;
  displayUnit: string;
  category: InventoryCategory;
  targetDaysCover: number;
  uoms: Uom[];
};

const DIMENSIONS = ["COUNT", "VOLUME", "MASS"] as const;
const UNITS_BY_DIMENSION: Record<string, string[]> = {
  COUNT: ["UN"],
  VOLUME: ["ML", "L"],
  MASS: ["G", "KG"],
};
// Base unit per dimension
const BASE_UNIT: Record<string, string> = { COUNT: "UN", VOLUME: "ML", MASS: "G" };

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
  if (!res.ok) {
    const msg = (json as any)?.error ?? res.statusText;
    throw new Error(msg);
  }
  return json as T;
}

function badgeColor(semaforo: DashboardItem["semaforo"]) {
  if (semaforo === "GREEN") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (semaforo === "YELLOW") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export default function StockPage() {
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  // New item form
  const [newCatName, setNewCatName] = useState("");
  const [newItem, setNewItem] = useState<{
    name: string;
    categoryId: string;
    dimension: string;
    unit: string;
    displayUnit: string;
    targetDaysCover: number;
  }>({ name: "", categoryId: "", dimension: "COUNT", unit: "UN", displayUnit: "UN", targetDaysCover: 14 });

  // Item editor
  const [itemEditor, setItemEditor] = useState<{
    open: boolean;
    item: InventoryItem | null;
    name: string;
    categoryId: string;
    dimension: string;
    unit: string;
    displayUnit: string;
    targetDaysCover: number;
  }>({ open: false, item: null, name: "", categoryId: "", dimension: "COUNT", unit: "UN", displayUnit: "UN", targetDaysCover: 14 });

  // UOM manager (embedded in item editor)
  const [newUom, setNewUom] = useState({ label: "", unit: "UN", multiplierToBase: "1", isDefaultForEntry: false });

  async function refreshAll() {
    const [dash, cats, it] = await Promise.all([
      apiGet<Dashboard>("/api/stock/dashboard"),
      apiGet<{ categories: InventoryCategory[] }>("/api/stock/categories"),
      apiGet<{ items: InventoryItem[] }>("/api/stock/items"),
    ]);
    setDashboard(dash);
    setCategories(cats.categories);
    setItems(it.items);
    setNewItem((prev) => ({ ...prev, categoryId: prev.categoryId || cats.categories[0]?.id || "" }));
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await refreshAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, DashboardItem[]>();
    for (const it of dashboard?.items ?? []) {
      const arr = map.get(it.category.name) ?? [];
      arr.push(it);
      map.set(it.category.name, arr);
    }
    return [...map.entries()];
  }, [dashboard?.items]);

  // When dimension changes, auto-set unit to base unit and displayUnit to same
  function onDimensionChange(dim: string, setter: (fn: (p: any) => any) => void) {
    const base = BASE_UNIT[dim] ?? "UN";
    setter((p) => ({ ...p, dimension: dim, unit: base, displayUnit: base }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Dashboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Stock</div>
            <div className="text-sm text-neutral-600">
              Ubicación: <b>{dashboard?.location.label ?? "—"}</b>
            </div>
          </div>
          <Link href="/stock/movimientos" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
            Ver movimientos
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Dashboard (semaforizado)</div>
          <div className="mt-3 space-y-4">
            {grouped.length === 0 ? (
              <div className="text-sm text-neutral-600">No hay ítems de stock todavía.</div>
            ) : (
              grouped.map(([catName, arr]) => (
                <div key={catName}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{catName}</div>
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-xs text-neutral-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Ítem</th>
                          <th className="px-3 py-2 text-right">Actual</th>
                          <th className="px-3 py-2 text-right">Recomendado</th>
                          <th className="px-3 py-2 text-left">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arr.map((it) => (
                          <tr key={it.id} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{it.name}</div>
                              <div className="text-xs text-neutral-500">
                                Unidad: <b>{it.displayUnit}</b> · Cover: <b>{it.targetDaysCover}d</b>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {it.currentQty} <span className="text-xs text-neutral-500">{it.displayUnit}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {it.recommendedQty} <span className="text-xs text-neutral-500">{it.displayUnit}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeColor(it.semaforo)}`}>
                                {it.semaforo}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-3">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Carga rápida</div>
          <div className="mt-3 space-y-4">
            {/* Nueva categoría */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-neutral-700">Nueva categoría</div>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Limpieza / Descartables / Materia prima"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    try {
                      setError(null);
                      if (!newCatName.trim()) return;
                      await apiJson("/api/stock/categories", { method: "POST", body: JSON.stringify({ name: newCatName.trim() }) });
                      setNewCatName("");
                      await refreshAll();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Crear
                </button>
              </div>
            </div>

            {/* Nuevo ítem */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-neutral-700">Nuevo ítem</div>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ej: Jamón / Aceite / Coca-Cola"
                value={newItem.name}
                onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.categoryId}
                  onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))}
                >
                  <option value="">— Categoría —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.dimension}
                  onChange={(e) => onDimensionChange(e.target.value, setNewItem)}
                >
                  <option value="COUNT">Conteo (UN)</option>
                  <option value="VOLUME">Volumen (ML/L)</option>
                  <option value="MASS">Peso (G/KG)</option>
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-neutral-600">
                  Unidad base (ledger)
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={newItem.unit}
                    onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                  >
                    {(UNITS_BY_DIMENSION[newItem.dimension] ?? ["UN"]).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-600">
                  Unidad de display
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={newItem.displayUnit}
                    onChange={(e) => setNewItem((p) => ({ ...p, displayUnit: e.target.value }))}
                  >
                    {(UNITS_BY_DIMENSION[newItem.dimension] ?? ["UN"]).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-neutral-600">
                  Target days cover
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={newItem.targetDaysCover}
                    onChange={(e) => setNewItem((p) => ({ ...p, targetDaysCover: Number(e.target.value) }))}
                    min={1}
                    max={365}
                  />
                </label>
                <button
                  className="mt-5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    try {
                      setError(null);
                      if (!newItem.name.trim() || !newItem.categoryId) return;
                      await apiJson("/api/stock/items", {
                        method: "POST",
                        body: JSON.stringify({
                          name: newItem.name.trim(),
                          categoryId: newItem.categoryId,
                          unit: newItem.unit,
                          dimension: newItem.dimension,
                          displayUnit: newItem.displayUnit,
                          targetDaysCover: newItem.targetDaysCover,
                        }),
                      });
                      setNewItem((p) => ({ ...p, name: "" }));
                      await refreshAll();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Crear ítem
                </button>
              </div>
            </div>

            <div className="rounded-md border bg-neutral-50 p-3 text-sm text-neutral-700">
              <div className="font-medium">Módulos relacionados</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/compras" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50">Compras</Link>
                <Link href="/produccion" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50">Producción</Link>
                <Link href="/mermas" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50">Mermas</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Items list */}
        <div className="rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Ítems activos</div>
          <div className="mt-2 max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  <th className="px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-neutral-600">{it.category.name}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {it.displayUnit}
                      {it.unit !== it.displayUnit ? (
                        <span className="ml-1 text-xs text-neutral-400">(base: {it.unit})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                          onClick={() => {
                            setNewUom({ label: "", unit: it.unit, multiplierToBase: "1", isDefaultForEntry: false });
                            setItemEditor({
                              open: true,
                              item: it,
                              name: it.name,
                              categoryId: it.category.id,
                              dimension: it.dimension,
                              unit: it.unit,
                              displayUnit: it.displayUnit,
                              targetDaysCover: it.targetDaysCover,
                            });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          onClick={async () => {
                            try {
                              setError(null);
                              if (!window.confirm(`¿Eliminar/desactivar "${it.name}"?`)) return;
                              await apiJson(`/api/stock/items/${it.id}`, { method: "DELETE" });
                              await refreshAll();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Error");
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-neutral-600" colSpan={4}>Sin ítems todavía.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Item editor modal */}
      {itemEditor.open && itemEditor.item ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Editar ítem</div>
                <div className="mt-1 text-sm text-neutral-600">{itemEditor.item.name}</div>
              </div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setItemEditor((p) => ({ ...p, open: false, item: null }))}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-neutral-700 sm:col-span-2">
                Nombre
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.name}
                  onChange={(e) => setItemEditor((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="text-xs text-neutral-700">
                Categoría
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.categoryId}
                  onChange={(e) => setItemEditor((p) => ({ ...p, categoryId: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-700">
                Dimensión
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.dimension}
                  onChange={(e) => onDimensionChange(e.target.value, setItemEditor)}
                >
                  <option value="COUNT">Conteo (UN)</option>
                  <option value="VOLUME">Volumen (ML/L)</option>
                  <option value="MASS">Peso (G/KG)</option>
                </select>
              </label>
              <label className="text-xs text-neutral-700">
                Unidad base (ledger)
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.unit}
                  onChange={(e) => setItemEditor((p) => ({ ...p, unit: e.target.value }))}
                >
                  {(UNITS_BY_DIMENSION[itemEditor.dimension] ?? ["UN"]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-700">
                Unidad de display
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.displayUnit}
                  onChange={(e) => setItemEditor((p) => ({ ...p, displayUnit: e.target.value }))}
                >
                  {(UNITS_BY_DIMENSION[itemEditor.dimension] ?? ["UN"]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-700">
                Target days cover
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={itemEditor.targetDaysCover}
                  min={1}
                  max={365}
                  onChange={(e) => setItemEditor((p) => ({ ...p, targetDaysCover: Number(e.target.value) }))}
                />
              </label>
              <div className="flex items-end sm:col-span-2">
                <button
                  type="button"
                  className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    try {
                      setError(null);
                      if (!itemEditor.item || !itemEditor.name.trim()) return;
                      await apiJson(`/api/stock/items/${itemEditor.item.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          name: itemEditor.name.trim(),
                          categoryId: itemEditor.categoryId,
                          unit: itemEditor.unit,
                          dimension: itemEditor.dimension,
                          displayUnit: itemEditor.displayUnit,
                          targetDaysCover: itemEditor.targetDaysCover,
                        }),
                      });
                      await refreshAll();
                      setItemEditor((p) => ({ ...p, open: false, item: null }));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Guardar cambios
                </button>
              </div>
            </div>

            {/* UOM (presentations) */}
            <div className="mt-5 border-t pt-4">
              <div className="text-xs font-semibold text-neutral-700">Presentaciones (UOM)</div>
              <div className="mt-2 text-xs text-neutral-500">
                Permiten cargar en "botella 750ml", "pack x6", etc. El multiplicador indica cuántas unidades base hay en 1 presentación.
              </div>
              <div className="mt-3 space-y-2">
                {(itemEditor.item.uoms ?? []).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border bg-neutral-50 px-3 py-2 text-xs">
                    <div>
                      <span className="font-medium">{u.label}</span>
                      <span className="ml-2 text-neutral-500">
                        {u.multiplierToBase} {itemEditor.unit} por {u.unit}
                        {u.isDefaultForEntry ? " · default" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800"
                      onClick={async () => {
                        try {
                          setError(null);
                          await apiJson(`/api/stock/items/${itemEditor.item!.id}/uoms/${u.id}`, { method: "DELETE" });
                          await refreshAll();
                          setItemEditor((p) => ({
                            ...p,
                            item: p.item ? { ...p.item, uoms: p.item.uoms.filter((x) => x.id !== u.id) } : null,
                          }));
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error");
                        }
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                {!(itemEditor.item.uoms ?? []).length ? (
                  <div className="text-xs text-neutral-500">Sin presentaciones definidas.</div>
                ) : null}
              </div>

              {/* Add UOM */}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_80px_100px_auto_auto]">
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Botella 750ml"
                  value={newUom.label}
                  onChange={(e) => setNewUom((p) => ({ ...p, label: e.target.value }))}
                />
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={newUom.unit}
                  onChange={(e) => setNewUom((p) => ({ ...p, unit: e.target.value }))}
                >
                  {(UNITS_BY_DIMENSION[itemEditor.dimension] ?? ["UN"]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="rounded-md border px-3 py-2 text-sm"
                  placeholder={`× en ${itemEditor.unit}`}
                  value={newUom.multiplierToBase}
                  min={0.000001}
                  step="any"
                  onChange={(e) => setNewUom((p) => ({ ...p, multiplierToBase: e.target.value }))}
                />
                <label className="flex items-center gap-1 text-xs text-neutral-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={newUom.isDefaultForEntry}
                    onChange={(e) => setNewUom((p) => ({ ...p, isDefaultForEntry: e.target.checked }))}
                  />
                  Default
                </label>
                <button
                  type="button"
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white whitespace-nowrap"
                  onClick={async () => {
                    try {
                      setError(null);
                      if (!newUom.label.trim() || !newUom.multiplierToBase) return;
                      const res = await apiJson<{ uom: Uom }>(`/api/stock/items/${itemEditor.item!.id}/uoms`, {
                        method: "POST",
                        body: JSON.stringify({
                          label: newUom.label.trim(),
                          unit: newUom.unit,
                          multiplierToBase: Number(newUom.multiplierToBase),
                          isDefaultForEntry: newUom.isDefaultForEntry,
                        }),
                      });
                      setNewUom({ label: "", unit: itemEditor.unit, multiplierToBase: "1", isDefaultForEntry: false });
                      setItemEditor((p) => ({
                        ...p,
                        item: p.item ? { ...p.item, uoms: [...(p.item.uoms ?? []), res.uom] } : null,
                      }));
                      await refreshAll();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  + Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
