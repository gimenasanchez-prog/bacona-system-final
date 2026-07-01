"use client";

import { Fragment, useState } from "react";

import { StockLinkEditorModal } from "./StockLinkEditorModal";

type Category = { id: string; name: string };

type ProductRow = {
  id: string;
  name: string;
  isActive: boolean;
  category: Category;
  inventoryItemId: string | null;
  consumptionRecipeVersionId: string | null;
  consumptionRecipeVersion: { recipe: { name: string } } | null;
  inventoryItem: { name: string } | null;
};

type InventoryItem = { id: string; name: string; unit: string };

type ConsumptionRecipe = {
  id: string;
  name: string;
  activeVersion: {
    id: string;
    lines: { inventoryItemId: string; itemName: string; qty: string; unit: string }[];
  } | null;
};

type ProductionRef = { recipeId: string; recipeName: string };

type Props = {
  sortedCategories: [string, ProductRow[]][];
  inventoryItems: InventoryItem[];
  consumptionRecipes: ConsumptionRecipe[];
  productionByOutputItemId: Record<string, ProductionRef>;
};

export function ProductsTable({
  sortedCategories,
  inventoryItems,
  consumptionRecipes,
  productionByOutputItemId,
}: Props) {
  const [editing, setEditing] = useState<ProductRow | null>(null);

  return (
    <>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Vinculado a</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map(([catName, prods]) => (
              <Fragment key={catName}>
                <tr className="bg-neutral-50">
                  <td
                    colSpan={5}
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
                            Ítem directo
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
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                        >
                          Editar vínculo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
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
          consumptionRecipes={consumptionRecipes}
          productionByOutputItemId={productionByOutputItemId}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
