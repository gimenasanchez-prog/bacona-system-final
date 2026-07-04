"use client";

import { Fragment, useMemo, useState } from "react";

import { formatArsFromCents, parseArsToCents } from "@/lib/money";

type Product = {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  categoryId: string;
  categoryName: string;
  isCorporativo: boolean;
};

type PreviewRow = {
  productId: string;
  name: string;
  categoryName: string;
  oldPriceCents: number;
  newPriceCents: number;
};

function centsToArsInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function groupByCategory(products: Product[]) {
  const map = new Map<string, { id: string; name: string; products: Product[] }>();
  for (const p of products) {
    if (!map.has(p.categoryId)) {
      map.set(p.categoryId, { id: p.categoryId, name: p.categoryName, products: [] });
    }
    map.get(p.categoryId)!.products.push(p);
  }
  return [...map.values()];
}

export function PreciosClient({ initial }: { initial: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regularCategories = useMemo(
    () => groupByCategory(products.filter((p) => !p.isCorporativo)),
    [products]
  );
  const corporativoCategories = useMemo(
    () => groupByCategory(products.filter((p) => p.isCorporativo)),
    [products]
  );

  async function patchProduct(id: string, data: Partial<Pick<Product, "name" | "priceCents" | "isActive">>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/gerencia/precios/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Error al actualizar");
        return;
      }
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, name: j.product.name, priceCents: j.product.priceCents, isActive: j.product.isActive }
            : p
        )
      );
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(p: Product) {
    setError(null);
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice(centsToArsInput(p.priceCents));
  }

  async function saveEdit(p: Product) {
    let priceCents: number;
    try {
      priceCents = parseArsToCents(editPrice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Precio inválido");
      return;
    }
    const data: Partial<Pick<Product, "name" | "priceCents">> = {};
    if (editName.trim() && editName.trim() !== p.name) data.name = editName.trim();
    if (priceCents !== p.priceCents) data.priceCents = priceCents;
    if (Object.keys(data).length === 0) {
      setEditingId(null);
      return;
    }
    await patchProduct(p.id, data);
  }

  function renderRow(p: Product) {
    const busy = savingId === p.id;
    const editing = editingId === p.id;
    return (
      <tr key={p.id} className={`border-t ${busy ? "opacity-50" : ""} ${!p.isActive ? "bg-neutral-50" : ""}`}>
        <td className="px-3 py-2 font-medium">
          {editing ? (
            p.isCorporativo ? (
              <span
                className="text-neutral-500"
                title="El nombre de los productos de Tarifas Corporativas no se puede editar: el POS filtra los combos de cada plan por el nombre del producto."
              >
                {p.name}
              </span>
            ) : (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            )
          ) : (
            p.name
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-28 rounded border px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          ) : (
            formatArsFromCents(p.priceCents)
          )}
        </td>
        <td className="px-3 py-2">
          {p.isActive ? (
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Activo
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
              Inactivo
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {editing ? (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => saveEdit(p)}
                disabled={busy}
                className="rounded border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                disabled={busy}
                className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => startEdit(p)}
                disabled={busy}
                className="text-xs text-neutral-700 hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() => patchProduct(p.id, { isActive: !p.isActive })}
                disabled={busy}
                className={`text-xs hover:underline ${p.isActive ? "text-red-600" : "text-green-700"}`}
              >
                {p.isActive ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  }

  function renderCategoryTable(categories: { id: string; name: string; products: Product[] }[]) {
    return (
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <Fragment key={cat.id}>
                <tr className="bg-neutral-50">
                  <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {cat.name}
                  </td>
                </tr>
                {cat.products.map((p) => renderRow(p))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Menú</h2>
        {renderCategoryTable(regularCategories)}
      </section>

      <BulkIncreasePanel
        categories={regularCategories.map((c) => ({ id: c.id, name: c.name }))}
        onApplied={(rows) => {
          setProducts((prev) =>
            prev.map((p) => {
              const found = rows.find((r) => r.productId === p.id);
              return found ? { ...p, priceCents: found.newPriceCents } : p;
            })
          );
        }}
      />

      {corporativoCategories.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800">
            Tarifas corporativas — combos de precio fijo por plan (no incluidos en aumentos masivos)
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-amber-700">
              Estos productos corresponden a los planes corporativos (Corpo 1/2/3). Podés editar su precio,
              pero el nombre está bloqueado: el POS decide qué combos ve cada cliente corporativo buscando
              texto en el nombre del producto, y renombrarlo rompería ese filtro.
            </p>
            {renderCategoryTable(corporativoCategories)}
          </div>
        </details>
      )}
    </div>
  );
}

function BulkIncreasePanel({
  categories,
  onApplied,
}: {
  categories: { id: string; name: string }[];
  onApplied: (rows: PreviewRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categoryIds = [...selected].sort();
  const pct = Number(percent.replace(",", "."));
  const currentKey = JSON.stringify({ categoryIds, pct });
  const previewStale = preview !== null && currentKey !== previewKey;

  function toggleCategory(id: string) {
    setSuccess(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doPreview() {
    setError(null);
    setSuccess(null);
    if (categoryIds.length === 0) {
      setError("Elegí al menos una categoría");
      return;
    }
    if (!Number.isFinite(pct)) {
      setError("Porcentaje inválido");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/gerencia/precios/bulk/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryIds, percent: pct }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Error al previsualizar");
        return;
      }
      setPreview(j.preview);
      setPreviewKey(currentKey);
    } finally {
      setLoading(false);
    }
  }

  async function doApply() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/gerencia/precios/bulk/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryIds, percent: pct }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Error al aplicar el aumento");
        return;
      }
      if (preview) onApplied(preview);
      setSuccess(`${j.updatedCount} productos actualizados`);
      setPreview(null);
      setPreviewKey(null);
      setSelected(new Set());
      setPercent("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold uppercase tracking-wide text-neutral-500"
      >
        Aumento masivo por porcentaje {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs text-neutral-500">Categorías (Corporativo no incluida)</div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                    selected.has(c.id) ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleCategory(c.id)}
                    className="hidden"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Porcentaje (ej: 10 o -5)</label>
              <input
                type="text"
                inputMode="decimal"
                value={percent}
                onChange={(e) => {
                  setPercent(e.target.value);
                  setSuccess(null);
                }}
                placeholder="10"
                className="w-28 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>
            <button
              onClick={doPreview}
              disabled={loading}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Previsualizar
            </button>
            <button
              onClick={doApply}
              disabled={loading || !preview || previewStale}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Aplicando..." : "Confirmar aumento"}
            </button>
          </div>

          {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</p>}

          {preview && (
            <div className="overflow-x-auto rounded-lg border">
              {previewStale && (
                <p className="border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  Cambiaste la selección o el porcentaje — volvé a previsualizar antes de confirmar.
                </p>
              )}
              <table className="w-full text-sm">
                <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-right">Precio actual</th>
                    <th className="px-3 py-2 text-right">Precio nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.productId} className="border-t">
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-neutral-500">{row.categoryName}</td>
                      <td className="px-3 py-2 text-right">{formatArsFromCents(row.oldPriceCents)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatArsFromCents(row.newPriceCents)}</td>
                    </tr>
                  ))}
                  {preview.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-neutral-400">
                        No hay productos activos en las categorías elegidas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
