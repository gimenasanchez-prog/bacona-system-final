"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

type Product = {
  id: string;
  name: string;
  categoryName: string;
  inventoryItemId: string | null;
  consumptionRecipeVersionId: string | null;
};

type Props = {
  product: Product;
  inventoryItems: InventoryItem[];
  consumptionRecipes: ConsumptionRecipe[];
  productionByOutputItemId: Record<string, ProductionRef>;
  onClose: () => void;
};

type LinkType = "NONE" | "ITEM" | "RECIPE";

function fmtQty(s: string) {
  const n = parseFloat(s);
  return n % 1 === 0 ? String(Math.round(n)) : s;
}

function currentLinkType(p: Product): LinkType {
  if (p.consumptionRecipeVersionId) return "RECIPE";
  if (p.inventoryItemId) return "ITEM";
  return "NONE";
}

export function StockLinkEditorModal({
  product,
  inventoryItems,
  consumptionRecipes,
  productionByOutputItemId,
  onClose,
}: Props) {
  const router = useRouter();

  const [type, setType] = useState<LinkType>(currentLinkType(product));
  const [itemId, setItemId] = useState<string>(product.inventoryItemId ?? "");
  const [recipeVersionId, setRecipeVersionId] = useState<string>(
    product.consumptionRecipeVersionId ?? "",
  );
  const [itemSearch, setItemSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredItems = inventoryItems.filter((it) =>
    it.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  const selectedRecipe = consumptionRecipes.find(
    (r) => r.activeVersion?.id === recipeVersionId,
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body =
        type === "ITEM"
          ? { type: "ITEM", itemId }
          : type === "RECIPE"
            ? { type: "RECIPE", recipeVersionId }
            : { type: "NONE" };

      const res = await fetch(`/api/pos/products/${product.id}/stock-link`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Error al guardar");
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    type === "NONE" ||
    (type === "ITEM" && !!itemId) ||
    (type === "RECIPE" && !!recipeVersionId);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onBackdropClick}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{product.name}</div>
            <div className="text-xs text-neutral-500">{product.categoryName} · Editar vínculo de stock</div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Link type selector */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Tipo de vínculo
            </div>
            <div className="flex flex-col gap-2">
              {(["NONE", "ITEM", "RECIPE"] as LinkType[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-neutral-50">
                  <input
                    type="radio"
                    name="linkType"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-neutral-900"
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {t === "NONE" && "Sin link"}
                      {t === "ITEM" && "Ítem directo"}
                      {t === "RECIPE" && "Receta de consumo"}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {t === "NONE" && "No descuenta stock al vender"}
                      {t === "ITEM" && "Descuenta 1 unidad de un insumo al vender"}
                      {t === "RECIPE" && "Descuenta los ingredientes de una receta al vender"}
                    </div>
                  </div>
                  {currentLinkType(product) === t && (
                    <span className="ml-auto text-xs text-neutral-400">actual</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Item picker */}
          {type === "ITEM" && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Seleccionar insumo
              </div>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Buscar insumo..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {filteredItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-neutral-500">Sin resultados</div>
                ) : (
                  filteredItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setItemId(it.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                        itemId === it.id ? "bg-blue-50 font-medium text-blue-800" : ""
                      }`}
                    >
                      <span>{it.name}</span>
                      <span className="text-xs text-neutral-400">{it.unit}</span>
                    </button>
                  ))
                )}
              </div>
              {itemId && (
                <div className="text-xs text-blue-700">
                  Seleccionado:{" "}
                  <b>{inventoryItems.find((i) => i.id === itemId)?.name}</b>
                </div>
              )}
            </div>
          )}

          {/* Recipe picker */}
          {type === "RECIPE" && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Seleccionar receta de consumo
              </div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={recipeVersionId}
                onChange={(e) => setRecipeVersionId(e.target.value)}
              >
                <option value="">— Elegir receta —</option>
                {consumptionRecipes.map((r) =>
                  r.activeVersion ? (
                    <option key={r.activeVersion.id} value={r.activeVersion.id}>
                      {r.name}
                    </option>
                  ) : null,
                )}
              </select>

              {/* Recipe preview */}
              {selectedRecipe?.activeVersion && (
                <div className="rounded-md border bg-neutral-50 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Ingredientes que descuenta
                  </div>
                  {selectedRecipe.activeVersion.lines.length === 0 ? (
                    <div className="text-sm text-neutral-400">Sin ingredientes definidos.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedRecipe.activeVersion.lines.map((l) => {
                        const prod = productionByOutputItemId[l.inventoryItemId];
                        return (
                          <div key={l.inventoryItemId} className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              <span className="font-medium">{l.itemName}</span>{" "}
                              <span className="text-neutral-500">
                                {fmtQty(l.qty)} {l.unit}
                              </span>
                            </span>
                            {prod && (
                              <a
                                href="/produccion"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200"
                                title={`Producida en: ${prod.recipeName}`}
                              >
                                ↗ {prod.recipeName}
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
