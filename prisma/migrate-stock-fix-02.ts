/**
 * migrate-stock-fix-02.ts — BCN junio 2026
 *
 * Correcciones de recetas y vínculos de stock (relevamiento in situ).
 * Idempotente: crea/actualiza solo si es necesario.
 *
 * Ejecutar contra PROD:
 *   $env:DATABASE_URL="postgresql://..."; npx tsx prisma/migrate-stock-fix-02.ts
 *
 * PENDIENTES (completar con cocina antes de producción real):
 *   - Yield papas rusticas (actual: 1 porcion / 400g papa)
 *   - Inputs de recetas shells: Tapas de algarroba, Bollitos, Guarnicion, Yasgua,
 *     Pure de tomate, Salsa de pizza, Pasta de chips, Burguers BCÑ, Panes M/XL,
 *     Milanesas, Not milanesa, Carnivora, Desmechado, Miguelitos
 *
 * SIN LINK INTENCIONAL:
 *   - Agua caliente
 *   - Productos corpo (8) — requieren feature modifier→product (post fix-02)
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ── tipos ─────────────────────────────────────────────────────────────────────

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

const catMap = new Map<string, string>();
const itemMap = new Map<string, string>();

// ── helpers ───────────────────────────────────────────────────────────────────

async function ensureCategory(name: string, sortOrder: number): Promise<void> {
  let cat = await prisma.inventoryCategory.findFirst({ where: { name } });
  if (!cat) {
    cat = await prisma.inventoryCategory.create({
      data: { name, sortOrder, isActive: true },
    });
    console.log(`  [+] Categoría inv: ${name}`);
  }
  catMap.set(name, cat.id);
}

async function loadItem(name: string): Promise<void> {
  const item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!item) {
    console.warn(`  [!] Item no encontrado en DB: '${name}'`);
    return;
  }
  itemMap.set(name, item.id);
}

async function ensureItem(
  name: string,
  catName: string,
  unit: StockUnit,
  targetDaysCover = 14
): Promise<void> {
  let item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!item) {
    const categoryId = catMap.get(catName);
    if (!categoryId)
      throw new Error(`Categoría inv '${catName}' no encontrada para '${name}'`);
    item = await prisma.inventoryItem.create({
      data: {
        name,
        categoryId,
        unit,
        dimension: dimensionFor(unit),
        displayUnit: unit,
        isActive: true,
        targetDaysCover,
      },
    });
    console.log(`  [+] Item: ${name} (${unit})`);
  }
  itemMap.set(name, item.id);
}

async function updateItemUnit(name: string, unit: StockUnit): Promise<void> {
  const item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!item) { console.warn(`  [!] Item no encontrado: '${name}'`); return; }
  if (item.unit === unit) { console.log(`  [=] Unidad ya es ${unit}: '${name}'`); return; }
  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { unit, dimension: dimensionFor(unit), displayUnit: unit },
  });
  console.log(`  [~] Unidad actualizada: '${name}' → ${unit}`);
}

async function ensureRecipe(
  name: string,
  kind: "PRODUCTION" | "CONSUMPTION",
  lines: RLine[]
): Promise<string | null> {
  const existing = await prisma.recipe.findFirst({ where: { name, kind } });
  if (existing) {
    const ver = await prisma.recipeVersion.findFirst({
      where: { recipeId: existing.id, isActive: true },
      orderBy: { version: "desc" },
    });
    console.log(`  [=] Receta ya existe: ${name}`);
    return ver?.id ?? null;
  }
  const linesData = lines.map((l, i) => {
    const inventoryItemId = itemMap.get(l.itemName);
    if (!inventoryItemId)
      throw new Error(`Item '${l.itemName}' no en mapa — receta '${name}'`);
    return {
      inventoryItemId,
      direction: l.direction,
      qty: new Prisma.Decimal(l.qty),
      sortOrder: l.sortOrder ?? i,
    };
  });
  const created = await prisma.recipe.create({
    data: {
      name,
      kind,
      isActive: true,
      versions: {
        create: {
          version: 1,
          isActive: true,
          lines: { create: linesData },
        },
      },
    },
    include: { versions: true },
  });
  console.log(`  [+] Receta: ${name} (${lines.length} líneas)`);
  return created.versions[0].id;
}

/**
 * Crea versión nueva de una receta de consumo, o la crea si no existe.
 * Idempotente: si ya tiene ≥2 versiones, hace skip.
 */
async function upsertConsumptionVersion(
  recipeName: string,
  lines: RLine[]
): Promise<string | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { name: recipeName, kind: "CONSUMPTION" },
    include: { versions: { orderBy: { version: "desc" } } },
  });

  if (!recipe) {
    return await ensureRecipe(recipeName, "CONSUMPTION", lines);
  }

  if (recipe.versions.length > 1) {
    const activeVer = recipe.versions.find(v => v.isActive);
    console.log(`  [=] Ya actualizada: '${recipeName}'`);
    return activeVer?.id ?? null;
  }

  const latestVer = recipe.versions[0]?.version ?? 1;
  const linesData = lines.map((l, i) => {
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

  console.log(`  [↑] Receta v${newVersion.version}: '${recipeName}'`);
  return newVersion.id;
}

async function linkProductToRecipe(
  productName: string,
  recipeVersionId: string | null
): Promise<void> {
  if (!recipeVersionId) return;
  const product = await prisma.product.findFirst({
    where: { name: { equals: productName, mode: "insensitive" } },
  });
  if (!product) {
    console.warn(`  [!] Producto no encontrado: '${productName}'`);
    return;
  }
  if (product.consumptionRecipeVersionId === recipeVersionId) {
    console.log(`  [=] Ya vinculado (receta): '${productName}'`);
    return;
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { consumptionRecipeVersionId: recipeVersionId, inventoryItemId: null },
  });
  console.log(`  [->] Receta: '${productName}'`);
}

async function linkProductToItem(
  productName: string,
  itemName: string
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { name: { equals: productName, mode: "insensitive" } },
  });
  if (!product) {
    console.warn(`  [!] Producto no encontrado: '${productName}'`);
    return;
  }
  const itemId = itemMap.get(itemName);
  if (!itemId) {
    console.warn(`  [!] Item no en mapa: '${itemName}'`);
    return;
  }
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

async function deactivateProduct(name: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!product) {
    console.warn(`  [!] Producto no encontrado para desactivar: '${name}'`);
    return;
  }
  if (!product.isActive) {
    console.log(`  [=] Ya inactivo: '${name}'`);
    return;
  }
  await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
  console.log(`  [x] Desactivado: '${name}'`);
}

async function reactivateProduct(name: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (!product) {
    console.warn(`  [!] Producto no encontrado: '${name}'`);
    return;
  }
  if (product.isActive) {
    console.log(`  [=] Ya activo: '${name}'`);
    return;
  }
  await prisma.product.update({ where: { id: product.id }, data: { isActive: true } });
  console.log(`  [↑] Reactivado: '${name}'`);
}

async function deactivateRecipe(
  name: string,
  kind: "PRODUCTION" | "CONSUMPTION"
): Promise<void> {
  const recipe = await prisma.recipe.findFirst({ where: { name, kind } });
  if (!recipe) {
    console.warn(`  [!] Receta no encontrada: '${name}'`);
    return;
  }
  if (!recipe.isActive) {
    console.log(`  [=] Receta ya inactiva: '${name}'`);
    return;
  }
  await prisma.recipe.update({ where: { id: recipe.id }, data: { isActive: false } });
  await prisma.recipeVersion.updateMany({
    where: { recipeId: recipe.id },
    data: { isActive: false },
  });
  console.log(`  [x] Receta desactivada: '${name}'`);
}

async function renameProduct(oldName: string, newName: string): Promise<string | null> {
  const already = await prisma.product.findFirst({
    where: { name: { equals: newName, mode: "insensitive" } },
  });
  if (already) {
    console.log(`  [=] Nombre ya existe: '${newName}'`);
    return already.id;
  }
  const product = await prisma.product.findFirst({
    where: { name: { equals: oldName, mode: "insensitive" } },
  });
  if (!product) {
    console.warn(`  [!] Producto no encontrado para renombrar: '${oldName}'`);
    return null;
  }
  await prisma.product.update({ where: { id: product.id }, data: { name: newName } });
  console.log(`  [~] Renombrado: '${oldName}' → '${newName}'`);
  return product.id;
}

async function ensureProduct(
  name: string,
  posCategory: string,
  priceCents: number
): Promise<string | null> {
  const existing = await prisma.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (!existing.isActive) {
      await prisma.product.update({ where: { id: existing.id }, data: { isActive: true } });
      console.log(`  [↑] Reactivado: '${name}'`);
    } else {
      console.log(`  [=] Producto ya existe: '${name}'`);
    }
    return existing.id;
  }
  const cat = await prisma.category.findFirst({
    where: { name: { equals: posCategory, mode: "insensitive" } },
  });
  if (!cat) {
    console.warn(`  [!] Categoría POS '${posCategory}' no encontrada — '${name}' NO creado`);
    return null;
  }
  const product = await prisma.product.create({
    data: { name, categoryId: cat.id, priceCents, isActive: true },
  });
  console.log(`  [+] Producto POS: '${name}'`);
  return product.id;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ─── FASE A: Categorías ───────────────────────────────────────────────────
  console.log("\n── FASE A: Categorías ──────────────────────────────────────");
  await ensureCategory("Carnes", 40);
  await ensureCategory("Frutas y Verduras", 50);
  await ensureCategory("Aceites y Condimentos", 60);
  await ensureCategory("Elaborados Propios", 80);
  await ensureCategory("Snacks y Kiosco", 90);
  await ensureCategory("Varios", 100);
  await ensureCategory("Panadería", 25);
  await ensureCategory("Lácteos", 30);
  await ensureCategory("Secos", 35);
  await ensureCategory("Bebidas", 70);
  await ensureCategory("Dulces", 75);
  await ensureCategory("Enlatados", 77);

  // ─── FASE B: Nuevos items ────────────────────────────────────────────────
  console.log("\n── FASE B: Nuevos items ────────────────────────────────────");
  const EP = "Elaborados Propios";

  await ensureItem("guarnicion porcion",          EP, "UN");
  await ensureItem("papas rusticas porcion",       EP, "UN");
  await ensureItem("tapas de algarroba",           EP, "UN");
  await ensureItem("alfajor de algarroba porcion", EP, "UN");
  await ensureItem("bollo porcion",                EP, "UN");
  await ensureItem("burguer bcñ porcion",          EP, "UN");
  await ensureItem("not mila porcion",             EP, "UN");
  await ensureItem("milanesa porcion",             EP, "UN");
  await ensureItem("carnivora porcion",            EP, "UN");
  await ensureItem("desmechado porcion",           EP, "UN");
  await ensureItem("miguelito porcion",            EP, "UN");
  await ensureItem("pasta de chips",               EP, "G");
  await ensureItem("yasgua",                       EP, "G");
  await ensureItem("pure de tomate",               EP, "G");
  await ensureItem("salsa de pizza",               EP, "G");
  await ensureItem("prepizza C",                   EP, "UN");

  await ensureItem("pan de patinesa", "Panadería", "UN");
  await ensureItem("pan de milanesa", "Panadería", "UN");
  await ensureItem("pan integral",    "Panadería", "UN");
  await ensureItem("pan de chip",     "Panadería", "UN");
  await ensureItem("pan de papa M",   "Panadería", "UN");
  await ensureItem("pan de papa XL",  "Panadería", "UN");

  await ensureItem("queso tybo",       "Lácteos", "G");
  await ensureItem("queso crema",      "Lácteos", "G");
  await ensureItem("queso muzzarella", "Lácteos", "G");

  await ensureItem("fideos",     "Secos", "G");
  await ensureItem("harina 000", "Secos", "G");
  await ensureItem("levadura",   "Secos", "G");

  await ensureItem("aceitunas",         "Enlatados", "G");
  await ensureItem("mermelada",         "Dulces",    "G");
  await ensureItem("baño de chocolate", "Dulces",    "G");
  await ensureItem("baño repostero",    "Dulces",    "G");

  await ensureItem("mayo comun", "Aceites y Condimentos", "G");
  await ensureItem("mayo BCN",   "Aceites y Condimentos", "G");

  await ensureItem("huevo", "Varios", "UN");
  await ensureItem("jamon",  "Carnes", "G");

  await ensureItem("agua",                "Bebidas", "ML");
  await ensureItem("gaseosa 375ml",       "Bebidas", "UN");
  await ensureItem("gaseosa 500ml",       "Bebidas", "UN");
  await ensureItem("energizante monster", "Bebidas", "UN");
  await ensureItem("energizante speed",   "Bebidas", "UN");

  // ─── FASE C: Cargar items existentes en itemMap ────────────────────────────
  console.log("\n── FASE C: Cargar items existentes ─────────────────────────");
  await loadItem("leche");
  await loadItem("azucar");
  await loadItem("aceite girasol");
  await loadItem("tomate");
  await loadItem("papa");
  await loadItem("cebolla");
  await loadItem("pimiento");
  await loadItem("zanahoria");
  await loadItem("salsa de soja");
  await loadItem("dulce de leche");
  await loadItem("limon");
  await loadItem("fruta porcion");
  await loadItem("provensal");
  await loadItem("sal gruesa");
  await loadItem("patitas de pollo");
  await loadItem("empanada carne");
  await loadItem("empanada queso");
  await loadItem("empanada caprese");
  await loadItem("empanada choclo");
  await loadItem("bondiola a la cerveza porcion");
  await loadItem("pollo a la crema porcion");
  await loadItem("wok de ternera porcion");
  await loadItem("guiso de lentejas porcion");

  // ─── FASE D: Correcciones de datos existentes ─────────────────────────────
  console.log("\n── FASE D: Correcciones de datos ───────────────────────────");

  // "patitas de pollo" pasa de UN a G (no hay movimientos de stock todavía)
  await updateItemUnit("patitas de pollo", "G");

  // Normalizar nombre de "Tomate" → "tomate" si fue creado con mayúscula
  const tomateItem = await prisma.inventoryItem.findFirst({
    where: { name: { equals: "tomate", mode: "insensitive" } },
  });
  if (tomateItem && tomateItem.name !== "tomate") {
    await prisma.inventoryItem.update({ where: { id: tomateItem.id }, data: { name: "tomate" } });
    console.log("  [~] Normalizado: 'Tomate' → 'tomate'");
  } else {
    console.log("  [=] tomate ya está en minúsculas");
  }

  // ─── FASE E: Desactivar recetas de producción obsoletas ───────────────────
  console.log("\n── FASE E: Desactivar recetas obsoletas ────────────────────");
  await deactivateRecipe("Budín", "PRODUCTION");
  await deactivateRecipe("Crema pastelera", "PRODUCTION");
  await deactivateRecipe("Dulce de vino", "PRODUCTION");
  await deactivateRecipe("Maicenitas", "PRODUCTION");
  await deactivateRecipe("Panqueques", "PRODUCTION");
  await deactivateRecipe("Pastafrolas", "PRODUCTION");
  await deactivateRecipe("Pastel de cabrito", "PRODUCTION");

  // Desactivar recetas de consumo huérfanas (sin producto vinculado)
  await deactivateRecipe("Consumo: Alfajor de algarroba", "CONSUMPTION"); // versión sin BCÑ, si existe
  await deactivateRecipe("Consumo: Patinesa", "CONSUMPTION");             // vieja receta huérfana

  // ─── FASE F: Nuevas recetas de producción ─────────────────────────────────
  console.log("\n── FASE F: Recetas de Producción nuevas ────────────────────");

  // Papas rusticas — yield TBD con cocina (actual: 1 porcion / 400g papa)
  await ensureRecipe("Papas rusticas", "PRODUCTION", [
    { itemName: "papa",                   direction: "OUT", qty: 400 },
    { itemName: "aceite girasol",         direction: "OUT", qty: 30 },
    { itemName: "provensal",              direction: "OUT", qty: 5 },
    { itemName: "sal gruesa",             direction: "OUT", qty: 3 },
    { itemName: "papas rusticas porcion", direction: "IN",  qty: 1 },
  ]);

  // Prepizzas C — 9 prepizzas por lote (confirmado)
  await ensureRecipe("Prepizzas C", "PRODUCTION", [
    { itemName: "harina 000",     direction: "OUT", qty: 1000 },
    { itemName: "levadura",       direction: "OUT", qty: 15 },
    { itemName: "aceite girasol", direction: "OUT", qty: 100 },
    { itemName: "azucar",         direction: "OUT", qty: 20 },
    { itemName: "prepizza C",     direction: "IN",  qty: 9 },
  ]);

  // Shells — inputs TBD con cocina (solo output definido para que aparezca en /produccion)
  await ensureRecipe("Tapas de algarroba", "PRODUCTION", [
    { itemName: "tapas de algarroba", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Bollitos", "PRODUCTION", [
    { itemName: "bollo porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Guarnicion", "PRODUCTION", [
    { itemName: "guarnicion porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Yasgua", "PRODUCTION", [
    { itemName: "yasgua", direction: "IN", qty: 1000 },
  ]);
  await ensureRecipe("Pure de tomate", "PRODUCTION", [
    { itemName: "pure de tomate", direction: "IN", qty: 1000 },
  ]);
  await ensureRecipe("Salsa de pizza", "PRODUCTION", [
    { itemName: "salsa de pizza", direction: "IN", qty: 1000 },
  ]);
  await ensureRecipe("Pasta de chips", "PRODUCTION", [
    { itemName: "pasta de chips", direction: "IN", qty: 1000 },
  ]);
  await ensureRecipe("Burguers BCÑ", "PRODUCTION", [
    { itemName: "burguer bcñ porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Panes de papa M", "PRODUCTION", [
    { itemName: "pan de papa M", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Panes de papa XL", "PRODUCTION", [
    { itemName: "pan de papa XL", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Milanesas", "PRODUCTION", [
    { itemName: "milanesa porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Not milanesa", "PRODUCTION", [
    { itemName: "not mila porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Carnivora", "PRODUCTION", [
    { itemName: "carnivora porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Desmechado", "PRODUCTION", [
    { itemName: "desmechado porcion", direction: "IN", qty: 1 },
  ]);
  await ensureRecipe("Miguelitos", "PRODUCTION", [
    { itemName: "miguelito porcion", direction: "IN", qty: 1 },
  ]);

  // ─── FASE G: Actualizar recetas de consumo existentes ─────────────────────
  console.log("\n── FASE G: Actualizar recetas de consumo ───────────────────");

  const rvHuevos = await upsertConsumptionVersion("Consumo: Huevos BCÑ", [
    { itemName: "huevo",        direction: "OUT", qty: 3 },
    { itemName: "queso tybo",   direction: "OUT", qty: 35 },
    { itemName: "jamon",        direction: "OUT", qty: 20 },
    { itemName: "pan integral", direction: "OUT", qty: 1 },
    { itemName: "tomate",       direction: "OUT", qty: 70 },
  ]);
  await linkProductToRecipe("Huevos BCÑ", rvHuevos);

  // Limonada — agregar agua
  const rvLimonada = await upsertConsumptionVersion("Consumo: Limonada 1L", [
    { itemName: "limon",  direction: "OUT", qty: 3 },
    { itemName: "azucar", direction: "OUT", qty: 100 },
    { itemName: "agua",   direction: "OUT", qty: 1000 },
  ]);
  await linkProductToRecipe("Limonada de 1L", rvLimonada);

  // Alfajor de algarroba BCÑ — 2 tapas + 20g dulce de leche + 40g baño de chocolate
  const rvAlfajor = await upsertConsumptionVersion("Consumo: Alfajor de algarroba BCÑ", [
    { itemName: "tapas de algarroba", direction: "OUT", qty: 2 },
    { itemName: "dulce de leche",     direction: "OUT", qty: 20 },
    { itemName: "baño de chocolate",  direction: "OUT", qty: 40 },
  ]);
  await linkProductToRecipe("Alfajor de algarroba BCÑ", rvAlfajor);

  // Miguelitos x2 — 1 miguelito porcion, 20g dulce de leche, 15g baño repostero
  const rvMiguelitos = await upsertConsumptionVersion("Consumo: Miguelitos x2", [
    { itemName: "miguelito porcion", direction: "OUT", qty: 1 },
    { itemName: "dulce de leche",    direction: "OUT", qty: 20 },
    { itemName: "baño repostero",    direction: "OUT", qty: 15 },
  ]);
  await linkProductToRecipe("Miguelitos c/ dulce de leche x2", rvMiguelitos);

  // Mix Empanadas x8 — agregar yasgua
  const rvMixEmp = await upsertConsumptionVersion("Consumo: Mix Empanadas x8", [
    { itemName: "empanada carne",   direction: "OUT", qty: 2 },
    { itemName: "empanada queso",   direction: "OUT", qty: 2 },
    { itemName: "empanada caprese", direction: "OUT", qty: 2 },
    { itemName: "empanada choclo",  direction: "OUT", qty: 2 },
    { itemName: "yasgua",           direction: "OUT", qty: 60 },
  ]);
  await linkProductToRecipe("Mix empanadas x8", rvMixEmp);

  // Chip de Jamón y Queso x2
  const rvChip = await upsertConsumptionVersion("Consumo: Chip de Jamon y Queso x2", [
    { itemName: "pan de chip",    direction: "OUT", qty: 2 },
    { itemName: "pasta de chips", direction: "OUT", qty: 40 },
  ]);
  await linkProductToRecipe("Chip de Jamon y Queso x2", rvChip);

  // Patitas de Pollo x6 — 200g (item ahora en G) + papas rusticas porcion + yasgua
  const rvPatitas = await upsertConsumptionVersion("Consumo: Patitas de Pollo x6", [
    { itemName: "patitas de pollo",       direction: "OUT", qty: 200 },
    { itemName: "papas rusticas porcion", direction: "OUT", qty: 1 },
    { itemName: "yasgua",                 direction: "OUT", qty: 60 },
  ]);
  await linkProductToRecipe("Patitas de Pollo x6un con papas rusticas", rvPatitas);

  // Papas Rústicas — solo papas rusticas porcion
  const rvPapas = await upsertConsumptionVersion("Consumo: Papas Rusticas", [
    { itemName: "papas rusticas porcion", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Papas Rústicas", rvPapas);

  // Pizza Individual
  const rvPizza = await upsertConsumptionVersion("Consumo: Pizza Individual", [
    { itemName: "prepizza C",       direction: "OUT", qty: 1 },
    { itemName: "queso muzzarella", direction: "OUT", qty: 250 },
    { itemName: "salsa de pizza",   direction: "OUT", qty: 100 },
    { itemName: "aceitunas",        direction: "OUT", qty: 25 },
  ]);
  await linkProductToRecipe("Pizza Individual (4 porciones)", rvPizza);

  // Burguer BCÑ
  const rvBurguer = await upsertConsumptionVersion("Consumo: Burguer BCÑ", [
    { itemName: "burguer bcñ porcion", direction: "OUT", qty: 1 },
    { itemName: "queso tybo",          direction: "OUT", qty: 70 },
    { itemName: "mayo comun",          direction: "OUT", qty: 40 },
    { itemName: "huevo",               direction: "OUT", qty: 1 },
    { itemName: "tomate",              direction: "OUT", qty: 50 },
    { itemName: "pan de papa M",       direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Burguer BCÑ", rvBurguer);

  // Sandwich de Milanesa
  const rvSandMil = await upsertConsumptionVersion("Consumo: Sandwich de Milanesa", [
    { itemName: "milanesa porcion", direction: "OUT", qty: 1 },
    { itemName: "queso tybo",       direction: "OUT", qty: 70 },
    { itemName: "mayo comun",       direction: "OUT", qty: 40 },
    { itemName: "huevo",            direction: "OUT", qty: 1 },
    { itemName: "tomate",           direction: "OUT", qty: 100 },
    { itemName: "pan de milanesa",  direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Sandwich de Milanesa", rvSandMil);

  // Sandwich Desmechado
  const rvDesmechado = await upsertConsumptionVersion("Consumo: Sandwich Desmechado", [
    { itemName: "desmechado porcion", direction: "OUT", qty: 1 },
    { itemName: "pan de papa XL",     direction: "OUT", qty: 1 },
    { itemName: "tomate",             direction: "OUT", qty: 100 },
    { itemName: "queso tybo",         direction: "OUT", qty: 70 },
    { itemName: "mayo BCN",           direction: "OUT", qty: 50 },
    { itemName: "huevo",              direction: "OUT", qty: 2 },
  ]);
  await linkProductToRecipe("Sandwich Desmechado", rvDesmechado);

  // ─── FASE H: Nuevas recetas de consumo + conversiones ─────────────────────
  console.log("\n── FASE H: Nuevas recetas de consumo ───────────────────────");

  // Bollo casero — bollo porcion + mermelada + queso crema
  const rvBollo = await upsertConsumptionVersion("Consumo: Bollo casero", [
    { itemName: "bollo porcion", direction: "OUT", qty: 1 },
    { itemName: "mermelada",     direction: "OUT", qty: 40 },
    { itemName: "queso crema",   direction: "OUT", qty: 40 },
  ]);
  await linkProductToRecipe("Bollo casero c/ queso crema y mermelada", rvBollo);

  // Bondiola c/ guarnicion — de item directo a receta
  const rvBondiola = await upsertConsumptionVersion("Consumo: Bondiola c/ guarnicion", [
    { itemName: "bondiola a la cerveza porcion", direction: "OUT", qty: 1 },
    { itemName: "guarnicion porcion",            direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Bondiola a la cerveza c/ guarnicion", rvBondiola);

  // Milanesa al plato c/ guarnicion — de item directo a receta
  const rvMilPlato = await upsertConsumptionVersion("Consumo: Milanesa al plato c/ guarnicion", [
    { itemName: "milanesa porcion",   direction: "OUT", qty: 1 },
    { itemName: "guarnicion porcion", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Milanesa al plato c/ guarnicion", rvMilPlato);

  // Pollo a la crema c/ guarnicion — de item directo a receta
  const rvPollo = await upsertConsumptionVersion("Consumo: Pollo a la crema c/ guarnicion", [
    { itemName: "pollo a la crema porcion", direction: "OUT", qty: 1 },
    { itemName: "guarnicion porcion",       direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Pollo a la crema c/ guarnicion", rvPollo);

  // Wok de ternera — de item directo a receta
  const rvWok = await upsertConsumptionVersion("Consumo: Wok de ternera", [
    { itemName: "wok de ternera porcion", direction: "OUT", qty: 1 },
    { itemName: "fideos",                 direction: "OUT", qty: 100 },
    { itemName: "salsa de soja",          direction: "OUT", qty: 40 },
  ]);
  await linkProductToRecipe("Wok de ternera", rvWok);

  // Patinesa Veggie (el rename "Patinesa"→"Patinesa Veggie" se hace en Fase J)
  const rvPatinesaVeggie = await upsertConsumptionVersion("Consumo: Patinesa Veggie", [
    { itemName: "not mila porcion", direction: "OUT", qty: 1 },
    { itemName: "pan de patinesa",  direction: "OUT", qty: 1 },
    { itemName: "tomate",           direction: "OUT", qty: 70 },
    { itemName: "queso tybo",       direction: "OUT", qty: 70 },
    { itemName: "mayo BCN",         direction: "OUT", qty: 50 },
    { itemName: "huevo",            direction: "OUT", qty: 1 },
  ]);

  // Patinesa Carnivora (producto nuevo, se crea en Fase J)
  const rvPatinesaCarnivora = await upsertConsumptionVersion("Consumo: Patinesa Carnivora", [
    { itemName: "carnivora porcion", direction: "OUT", qty: 1 },
    { itemName: "pan de patinesa",   direction: "OUT", qty: 1 },
    { itemName: "tomate",            direction: "OUT", qty: 70 },
    { itemName: "queso tybo",        direction: "OUT", qty: 70 },
    { itemName: "mayo BCN",          direction: "OUT", qty: 50 },
    { itemName: "huevo",             direction: "OUT", qty: 1 },
  ]);

  // Licuados — 4 variantes (productos renombrados/creados en Fase J)
  const rvLicuado1LLeche = await upsertConsumptionVersion("Consumo: Licuado 1L leche", [
    { itemName: "fruta porcion", direction: "OUT", qty: 1 },
    { itemName: "leche",         direction: "OUT", qty: 600 },
    { itemName: "azucar",        direction: "OUT", qty: 160 },
  ]);

  const rvLicuado1LAgua = await upsertConsumptionVersion("Consumo: Licuado 1L agua", [
    { itemName: "fruta porcion", direction: "OUT", qty: 1 },
    { itemName: "agua",          direction: "OUT", qty: 600 },
    { itemName: "azucar",        direction: "OUT", qty: 160 },
  ]);

  const rvLicuado600Leche = await upsertConsumptionVersion("Consumo: Licuado 600ml leche", [
    { itemName: "fruta porcion", direction: "OUT", qty: 0.5 },
    { itemName: "leche",         direction: "OUT", qty: 300 },
    { itemName: "azucar",        direction: "OUT", qty: 80 },
  ]);

  const rvLicuado600Agua = await upsertConsumptionVersion("Consumo: Licuado 600ml agua", [
    { itemName: "fruta porcion", direction: "OUT", qty: 0.5 },
    { itemName: "agua",          direction: "OUT", qty: 300 },
    { itemName: "azucar",        direction: "OUT", qty: 80 },
  ]);

  // ─── FASE I: Receta → item directo ────────────────────────────────────────
  console.log("\n── FASE I: Receta → item directo ───────────────────────────");
  await linkProductToItem("Gaseosa de 375ml", "gaseosa 375ml");
  await linkProductToItem("Gaseosa de 500ml", "gaseosa 500ml");

  // ─── FASE J: Reactivar productos ──────────────────────────────────────────
  console.log("\n── FASE J: Reactivar productos ─────────────────────────────");
  await reactivateProduct("Guiso de lentejas");
  await linkProductToItem("Guiso de lentejas", "guiso de lentejas porcion");

  // ─── FASE K: Cambios en productos POS ─────────────────────────────────────
  console.log("\n── FASE K: Cambios en productos POS ────────────────────────");

  // Energizante — split Monster / Speed
  const energExistente = await prisma.product.findFirst({
    where: { name: { equals: "Energizante Monster o Speed", mode: "insensitive" } },
  });
  const energPrecio = energExistente?.priceCents ?? 0;
  if (!energPrecio) console.warn("  [!] Precio Energizante no encontrado");

  await deactivateProduct("Energizante Monster o Speed");
  const idMonster = await ensureProduct("Energizante Monster", "Bebidas", energPrecio);
  if (idMonster) await linkProductToItem("Energizante Monster", "energizante monster");
  const idSpeed = await ensureProduct("Energizante Speed", "Bebidas", energPrecio);
  if (idSpeed) await linkProductToItem("Energizante Speed", "energizante speed");

  // Patinesa — rename + crear Carnivora
  const patExistente = await prisma.product.findFirst({
    where: { name: { equals: "Patinesa", mode: "insensitive" } },
  });
  const patPrecio = patExistente?.priceCents ?? 0;
  const patCat = patExistente?.categoryId
    ? ((await prisma.category.findUnique({ where: { id: patExistente.categoryId } }))?.name ?? "Sándwiches")
    : "Sándwiches";
  if (!patPrecio) console.warn("  [!] Precio Patinesa no encontrado");

  await renameProduct("Patinesa", "Patinesa Veggie");
  await linkProductToRecipe("Patinesa Veggie", rvPatinesaVeggie);

  const idCarnivora = await ensureProduct("Patinesa Carnivora", patCat, patPrecio);
  if (idCarnivora) await linkProductToRecipe("Patinesa Carnivora", rvPatinesaCarnivora);

  // Licuados — renombrar existentes + crear variantes agua
  const lic1LExistente = await prisma.product.findFirst({
    where: { name: { equals: "Licuado de 1L", mode: "insensitive" } },
  });
  const lic600Existente = await prisma.product.findFirst({
    where: { name: { equals: "Licuado de 600ml", mode: "insensitive" } },
  });
  const lic1LPrecio  = lic1LExistente?.priceCents ?? 0;
  const lic600Precio = lic600Existente?.priceCents ?? 0;
  const lic1LCat  = lic1LExistente?.categoryId
    ? ((await prisma.category.findUnique({ where: { id: lic1LExistente.categoryId } }))?.name ?? "Bebidas")
    : "Bebidas";
  const lic600Cat = lic600Existente?.categoryId
    ? ((await prisma.category.findUnique({ where: { id: lic600Existente.categoryId } }))?.name ?? "Bebidas")
    : "Bebidas";

  await renameProduct("Licuado de 1L",   "Licuado de 1L (leche)");
  await linkProductToRecipe("Licuado de 1L (leche)", rvLicuado1LLeche);

  await renameProduct("Licuado de 600ml", "Licuado de 600ml (leche)");
  await linkProductToRecipe("Licuado de 600ml (leche)", rvLicuado600Leche);

  const idLic1LAg = await ensureProduct("Licuado de 1L (agua)", lic1LCat, lic1LPrecio);
  if (idLic1LAg) await linkProductToRecipe("Licuado de 1L (agua)", rvLicuado1LAgua);

  const idLic600Ag = await ensureProduct("Licuado de 600ml (agua)", lic600Cat, lic600Precio);
  if (idLic600Ag) await linkProductToRecipe("Licuado de 600ml (agua)", rvLicuado600Agua);

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n✅ migrate-stock-fix-02 completado");
  console.log("\nPENDIENTES con cocina:");
  console.log("  [?] Yield papas rusticas (actual: 1 porcion / 400g papa)");
  console.log("  [?] Inputs shells: Tapas de algarroba, Bollitos, Guarnicion, Yasgua,");
  console.log("      Pure de tomate, Salsa de pizza, Pasta de chips, Burguers BCÑ,");
  console.log("      Panes M/XL, Milanesas, Not milanesa, Carnivora, Desmechado, Miguelitos");
  console.log("  [!] Sin link intencional: Agua caliente + 8 productos corpo");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
