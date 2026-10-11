"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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

type ItemDetail = {
  directProducts: { productId: string; productName: string; categoryName: string }[];
  recipeProducts: { productId: string; productName: string; categoryName: string; recipeName: string }[];
  productionRecipes: { id: string; name: string }[];      // recetas que PRODUCEN este ítem
  productionConsumers: { id: string; name: string }[];    // recetas de producción que LO USAN como insumo
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

function ItemDetailPanel({ detail }: { detail: ItemDetail | "loading" | "error" }) {
  if (detail === "loading") {
    return <div className="text-xs text-neutral-500">Cargando...</div>;
  }
  if (detail === "error") {
    return <div className="text-xs text-red-600">Error al cargar detalle.</div>;
  }

  const allSaleConsumers = [
    ...detail.directProducts.map((p) => ({ ...p, kind: "directo" as const })),
    ...detail.recipeProducts.map((p) => ({ ...p, kind: "receta" as const })),
  ];

  const hasAnything =
    allSaleConsumers.length > 0 ||
    detail.productionRecipes.length > 0 ||
    detail.productionConsumers.length > 0;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Al vender */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Al vender
          </div>
          {allSaleConsumers.length === 0 ? (
            <div className="text-xs text-neutral-400">Sin productos vinculados.</div>
          ) : (
            <div className="space-y-1">
              {allSaleConsumers.map((p) => (
                <div key={p.productId} className="flex items-start gap-2">
                  <span className="font-medium leading-tight">{p.productName}</span>
                  {p.kind === "directo" ? (
                    <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                      directo
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                      receta
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insumo de producción */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Insumo de producción
          </div>
          {detail.productionConsumers.length === 0 ? (
            <div className="text-xs text-neutral-400">No se usa en ninguna receta de producción.</div>
          ) : (
            <div className="space-y-1.5">
              {detail.productionConsumers.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Link
                    href="/produccion"
                    className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Registrar →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generado por */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Generado por
          </div>
          {detail.productionRecipes.length === 0 ? (
            <div className="text-xs text-neutral-400">No se produce internamente.</div>
          ) : (
            <div className="space-y-1.5">
              {detail.productionRecipes.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Link
                    href="/produccion"
                    className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Registrar →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hasAnything && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sin vínculos registrados. Configurar en{" "}
          <Link href="/stock/admin" className="underline" onClick={(e) => e.stopPropagation()}>
            Gestión de vínculos
          </Link>
          .
        </div>
      )}
    </div>
  );
}

const SEMAFORO_LABEL: Record<DashboardItem["semaforo"], string> = {
  GREEN: "Verde",
  YELLOW: "Amarillo",
  RED: "Rojo",
};

function normalizeText(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const EMPTY_NEW_ITEM = { name: "", categoryId: "", dimension: "COUNT", unit: "UN", displayUnit: "UN", targetDaysCover: 14 };

export default function StockPage() {
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [semaforoFilter, setSemaforoFilter] = useState<DashboardItem["semaforo"] | "">("");

  // Dashboard row expansion
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Map<string, ItemDetail | "loading" | "error">>(new Map());

  function toggleExpand(itemId: string) {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
    if (!detailCache.has(itemId)) {
      setDetailCache((prev) => new Map(prev).set(itemId, "loading"));
      apiGet<ItemDetail>(`/api/stock/items/${itemId}/detail`)
        .then((data) => setDetailCache((prev) => new Map(prev).set(itemId, data)))
        .catch(() => setDetailCache((prev) => new Map(prev).set(itemId, "error")));
    }
  }

  // New item modal
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItem, setNewItem] = useState<{
    name: string;
    categoryId: string;
    dimension: string;
    unit: string;
    displayUnit: string;
    targetDaysCover: number;
  }>(EMPTY_NEW_ITEM);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

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

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  // Items matching search + category (before the semáforo filter, so chip counts reflect them)
  const baseFiltered = useMemo(() => {
    const q = normalizeText(search.trim());
    return (dashboard?.items ?? []).filter(
      (it) => (!q || normalizeText(it.name).includes(q)) && (!categoryFilter || it.category.id === categoryFilter),
    );
  }, [dashboard?.items, search, categoryFilter]);

  const semaforoCounts = useMemo(() => {
    const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
    for (const it of baseFiltered) counts[it.semaforo]++;
    return counts;
  }, [baseFiltered]);

  const grouped = useMemo(() => {
    const map = new Map<string, DashboardItem[]>();
    for (const it of baseFiltered) {
      if (semaforoFilter && it.semaforo !== semaforoFilter) continue;
      const arr = map.get(it.category.name) ?? [];
      arr.push(it);
      map.set(it.category.name, arr);
    }
    return [...map.entries()];
  }, [baseFiltered, semaforoFilter]);

  const hasFilters = !!search.trim() || !!categoryFilter || !!semaforoFilter;

  // When dimension changes, auto-set unit to base unit and displayUnit to same
  function onDimensionChange(dim: string, setter: (fn: (p: any) => any) => void) {
    const base = BASE_UNIT[dim] ?? "UN";
    setter((p) => ({ ...p, dimension: dim, unit: base, displayUnit: base }));
  }

  function openEditor(it: InventoryItem) {
    setError(null);
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
  }

  async function deleteItem(it: { id: string; name: string }) {
    try {
      setError(null);
      if (!window.confirm(`¿Eliminar/desactivar "${it.name}"?`)) return;
      await apiJson(`/api/stock/items/${it.id}`, { method: "DELETE" });
      if (expandedItemId === it.id) setExpandedItemId(null);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  function openNewItem() {
    setError(null);
    setNewCatOpen(false);
    setNewCatName("");
    setNewItem({ ...EMPTY_NEW_ITEM, categoryId: categoryFilter || categories[0]?.id || "" });
    setNewItemOpen(true);
  }

  async function createCategory() {
    try {
      setError(null);
      if (!newCatName.trim()) return;
      const res = await apiJson<{ category: InventoryCategory }>("/api/stock/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      setNewCatName("");
      setNewCatOpen(false);
      await refreshAll();
      setNewItem((p) => ({ ...p, categoryId: res.category.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function createItem() {
    try {
      setError(null);
      if (!newItem.name.trim()) return setError("Falta el nombre del ítem.");
      if (!newItem.categoryId) return setError("Elegí una categoría.");
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
      setNewItemOpen(false);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  const modalError = error ? (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
  ) : null;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Stock</div>
          <div className="text-sm text-neutral-600">
            Ubicación: <b>{dashboard?.location.label ?? "—"}</b>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
            <span>Ir a:</span>
            <Link href="/compras" className="underline hover:text-neutral-800">Compras</Link>
            <Link href="/produccion" className="underline hover:text-neutral-800">Producción</Link>
            <Link href="/mermas" className="underline hover:text-neutral-800">Mermas</Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            onClick={openNewItem}
          >
            + Nuevo ítem
          </button>
          <Link href="/stock/entrada" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            Entrada de stock
          </Link>
          <Link href="/stock/movimientos" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            Ver movimientos
          </Link>
        </div>
      </div>

      {error && !newItemOpen && !itemEditor.open ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="rounded-lg border bg-white p-3">
        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm sm:flex-1">
            <input
              className="w-full rounded-md border px-3 py-2 pr-8 text-sm"
              placeholder="Buscar ítem…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-neutral-400 hover:text-neutral-700"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            ) : null}
          </div>
          <select
            className="rounded-md border px-3 py-2 text-sm sm:w-56"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chipClass(semaforoFilter === "")} onClick={() => setSemaforoFilter("")}>
              Todos ({baseFiltered.length})
            </button>
            {(["RED", "YELLOW", "GREEN"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={chipClass(semaforoFilter === s)}
                onClick={() => setSemaforoFilter((prev) => (prev === s ? "" : s))}
              >
                {SEMAFORO_LABEL[s]} ({semaforoCounts[s]})
              </button>
            ))}
          </div>
          {hasFilters ? (
            <button
              type="button"
              className="text-xs text-neutral-500 underline hover:text-neutral-800 sm:ml-auto"
              onClick={() => {
                setSearch("");
                setCategoryFilter("");
                setSemaforoFilter("");
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {/* Dashboard */}
        <div className="mt-4 space-y-4">
          {!dashboard ? (
            <div className="text-sm text-neutral-600">Cargando…</div>
          ) : dashboard.items.length === 0 ? (
            <div className="text-sm text-neutral-600">No hay ítems de stock todavía.</div>
          ) : grouped.length === 0 ? (
            <div className="text-sm text-neutral-600">
              Sin resultados{search.trim() ? <> para «{search.trim()}»</> : null}.
            </div>
          ) : (
            grouped.map(([catName, arr]) => (
              <div key={catName}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{catName}</div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Ítem</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-right">Recomendado</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arr.map((it) => {
                        const isOpen = expandedItemId === it.id;
                        const detail = detailCache.get(it.id);
                        const full = itemsById.get(it.id);
                        return (
                          <Fragment key={it.id}>
                            <tr
                              className="border-t cursor-pointer hover:bg-neutral-50"
                              onClick={() => toggleExpand(it.id)}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-neutral-400 text-xs select-none">
                                    {isOpen ? "▼" : "▶"}
                                  </span>
                                  <div>
                                    <div className="font-medium">{it.name}</div>
                                    <div className="text-xs text-neutral-500">
                                      Unidad: <b>{it.displayUnit}</b> · Cobertura: <b>{it.targetDaysCover}d</b>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right">
                                {it.currentQty} <span className="text-xs text-neutral-500">{it.displayUnit}</span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right">
                                {it.recommendedQty} <span className="text-xs text-neutral-500">{it.displayUnit}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeColor(it.semaforo)}`}>
                                  {SEMAFORO_LABEL[it.semaforo]}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
                                    disabled={!full}
                                    onClick={() => full && openEditor(full)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                    onClick={() => deleteItem(it)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="border-t bg-neutral-50">
                                <td colSpan={5} className="px-4 py-3">
                                  <ItemDetailPanel detail={detail ?? "loading"} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New item modal */}
      {newItemOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-base font-semibold">Nuevo ítem de stock</div>
              <button type="button" className="rounded-md border px-2 py-1 text-sm" onClick={() => setNewItemOpen(false)}>
                Cerrar
              </button>
            </div>

            {modalError}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-neutral-700 sm:col-span-2">
                Nombre
                <input
                  autoFocus
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Jamón / Aceite / Coca-Cola"
                  value={newItem.name}
                  onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <div className="text-xs text-neutral-700 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span>Categoría</span>
                  {!newCatOpen ? (
                    <button type="button" className="text-xs underline hover:text-neutral-900" onClick={() => setNewCatOpen(true)}>
                      + Nueva categoría
                    </button>
                  ) : null}
                </div>
                {newCatOpen ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      autoFocus
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Ej: Limpieza / Descartables"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createCategory();
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                      onClick={createCategory}
                    >
                      Crear
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => {
                        setNewCatOpen(false);
                        setNewCatName("");
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={newItem.categoryId}
                    onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))}
                  >
                    <option value="">— Categoría —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <label className="text-xs text-neutral-700">
                Tipo de medida
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.dimension}
                  onChange={(e) => onDimensionChange(e.target.value, setNewItem)}
                >
                  <option value="COUNT">Conteo (UN)</option>
                  <option value="VOLUME">Volumen (ML/L)</option>
                  <option value="MASS">Peso (G/KG)</option>
                </select>
              </label>
              <label className="text-xs text-neutral-700">
                Días de cobertura
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.targetDaysCover}
                  onChange={(e) => setNewItem((p) => ({ ...p, targetDaysCover: Number(e.target.value) }))}
                  min={1}
                  max={365}
                />
              </label>
              <label className="text-xs text-neutral-700">
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
              <label className="text-xs text-neutral-700">
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
              <button
                type="button"
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white sm:col-span-2"
                onClick={createItem}
              >
                Crear ítem
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

            {modalError}

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
                Tipo de medida
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
                Días de cobertura
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
