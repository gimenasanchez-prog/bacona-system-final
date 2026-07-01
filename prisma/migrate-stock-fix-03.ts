/**
 * migrate-stock-fix-03.ts — BCN junio 2026
 *
 * Correcciones post fix-02 + modifier→stock para guarnición.
 * fix-02 ya corrió en PROD — este script crea v3 donde sea necesario.
 * Idempotente: seguro de re-ejecutar.
 *
 * Ejecutar DESPUÉS de deployar el schema change (modifier-option-stock-link):
 *   $env:DATABASE_URL="postgresql://..."; npx tsx prisma/migrate-stock-fix-03.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type StockUnit = "G" | "ML" | "UN";

function dimensionFor(unit: StockUnit): "MASS" | "VOLUME" | "COUNT" {
  if (unit === "G") return "MASS";
  if (unit === "ML") return "VOLUME";
  return "COUNT";
}

type RLine = {
  itemName: string;
  direction: "IN" | "OUT";
  qty: number;
  sortOrder?: number;
};

const itemMap = new Map<string, string>();

// ── helpers ───────────────────────────────────────────────────────────────────

async function ensureCategory(name: string, sortOrder: number): Promise<void> {
  const existing = await prisma.inventoryCategory.findFirst({ where: { name } });
  if (!existing) {
    await prisma.inventoryCategory.create({ data: { name, sortOrder, isActive: true } });
    console.log(`  [+] Categoría: ${name}`);
  }
}

async function loadItem(name: string): Promise<void> {
  const item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!item) { console.warn(`  [!] Item no encontrado: '${name}'`); return; }
  itemMap.set(name, item.id);
}

async function ensureItem(name: string, catName: string, unit: StockUnit): Promise<void> {
  let item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!item) {
    const cat = await prisma.inventoryCategory.findFirst({ where: { name: catName } });
    if (!cat) throw new Error(`Categoría '${catName}' no encontrada para '${name}'`);
    item = await prisma.inventoryItem.create({
      data: {
        name, categoryId: cat.id, unit,
        dimension: dimensionFor(unit), displayUnit: unit,
        isActive: true, targetDaysCover: 14,
      },
    });
    console.log(`  [+] Item: ${name} (${unit})`);
  }
  itemMap.set(name, item.id);
}

async function renameItem(oldName: string, newName: string): Promise<void> {
  const item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: oldName, mode: "insensitive" } },
  });
  if (!item) { console.warn(`  [!] Item no encontrado: '${oldName}'`); return; }
  if (item.name === newName) { console.log(`  [=] Nombre ya correcto: '${newName}'`); itemMap.set(newName, item.id); return; }
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { name: newName } });
  itemMap.set(newName, item.id);
  console.log(`  [~] Renombrado: '${oldName}' → '${newName}'`);
}

async function deactivateRecipe(name: string, kind: "PRODUCTION" | "CONSUMPTION"): Promise<void> {
  const recipe = await prisma.recipe.findFirst({ where: { name, kind } });
  if (!recipe) { console.warn(`  [!] Receta no encontrada: '${name}'`); return; }
  if (!recipe.isActive) { console.log(`  [=] Ya inactiva: '${name}'`); return; }
  await prisma.recipe.update({ where: { id: recipe.id }, data: { isActive: false } });
  await prisma.recipeVersion.updateMany({ where: { recipeId: recipe.id }, data: { isActive: false } });
  console.log(`  [x] Receta desactivada: '${name}'`);
}

function linesMatchActive(
  existingLines: Array<{ inventoryItemId: string; direction: string; qty: Prisma.Decimal }>,
  desired: RLine[]
): boolean {
  if (existingLines.length !== desired.length) return false;
  for (const d of desired) {
    const itemId = itemMap.get(d.itemName);
    if (!itemId) return false;
    const found = existingLines.find(
      e => e.inventoryItemId === itemId &&
           e.direction === d.direction &&
           new Prisma.Decimal(d.qty).equals(e.qty)
    );
    if (!found) return false;
  }
  return true;
}

function buildLinesData(lines: RLine[], recipeName: string) {
  return lines.map((l, i) => {
    const inventoryItemId = itemMap.get(l.itemName);
    if (!inventoryItemId)
      throw new Error(`Item '${l.itemName}' no en mapa — receta '${recipeName}'`);
    return {
      inventoryItemId,
      direction: l.direction,
      qty: new Prisma.Decimal(l.qty),
      sortOrder: l.sortOrder ?? i,
    };
  });
}

/** Crea siempre la siguiente versión de una receta de consumo (a diferencia de
 *  upsertConsumptionVersion que saltea si ya hay >1 versión).
 *  Idempotente por contenido: si la versión activa ya tiene las mismas líneas, salta. */
async function forceUpdateConsumptionVersion(
  recipeName: string,
  lines: RLine[]
): Promise<string | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { name: recipeName, kind: "CONSUMPTION" },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: { lines: { select: { inventoryItemId: true, direction: true, qty: true } } },
      },
    },
  });

  if (!recipe) {
    console.warn(`  [!] Receta de consumo no encontrada: '${recipeName}'`);
    return null;
  }

  const activeVer = recipe.versions.find(v => v.isActive);
  if (!activeVer) { console.warn(`  [!] Sin versión activa: '${recipeName}'`); return null; }

  if (linesMatchActive(activeVer.lines, lines)) {
    console.log(`  [=] Sin cambios: '${recipeName}'`);
    return activeVer.id;
  }

  const latestVer = recipe.versions[0].version;
  const linesData = buildLinesData(lines, recipeName);

  const newVersion = await prisma.recipeVersion.create({
    data: {
      recipeId: recipe.id,
      version: latestVer + 1,
      isActive: true,
      lines: { create: linesData },
    },
  });

  await prisma.recipeVersion.updateMany({
    where: { recipeId: recipe.id, id: { not: newVersion.id } },
    data: { isActive: false },
  });

  const oldIds = recipe.versions.map(v => v.id);
  if (oldIds.length > 0) {
    await prisma.product.updateMany({
      where: { consumptionRecipeVersionId: { in: oldIds } },
      data: { consumptionRecipeVersionId: newVersion.id },
    });
  }

  console.log(`  [↑] Consumo v${newVersion.version}: '${recipeName}'`);
  return newVersion.id;
}

/** Crea v2 de un shell de producción agregando inputs.
 *  Salta si la versión activa ya tiene líneas OUT (inputs). */
async function upgradeProductionShell(recipeName: string, lines: RLine[]): Promise<void> {
  const recipe = await prisma.recipe.findFirst({
    where: { name: recipeName, kind: "PRODUCTION", isActive: true },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: { lines: { select: { inventoryItemId: true, direction: true, qty: true } } },
      },
    },
  });

  if (!recipe) { console.warn(`  [!] Shell no encontrada: '${recipeName}'`); return; }

  const activeVer = recipe.versions.find(v => v.isActive);
  if (!activeVer) { console.warn(`  [!] Sin versión activa: '${recipeName}'`); return; }

  const hasInputs = activeVer.lines.some(l => l.direction === "OUT");
  if (hasInputs) {
    console.log(`  [=] Shell ya tiene inputs: '${recipeName}'`);
    return;
  }

  const latestVer = recipe.versions[0].version;
  const linesData = buildLinesData(lines, recipeName);

  const newVersion = await prisma.recipeVersion.create({
    data: {
      recipeId: recipe.id,
      version: latestVer + 1,
      isActive: true,
      lines: { create: linesData },
    },
  });

  await prisma.recipeVersion.updateMany({
    where: { recipeId: recipe.id, id: { not: newVersion.id } },
    data: { isActive: false },
  });

  console.log(`  [↑] Shell → completa v${newVersion.version}: '${recipeName}'`);
}

/** Crea una receta de producción nueva si no existe */
async function ensureProductionRecipe(name: string, lines: RLine[]): Promise<void> {
  const existing = await prisma.recipe.findFirst({ where: { name, kind: "PRODUCTION" } });
  if (existing) { console.log(`  [=] Producción ya existe: '${name}'`); return; }
  const linesData = buildLinesData(lines, name);
  await prisma.recipe.create({
    data: {
      name, kind: "PRODUCTION", isActive: true,
      versions: { create: { version: 1, isActive: true, lines: { create: linesData } } },
    },
  });
  console.log(`  [+] Producción: '${name}'`);
}

/** Linkea una ModifierOption existente a un item de inventario */
async function linkModifierOptionToStock(
  groupName: string,
  optionName: string,
  itemName: string,
  qty: number
): Promise<void> {
  const itemId = itemMap.get(itemName);
  if (!itemId) { console.warn(`  [!] Item no en mapa: '${itemName}'`); return; }

  const group = await prisma.modifierGroup.findFirst({
    where: { name: { equals: groupName, mode: "insensitive" } },
  });
  if (!group) { console.warn(`  [!] Grupo no encontrado: '${groupName}'`); return; }

  const option = await prisma.modifierOption.findFirst({
    where: { groupId: group.id, name: { equals: optionName, mode: "insensitive" } },
  });
  if (!option) { console.warn(`  [!] Opción no encontrada: '${optionName}' en '${groupName}'`); return; }

  if (option.inventoryItemId === itemId) {
    console.log(`  [=] Ya linkeado: '${optionName}' → '${itemName}'`);
    return;
  }
  await prisma.modifierOption.update({
    where: { id: option.id },
    data: { inventoryItemId: itemId, inventoryQty: new Prisma.Decimal(qty) },
  });
  console.log(`  [->] Modifier: '${optionName}' → '${itemName}' (${qty})`);
}

/** Crea una ModifierOption nueva con link a stock, o actualiza si ya existe */
async function ensureModifierOptionWithStock(
  groupName: string,
  optionName: string,
  itemName: string,
  qty: number
): Promise<void> {
  const itemId = itemMap.get(itemName);
  if (!itemId) { console.warn(`  [!] Item no en mapa: '${itemName}'`); return; }

  const group = await prisma.modifierGroup.findFirst({
    where: { name: { equals: groupName, mode: "insensitive" } },
  });
  if (!group) { console.warn(`  [!] Grupo no encontrado: '${groupName}'`); return; }

  const existing = await prisma.modifierOption.findFirst({
    where: { groupId: group.id, name: { equals: optionName, mode: "insensitive" } },
  });

  if (!existing) {
    await prisma.modifierOption.create({
      data: {
        groupId: group.id, name: optionName, priceDeltaCents: 0, isActive: true,
        inventoryItemId: itemId, inventoryQty: new Prisma.Decimal(qty),
      },
    });
    console.log(`  [+] Opción modifier: '${optionName}' en '${groupName}' → '${itemName}'`);
    return;
  }

  if (existing.inventoryItemId === itemId) {
    console.log(`  [=] Ya existe y linkeado: '${optionName}'`);
    return;
  }
  await prisma.modifierOption.update({
    where: { id: existing.id },
    data: { inventoryItemId: itemId, inventoryQty: new Prisma.Decimal(qty) },
  });
  console.log(`  [->] Opción linkeada: '${optionName}' → '${itemName}'`);
}

async function linkProductToItem(productName: string, itemName: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { name: { equals: productName, mode: "insensitive" } },
  });
  if (!product) { console.warn(`  [!] Producto no encontrado: '${productName}'`); return; }
  const itemId = itemMap.get(itemName);
  if (!itemId) { console.warn(`  [!] Item no en mapa: '${itemName}'`); return; }
  if (product.inventoryItemId === itemId) {
    console.log(`  [=] Ya vinculado (item): '${productName}'`);
    return;
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { inventoryItemId: itemId, consumptionRecipeVersionId: null },
  });
  console.log(`  [->] Item directo: '${productName}' → '${itemName}'`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ─── FASE A: Categorías ───────────────────────────────────────────────────
  console.log("\n── FASE A: Categorías ──────────────────────────────────────");
  await ensureCategory("Lácteos", 30);
  await ensureCategory("Secos", 35);
  await ensureCategory("Varios", 100);
  await ensureCategory("Frutas y Verduras", 50);
  await ensureCategory("Elaborados Propios", 80);
  await ensureCategory("Aceites y Condimentos", 60);
  await ensureCategory("Panadería", 25);

  // ─── FASE B: Nuevos items + cargar existentes ─────────────────────────────
  console.log("\n── FASE B: Items ───────────────────────────────────────────");

  await ensureItem("manteca",             "Lácteos",              "G");
  await ensureItem("esencia vainilla",    "Varios",               "ML");
  await ensureItem("grasa",              "Varios",               "G");
  await ensureItem("zapallo",            "Frutas y Verduras",    "G");
  await ensureItem("pure de zapallo porcion", "Elaborados Propios", "UN");
  await ensureItem("arroz",              "Secos",                "G");
  await ensureItem("sal fina",           "Aceites y Condimentos","G");
  await ensureItem("oregano",            "Aceites y Condimentos","G");
  await ensureItem("medialuna",          "Panadería",            "UN");
  await ensureItem("churro",             "Panadería",            "UN");
  await ensureItem("frutos secos",       "Varios",               "G");

  // Renombrar carnivora porcion → pati carnivora
  await renameItem("carnivora porcion", "pati carnivora");

  // Cargar items existentes en itemMap
  await loadItem("harina 000");
  await loadItem("levadura");
  await loadItem("leche");
  await loadItem("azucar");
  await loadItem("huevo");
  await loadItem("dulce de leche");
  await loadItem("baño repostero");
  await loadItem("miguelito porcion");
  await loadItem("bollo porcion");
  await loadItem("tomate");
  await loadItem("pure de tomate");
  await loadItem("aceite girasol");
  await loadItem("yasgua");
  await loadItem("salsa de pizza");
  await loadItem("aji cayena");
  await loadItem("bondiola a la cerveza porcion");
  await loadItem("pollo a la crema porcion");
  await loadItem("milanesa porcion");
  await loadItem("wok de ternera porcion");
  await loadItem("salsa de soja");
  await loadItem("papas rusticas porcion");
  await loadItem("fideos");
  await loadItem("pati carnivora"); // cargado tras rename

  // ─── FASE C: Desactivar shells de producción incorrectas ──────────────────
  console.log("\n── FASE C: Desactivar shells incorrectas ───────────────────");
  await deactivateRecipe("Not milanesa", "PRODUCTION");
  await deactivateRecipe("Desmechado",   "PRODUCTION");
  await deactivateRecipe("Carnivora",    "PRODUCTION");
  await deactivateRecipe("Guarnicion",   "PRODUCTION");

  // ─── FASE D: Upgrading shells → recetas completas ─────────────────────────
  console.log("\n── FASE D: Shells → recetas completas ──────────────────────");

  // Miguelitos (de imagen: harina 000 1000g / azucar 180g / manteca 150g /
  //   levadura 80g / huevo 4UN / leche 200ml / sal fina 5g / esencia vainilla 10ml
  //   → miguelito porcion 40UN)
  await upgradeProductionShell("Miguelitos", [
    { itemName: "harina 000",       direction: "OUT", qty: 1000 },
    { itemName: "azucar",           direction: "OUT", qty: 180 },
    { itemName: "manteca",          direction: "OUT", qty: 150 },
    { itemName: "levadura",         direction: "OUT", qty: 80 },
    { itemName: "huevo",            direction: "OUT", qty: 4 },
    { itemName: "leche",            direction: "OUT", qty: 200 },
    { itemName: "sal fina",         direction: "OUT", qty: 5 },
    { itemName: "esencia vainilla", direction: "OUT", qty: 10 },
    { itemName: "miguelito porcion",direction: "IN",  qty: 40 },
  ]);

  // Bollitos (de imagen: harina 000 2000g / levadura 40g / grasa 200g / sal fina 30g
  //   → bollo porcion 31UN)
  await upgradeProductionShell("Bollitos", [
    { itemName: "harina 000",   direction: "OUT", qty: 2000 },
    { itemName: "levadura",     direction: "OUT", qty: 40 },
    { itemName: "grasa",        direction: "OUT", qty: 200 },
    { itemName: "sal fina",     direction: "OUT", qty: 30 },
    { itemName: "bollo porcion",direction: "IN",  qty: 31 },
  ]);

  // Pure de tomate (tomate 1000g → pure de tomate 700g — yield TBD con cocina)
  await upgradeProductionShell("Pure de tomate", [
    { itemName: "tomate",      direction: "OUT", qty: 1000 },
    { itemName: "pure de tomate", direction: "IN", qty: 700 },
  ]);

  // Pure de zapallo (nueva receta — yield TBD con cocina)
  await ensureProductionRecipe("Pure de zapallo", [
    { itemName: "zapallo",                direction: "OUT", qty: 1000 },
    { itemName: "pure de zapallo porcion",direction: "IN",  qty: 1 },
  ]);

  // ─── FASE E: Correcciones de recetas de consumo ───────────────────────────
  console.log("\n── FASE E: Correcciones de consumo (forceUpdate) ───────────");

  // Miguelitos x2: 2 miguelito porcion, 50g dulce, 30g baño repostero
  await forceUpdateConsumptionVersion("Consumo: Miguelitos x2", [
    { itemName: "miguelito porcion", direction: "OUT", qty: 2 },
    { itemName: "dulce de leche",    direction: "OUT", qty: 50 },
    { itemName: "baño repostero",    direction: "OUT", qty: 30 },
  ]);

  // Platos: quitar guarnicion porcion (ahora via modifier→stock)
  await forceUpdateConsumptionVersion("Consumo: Bondiola c/ guarnicion", [
    { itemName: "bondiola a la cerveza porcion", direction: "OUT", qty: 1 },
  ]);
  await forceUpdateConsumptionVersion("Consumo: Pollo a la crema c/ guarnicion", [
    { itemName: "pollo a la crema porcion", direction: "OUT", qty: 1 },
  ]);
  await forceUpdateConsumptionVersion("Consumo: Milanesa al plato c/ guarnicion", [
    { itemName: "milanesa porcion", direction: "OUT", qty: 1 },
  ]);

  // Wok: quitar fideos (fideos = guarnicion via modifier)
  await forceUpdateConsumptionVersion("Consumo: Wok de ternera", [
    { itemName: "wok de ternera porcion", direction: "OUT", qty: 1 },
    { itemName: "salsa de soja",          direction: "OUT", qty: 40 },
  ]);

  // ─── FASE F: Links modifier→stock — Guarnición ────────────────────────────
  console.log("\n── FASE F: Modifier→stock — Guarnición ─────────────────────");

  for (const grupo of ["Guarnición", "Guarnición (Almuerzo)"]) {
    await linkModifierOptionToStock(grupo, "Papas rústicas",  "papas rusticas porcion",    1);
    await linkModifierOptionToStock(grupo, "Puré de zapallo", "pure de zapallo porcion",   1);
    await linkModifierOptionToStock(grupo, "Arroz",           "arroz",                   150); // G, confirmar con cocina
    // Fideos: nueva opción (Ensalada se mantiene sin link)
    await ensureModifierOptionWithStock(grupo, "Fideos", "fideos", 100); // 100g
  }

  // ─── FASE G: Modifier→stock — Cafetería ("¿Le sumamos?") ──────────────────
  console.log("\n── FASE G: Modifier→stock — Cafetería ──────────────────────");
  const cafGroup = "¿Le sumamos Bollo o Medialuna...?";
  await linkModifierOptionToStock(cafGroup, "Medialuna", "medialuna",     1);
  await linkModifierOptionToStock(cafGroup, "Bollo",     "bollo porcion", 1);
  // "Chips" y "Miguelitos" en ese grupo: TBD
  await ensureModifierOptionWithStock(cafGroup, "Miguelitos", "miguelito porcion", 1);

  // ─── FASE H: Links directos — Postres y Panificados ──────────────────────
  console.log("\n── FASE H: Links directos — Postres y Panificados ──────────");
  await linkProductToItem("Medialuna x1",     "medialuna");
  await linkProductToItem("Churro x1",        "churro");
  await linkProductToItem("Postre frutos secos", "frutos secos");
  // Postre Tentacion Bacoña y Postre Yogurtina → sin link intencional por ahora

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n✅ migrate-stock-fix-03 completado");
  console.log("\nPENDIENTES con cocina:");
  console.log("  [?] Yield pure de tomate (actual: 700g / 1000g tomate)");
  console.log("  [?] Yield pure de zapallo (actual: 1 porcion / 1000g zapallo)");
  console.log("  [?] Qty arroz por guarnicion (actual: 150g)");
  console.log("  [?] Inputs Yasgua y Salsa de pizza (shells)");
  console.log("  [?] Tentacion Bacoña y Yogurtina (sin link)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
