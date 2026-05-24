import { Fragment } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { StockAdminService } from "@/modules/stock/services/stockAdminService";

function fmtQty(qty: { toString(): string }) {
  const n = parseFloat(qty.toString());
  return n % 1 === 0 ? String(Math.round(n)) : n.toString();
}

export default async function StockAdminPage() {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") redirect("/");

  const { products, productionRecipes, consumptionRecipes } =
    await StockAdminService.getAuditData();

  const withRecipe = products.filter((p) => p.consumptionRecipeVersionId !== null);
  const withItem = products.filter(
    (p) => p.inventoryItemId !== null && p.consumptionRecipeVersionId === null,
  );
  const noLink = products.filter(
    (p) => !p.consumptionRecipeVersionId && !p.inventoryItemId,
  );

  // Group by category; within each category: no-link first, then alphabetically
  const catMap = new Map<string, typeof products>();
  for (const p of products) {
    const arr = catMap.get(p.category.name) ?? [];
    arr.push(p);
    catMap.set(p.category.name, arr);
  }
  for (const arr of catMap.values()) {
    arr.sort((a, b) => {
      const aNo = !a.consumptionRecipeVersionId && !a.inventoryItemId;
      const bNo = !b.consumptionRecipeVersionId && !b.inventoryItemId;
      if (aNo !== bNo) return aNo ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
  }
  const sortedCategories = [...catMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "es"),
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold">Auditoría de Stock</div>
        <div className="text-sm text-neutral-500">Solo lectura · Verificación de vínculos</div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Productos activos</div>
          <div className="mt-1 text-2xl font-bold">{products.length}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Con receta de consumo</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{withRecipe.length}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Con item directo</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{withItem.length}</div>
        </div>
        <div
          className={`rounded-lg border p-3 ${noLink.length > 0 ? "border-red-200 bg-red-50" : "bg-white"}`}
        >
          <div className="text-xs text-neutral-500">Sin link de stock</div>
          <div
            className={`mt-1 text-2xl font-bold ${noLink.length > 0 ? "text-red-700" : "text-neutral-900"}`}
          >
            {noLink.length}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Recetas de producción</div>
          <div className="mt-1 text-2xl font-bold">{productionRecipes.length}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Recetas de consumo</div>
          <div className="mt-1 text-2xl font-bold">{consumptionRecipes.length}</div>
        </div>
      </div>

      {/* Products table */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">Productos y vínculos de stock</div>
          <div className="mt-0.5 text-xs text-neutral-500">
            Los productos sin link no descuentan stock al vender. Aparecen primero en cada
            categoría.
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Vinculado a</th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map(([catName, prods]) => (
                <Fragment key={catName}>
                  <tr className="bg-neutral-50">
                    <td
                      colSpan={4}
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500"
                    >
                      {catName}
                    </td>
                  </tr>
                  {prods.map((p) => {
                    const hasRecipe = !!p.consumptionRecipeVersionId;
                    const hasItem = !!p.inventoryItemId;
                    const linked = hasRecipe || hasItem;
                    return (
                      <tr key={p.id} className={`border-t ${!linked ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-neutral-500">{p.category.name}</td>
                        <td className="px-3 py-2">
                          {hasRecipe ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Receta
                            </span>
                          ) : hasItem ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              Item directo
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                              Sin link
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">
                          {hasRecipe
                            ? p.consumptionRecipeVersion?.recipe.name
                            : hasItem
                              ? p.inventoryItem?.name
                              : <span className="text-red-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production recipes */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">
            Recetas de Producción ({productionRecipes.length})
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            Insumos elaborados in situ: panes, mayos, prepizzas, etc. Clic para expandir.
          </div>
        </div>
        <div className="divide-y">
          {productionRecipes.map((r) => {
            const v = r.versions[0];
            const inputs = v?.lines.filter((l) => l.direction === "OUT") ?? [];
            const outputs = v?.lines.filter((l) => l.direction === "IN") ?? [];
            return (
              <details key={r.id}>
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-neutral-50 list-none">
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="text-xs text-neutral-500">
                    {inputs.length} insumos → {outputs.length} productos
                  </span>
                </summary>
                <div className="border-t bg-neutral-50 px-4 py-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Egresa (inputs)
                      </div>
                      {inputs.length ? (
                        <div className="space-y-1">
                          {inputs.map((l) => (
                            <div key={l.id} className="text-sm">
                              {l.inventoryItem.name}:{" "}
                              <span className="font-medium">{fmtQty(l.qty)}</span>{" "}
                              <span className="text-neutral-500">{l.inventoryItem.unit}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-neutral-400">Sin inputs definidos.</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Ingresa (outputs)
                      </div>
                      {outputs.length ? (
                        <div className="space-y-1">
                          {outputs.map((l) => (
                            <div key={l.id} className="text-sm">
                              {l.inventoryItem.name}:{" "}
                              <span className="font-medium">{fmtQty(l.qty)}</span>{" "}
                              <span className="text-neutral-500">{l.inventoryItem.unit}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-neutral-400">Sin outputs definidos.</div>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
          {!productionRecipes.length && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              Sin recetas de producción cargadas.
            </div>
          )}
        </div>
      </div>

      {/* Consumption recipes */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">
            Recetas de Consumo ({consumptionRecipes.length})
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            Qué ingredientes descuenta cada producto al venderse. Clic para expandir.
          </div>
        </div>
        <div className="divide-y">
          {consumptionRecipes.map((r) => {
            const v = r.versions[0];
            const ingredients = v?.lines.filter((l) => l.direction === "OUT") ?? [];
            const linked = v?.productConsumptionLinks ?? [];
            return (
              <details key={r.id}>
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-neutral-50 list-none">
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="text-xs">
                    {linked.length > 0 ? (
                      <span className="text-emerald-700">
                        {linked[0].name}
                        {linked.length > 1 ? ` +${linked.length - 1}` : ""}
                      </span>
                    ) : (
                      <span className="text-amber-600">Sin producto vinculado</span>
                    )}
                  </span>
                </summary>
                <div className="border-t bg-neutral-50 px-4 py-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Ingredientes
                      </div>
                      {ingredients.length ? (
                        <div className="space-y-1">
                          {ingredients.map((l) => (
                            <div key={l.id} className="text-sm">
                              {l.inventoryItem.name}:{" "}
                              <span className="font-medium">{fmtQty(l.qty)}</span>{" "}
                              <span className="text-neutral-500">{l.inventoryItem.unit}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-neutral-400">Sin ingredientes definidos.</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Productos POS vinculados
                      </div>
                      {linked.length ? (
                        <div className="space-y-1">
                          {linked.map((p) => (
                            <div key={p.name} className="text-sm font-medium">
                              {p.name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-amber-700">
                          Ningún producto usa esta receta todavía.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
          {!consumptionRecipes.length && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              Sin recetas de consumo cargadas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
