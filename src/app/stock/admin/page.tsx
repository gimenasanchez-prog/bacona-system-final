import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { StockAdminService } from "@/modules/stock/services/stockAdminService";
import { AuditView, type AuditProduct, type AuditRecipe } from "./AuditView";

function fmtQty(qty: { toString(): string }) {
  const n = parseFloat(qty.toString());
  return n % 1 === 0 ? String(Math.round(n)) : n.toString();
}

export default async function StockAdminPage() {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") redirect("/");

  const {
    products,
    productionRecipes,
    consumptionRecipes,
    inventoryItems,
    consumptionRecipesForModal,
    productionByOutputItemId,
  } = await StockAdminService.getAuditData();

  // Shape for the client view (plain strings, no Decimals)
  const auditProducts: AuditProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: { id: p.category.id, name: p.category.name },
    inventoryItemId: p.inventoryItemId,
    consumptionRecipeVersionId: p.consumptionRecipeVersionId,
    recipeName: p.consumptionRecipeVersion?.recipe.name ?? null,
    inventoryItemName: p.inventoryItem?.name ?? null,
  }));

  const lineOf = (l: { id: string; qty: { toString(): string }; inventoryItem: { name: string; unit: string } }) => ({
    id: l.id,
    itemName: l.inventoryItem.name,
    qty: fmtQty(l.qty),
    unit: l.inventoryItem.unit,
  });

  // Producción: se agrupa por la categoría de stock de lo que produce
  const auditProduction: AuditRecipe[] = productionRecipes.map((r) => {
    const lines = r.versions[0]?.lines ?? [];
    const inputs = lines.filter((l) => l.direction === "OUT");
    const outputs = lines.filter((l) => l.direction === "IN");
    return {
      id: r.id,
      name: r.name,
      groupName: outputs[0]?.inventoryItem.category.name ?? "Sin producto de salida",
      inputs: inputs.map(lineOf),
      outputs: outputs.map(lineOf),
      linkedProducts: [],
    };
  });

  // Consumo: se agrupa por la categoría POS del producto que la usa
  const auditConsumption: AuditRecipe[] = consumptionRecipes.map((r) => {
    const v = r.versions[0];
    const linked = v?.productConsumptionLinks ?? [];
    return {
      id: r.id,
      name: r.name,
      groupName: linked[0]?.category.name ?? "Sin producto vinculado",
      inputs: (v?.lines ?? []).filter((l) => l.direction === "OUT").map(lineOf),
      outputs: [],
      linkedProducts: linked.map((p) => p.name),
    };
  });

  return (
    <AuditView
      products={auditProducts}
      productionRecipes={auditProduction}
      consumptionRecipes={auditConsumption}
      inventoryItems={inventoryItems}
      consumptionRecipesForModal={consumptionRecipesForModal}
      productionByOutputItemId={productionByOutputItemId}
    />
  );
}
