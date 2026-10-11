"use client";

import { useMemo, useState } from "react";

import { StockLinkEditorModal } from "./StockLinkEditorModal";

export type AuditProduct = {
  id: string;
  name: string;
  category: { id: string; name: string };
  inventoryItemId: string | null;
  consumptionRecipeVersionId: string | null;
  recipeName: string | null;
  inventoryItemName: string | null;
};

type RecipeLineView = { id: string; itemName: string; qty: string; unit: string };

export type AuditRecipe = {
  id: string;
  name: string;
  groupName: string;
  inputs: RecipeLineView[];
  outputs: RecipeLineView[];
  linkedProducts: string[];
};

type InventoryItem = { id: string; name: string; unit: string };

type ConsumptionRecipeForModal = {
  id: string;
  name: string;
  activeVersion: {
    id: string;
    lines: { inventoryItemId: string; itemName: string; qty: string; unit: string }[];
  } | null;
};

type Props = {
  products: AuditProduct[];
  productionRecipes: AuditRecipe[];
  consumptionRecipes: AuditRecipe[];
  inventoryItems: InventoryItem[];
  consumptionRecipesForModal: ConsumptionRecipeForModal[];
  productionByOutputItemId: Record<string, { recipeId: string; recipeName: string }>;
};

type Tab = "PRODUCTS" | "CONSUMPTION" | "PRODUCTION";
type ProductStatus = "RECIPE" | "ITEM" | "NONE";

function productStatus(p: AuditProduct): ProductStatus {
  if (p.consumptionRecipeVersionId) return "RECIPE";
  if (p.inventoryItemId) return "ITEM";
  return "NONE";
}

function isIncomplete(r: AuditRecipe, tab: Tab) {
  return !r.inputs.length || (tab === "PRODUCTION" && !r.outputs.length);
}

function normalizeText(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
}

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${
    active ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
  }`;

function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === "RECIPE")
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Receta</span>
    );
  if (status === "ITEM")
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Ítem directo</span>
    );
  return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Sin link</span>;
}

function LineList({ lines, empty }: { lines: RecipeLineView[]; empty: string }) {
  if (!lines.length) return <div className="text-sm text-neutral-400">{empty}</div>;
  return (
    <div className="space-y-1">
      {lines.map((l) => (
        <div key={l.id} className="text-sm">
          {l.itemName}: <span className="font-medium">{l.qty}</span> <span className="text-neutral-500">{l.unit}</span>
        </div>
      ))}
    </div>
  );
}

function GroupHeader({
  name,
  count,
  open,
  disabled,
  onToggle,
  badges,
}: {
  name: string;
  count: number;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  badges?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-50"
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="w-3 select-none text-xs text-neutral-400">{open ? "▼" : "▶"}</span>
      <span className="text-sm font-semibold uppercase tracking-wide text-neutral-700">{name}</span>
      <span className="text-xs text-neutral-500">{count}</span>
      <span className="ml-auto flex gap-1.5">{badges}</span>
    </button>
  );
}

export function AuditView({
  products,
  productionRecipes,
  consumptionRecipes,
  inventoryItems,
  consumptionRecipesForModal,
  productionByOutputItemId,
}: Props) {
  const [tab, setTab] = useState<Tab>("PRODUCTS");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [productFilter, setProductFilter] = useState<ProductStatus | "">("");
  const [recipeFilter, setRecipeFilter] = useState<"LINKED" | "UNLINKED" | "INCOMPLETE" | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AuditProduct | null>(null);

  const q = normalizeText(search.trim());
  const hasFilters = !!q || !!group || (tab === "PRODUCTS" ? !!productFilter : !!recipeFilter);

  function switchTab(t: Tab) {
    setTab(t);
    setGroup("");
    setRecipeFilter("");
    setProductFilter("");
  }

  function clearFilters() {
    setSearch("");
    setGroup("");
    setProductFilter("");
    setRecipeFilter("");
  }

  const counts = useMemo(() => {
    const c = { RECIPE: 0, ITEM: 0, NONE: 0 };
    for (const p of products) c[productStatus(p)]++;
    return c;
  }, [products]);

  // ── Products ──
  const productsBase = useMemo(
    () =>
      products.filter(
        (p) =>
          (!q || [p.name, p.recipeName ?? "", p.inventoryItemName ?? ""].some((s) => normalizeText(s).includes(q))) &&
          (!group || p.category.name === group),
      ),
    [products, q, group],
  );
  const productGroups = useMemo(() => {
    const rows = productFilter ? productsBase.filter((p) => productStatus(p) === productFilter) : productsBase;
    const groups = groupBy(rows, (p) => p.category.name);
    // Dentro de cada categoría: sin link primero, después alfabético
    for (const [, arr] of groups) {
      arr.sort((a, b) => {
        const aNo = productStatus(a) === "NONE";
        const bNo = productStatus(b) === "NONE";
        if (aNo !== bNo) return aNo ? -1 : 1;
        return a.name.localeCompare(b.name, "es");
      });
    }
    return groups;
  }, [productsBase, productFilter]);

  // ── Recipes (consumption / production) ──
  const recipes = tab === "PRODUCTION" ? productionRecipes : consumptionRecipes;
  const recipesBase = useMemo(
    () =>
      recipes.filter(
        (r) =>
          (!q ||
            [r.name, ...r.inputs.map((l) => l.itemName), ...r.outputs.map((l) => l.itemName), ...r.linkedProducts].some(
              (s) => normalizeText(s).includes(q),
            )) &&
          (!group || r.groupName === group),
      ),
    [recipes, q, group],
  );
  const recipeGroups = useMemo(() => {
    const rows = recipesBase.filter((r) => {
      if (recipeFilter === "LINKED") return r.linkedProducts.length > 0;
      if (recipeFilter === "UNLINKED") return r.linkedProducts.length === 0;
      if (recipeFilter === "INCOMPLETE") return isIncomplete(r, tab);
      return true;
    });
    return groupBy(rows, (r) => r.groupName);
  }, [recipesBase, recipeFilter, tab]);

  const groupOptions = useMemo(() => {
    const names = tab === "PRODUCTS" ? products.map((p) => p.category.name) : recipes.map((r) => r.groupName);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "es"));
  }, [tab, products, recipes]);

  const currentGroups = tab === "PRODUCTS" ? productGroups : recipeGroups;
  const isOpen = (name: string) => hasFilters || expanded.has(`${tab}:${name}`);
  function toggleGroup(name: string) {
    const key = `${tab}:${name}`;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tabs: [Tab, string, number][] = [
    ["PRODUCTS", "Productos POS", products.length],
    ["CONSUMPTION", "Recetas de consumo", consumptionRecipes.length],
    ["PRODUCTION", "Recetas de producción", productionRecipes.length],
  ];

  const summaryCards: [ProductStatus | "", string, number, string][] = [
    ["", "Productos activos", products.length, "text-neutral-900"],
    ["RECIPE", "Con receta de consumo", counts.RECIPE, "text-emerald-700"],
    ["ITEM", "Con ítem directo", counts.ITEM, "text-blue-700"],
    ["NONE", "Sin link de stock", counts.NONE, counts.NONE > 0 ? "text-red-700" : "text-neutral-900"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">Auditoría de recetas y vínculos</div>
        <div className="text-sm text-neutral-500">
          Qué descuenta cada producto del stock al venderse, y qué insumos usa cada receta.
        </div>
      </div>

      {/* Summary cards — clic para filtrar productos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map(([status, label, value, color]) => {
          const active = tab === "PRODUCTS" && productFilter === status && (status !== "" || !hasFilters);
          const alert = status === "NONE" && value > 0;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setTab("PRODUCTS");
                setSearch("");
                setGroup("");
                setProductFilter(status);
              }}
              className={`rounded-lg border p-3 text-left hover:border-neutral-400 ${alert ? "border-red-200 bg-red-50" : "bg-white"} ${
                active ? "ring-2 ring-neutral-900" : ""
              }`}
            >
              <div className="text-xs text-neutral-500">{label}</div>
              <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border bg-white">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b px-2 pt-2">
          {tabs.map(([t, label, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm ${
                tab === t ? "border-neutral-900 font-semibold text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {label} <span className="text-xs text-neutral-400">({n})</span>
            </button>
          ))}
        </div>

        <div className="p-3">
          <div className="text-xs text-neutral-500">
            {tab === "PRODUCTS"
              ? "Los productos sin link no descuentan stock al vender. Aparecen primero en cada categoría."
              : tab === "CONSUMPTION"
                ? "Ingredientes que descuenta cada producto al venderse. Agrupadas por la categoría del producto que las usa."
                : "Insumos elaborados en el local (panes, mayos, prepizzas…). Agrupadas por la categoría de lo que producen."}
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-72">
              <input
                className="w-full rounded-md border px-3 py-2 pr-8 text-sm"
                placeholder={tab === "PRODUCTS" ? "Buscar producto, receta o ítem…" : "Buscar receta o ingrediente…"}
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
            <select className="rounded-md border px-3 py-2 text-sm sm:w-56" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Todas las categorías</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {tab === "PRODUCTS" ? (
                <>
                  <button type="button" className={chipClass(productFilter === "")} onClick={() => setProductFilter("")}>
                    Todos ({productsBase.length})
                  </button>
                  {([["NONE", "Sin link"], ["RECIPE", "Receta"], ["ITEM", "Ítem directo"]] as const).map(([s, label]) => (
                    <button
                      key={s}
                      type="button"
                      className={chipClass(productFilter === s)}
                      onClick={() => setProductFilter((prev) => (prev === s ? "" : s))}
                    >
                      {label} ({productsBase.filter((p) => productStatus(p) === s).length})
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button type="button" className={chipClass(recipeFilter === "")} onClick={() => setRecipeFilter("")}>
                    Todas ({recipesBase.length})
                  </button>
                  {tab === "CONSUMPTION" ? (
                    <>
                      <button
                        type="button"
                        className={chipClass(recipeFilter === "UNLINKED")}
                        onClick={() => setRecipeFilter((p) => (p === "UNLINKED" ? "" : "UNLINKED"))}
                      >
                        Sin producto ({recipesBase.filter((r) => !r.linkedProducts.length).length})
                      </button>
                      <button
                        type="button"
                        className={chipClass(recipeFilter === "LINKED")}
                        onClick={() => setRecipeFilter((p) => (p === "LINKED" ? "" : "LINKED"))}
                      >
                        Con producto ({recipesBase.filter((r) => r.linkedProducts.length > 0).length})
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={chipClass(recipeFilter === "INCOMPLETE")}
                    onClick={() => setRecipeFilter((p) => (p === "INCOMPLETE" ? "" : "INCOMPLETE"))}
                  >
                    Incompletas ({recipesBase.filter((r) => isIncomplete(r, tab)).length})
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-3 text-xs text-neutral-500 sm:ml-auto">
              {hasFilters ? (
                <button type="button" className="underline hover:text-neutral-800" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="underline hover:text-neutral-800"
                    onClick={() =>
                      setExpanded((prev) => new Set([...prev, ...currentGroups.map(([n]) => `${tab}:${n}`)]))
                    }
                  >
                    Expandir todo
                  </button>
                  <button
                    type="button"
                    className="underline hover:text-neutral-800"
                    onClick={() => setExpanded((prev) => new Set([...prev].filter((k) => !k.startsWith(`${tab}:`))))}
                  >
                    Contraer todo
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Groups */}
          <div className="mt-3 space-y-2">
            {currentGroups.length === 0 ? (
              <div className="py-4 text-sm text-neutral-600">
                {hasFilters ? <>Sin resultados{search.trim() ? <> para «{search.trim()}»</> : null}.</> : "No hay nada cargado todavía."}
              </div>
            ) : tab === "PRODUCTS" ? (
              productGroups.map(([catName, prods]) => {
                const open = isOpen(catName);
                const noLink = prods.filter((p) => productStatus(p) === "NONE").length;
                return (
                  <div key={catName} className="rounded-md border">
                    <GroupHeader
                      name={catName}
                      count={prods.length}
                      open={open}
                      disabled={hasFilters}
                      onToggle={() => toggleGroup(catName)}
                      badges={
                        noLink > 0 ? (
                          <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                            {noLink} sin link
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Todo vinculado
                          </span>
                        )
                      }
                    />
                    {open ? (
                      <div className="overflow-x-auto border-t">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-50 text-xs text-neutral-600">
                            <tr>
                              <th className="px-3 py-2 text-left">Producto</th>
                              <th className="px-3 py-2 text-left">Estado</th>
                              <th className="px-3 py-2 text-left">Vinculado a</th>
                              <th className="px-3 py-2 text-right"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {prods.map((p) => {
                              const status = productStatus(p);
                              return (
                                <tr key={p.id} className={`border-t ${status === "NONE" ? "bg-red-50" : ""}`}>
                                  <td className="px-3 py-2 font-medium">{p.name}</td>
                                  <td className="px-3 py-2">
                                    <StatusBadge status={status} />
                                  </td>
                                  <td className="px-3 py-2 text-neutral-600">
                                    {status === "RECIPE" ? p.recipeName : status === "ITEM" ? p.inventoryItemName : <span className="text-red-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setEditing(p)}
                                      className="whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-xs hover:bg-neutral-50"
                                    >
                                      Editar vínculo
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              recipeGroups.map(([groupName, rows]) => {
                const open = isOpen(groupName);
                const incomplete = rows.filter((r) => isIncomplete(r, tab)).length;
                return (
                  <div key={groupName} className="rounded-md border">
                    <GroupHeader
                      name={groupName}
                      count={rows.length}
                      open={open}
                      disabled={hasFilters}
                      onToggle={() => toggleGroup(groupName)}
                      badges={
                        incomplete > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {incomplete} incompleta{incomplete === 1 ? "" : "s"}
                          </span>
                        ) : null
                      }
                    />
                    {open ? (
                      <div className="divide-y border-t">
                        {rows.map((r) => {
                          const rOpen = openRecipeId === r.id;
                          return (
                            <div key={r.id}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
                                onClick={() => setOpenRecipeId(rOpen ? null : r.id)}
                              >
                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                  <span className="select-none text-xs text-neutral-400">{rOpen ? "▼" : "▶"}</span>
                                  {r.name}
                                </span>
                                <span className="shrink-0 text-xs">
                                  {tab === "PRODUCTION" ? (
                                    <span className={isIncomplete(r, tab) ? "text-amber-600" : "text-neutral-500"}>
                                      {r.inputs.length} insumos → {r.outputs.length} productos
                                    </span>
                                  ) : r.linkedProducts.length > 0 ? (
                                    <span className="text-emerald-700">
                                      {r.linkedProducts[0]}
                                      {r.linkedProducts.length > 1 ? ` +${r.linkedProducts.length - 1}` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">Sin producto vinculado</span>
                                  )}
                                </span>
                              </button>
                              {rOpen ? (
                                <div className="grid gap-4 bg-neutral-50 px-4 py-3 sm:grid-cols-2">
                                  <div>
                                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                      {tab === "PRODUCTION" ? "Egresa (insumos)" : "Ingredientes"}
                                    </div>
                                    <LineList
                                      lines={r.inputs}
                                      empty={tab === "PRODUCTION" ? "Sin insumos definidos." : "Sin ingredientes definidos."}
                                    />
                                  </div>
                                  <div>
                                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                      {tab === "PRODUCTION" ? "Ingresa (producido)" : "Productos POS vinculados"}
                                    </div>
                                    {tab === "PRODUCTION" ? (
                                      <LineList lines={r.outputs} empty="Sin productos de salida definidos." />
                                    ) : r.linkedProducts.length ? (
                                      <div className="space-y-1">
                                        {r.linkedProducts.map((name) => (
                                          <div key={name} className="text-sm font-medium">{name}</div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-amber-700">Ningún producto usa esta receta todavía.</div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {editing && (
        <StockLinkEditorModal
          product={{
            id: editing.id,
            name: editing.name,
            categoryName: editing.category.name,
            inventoryItemId: editing.inventoryItemId,
            consumptionRecipeVersionId: editing.consumptionRecipeVersionId,
          }}
          inventoryItems={inventoryItems}
          consumptionRecipes={consumptionRecipesForModal}
          productionByOutputItemId={productionByOutputItemId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
