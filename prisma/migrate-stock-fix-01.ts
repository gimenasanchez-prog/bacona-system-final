/**
 * migrate-stock-fix-01.ts — BCN mayo 2026
 *
 * Correcciones de vínculos de stock sobre el catálogo POS.
 * Idempotente: findFirst → crear/actualizar solo si es necesario.
 *
 * Ejecutar contra PROD:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/migrate-stock-fix-01.ts
 *
 * ⚠️  ANTES DE EJECUTAR:
 *   - Buscar "// COMPLETAR" y reemplazar ingredientes de los 3 postres.
 *   - Verificar cantidades de café (FASE G).
 *   - Verificar botella de cerveza negra (340ml → 7 UN para bondiola).
 *   - Verificar lote guiso (4 porciones) según realidad del local.
 *
 * PENDIENTES INTENCIONALES (sin link = ok):
 *   - Agua caliente (sin inventario)
 *   - Corpo x6 (bundles, evita doble descuento)
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

// ── mapas en memoria ──────────────────────────────────────────────────────────

const catMap = new Map<string, string>();
const itemMap = new Map<string, string>();

// ── helpers ───────────────────────────────────────────────────────────────────

async function ensureCategory(name: string, sortOrder: number): Promise<void> {
  let cat = await prisma.inventoryCategory.findFirst({ where: { name } });
  if (!cat) {
    cat = await prisma.inventoryCategory.create({
      data: { name, sortOrder, isActive: true },
    });
    console.log(`  [+] Categoría: ${name}`);
  }
  catMap.set(name, cat.id);
}

/** Carga un item existente en itemMap; warn si no existe (no crea). */
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

/** Crea el item si no existe; idempotente. */
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
    if (!categoryId) throw new Error(`Categoría '${catName}' no encontrada para '${name}'`);
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

async function ensureRecipe(
  name: string,
  kind: "PRODUCTION" | "CONSUMPTION",
  lines: RLine[]
): Promise<string | null> {
  const existing = await prisma.recipe.findFirst({ where: { name, kind } });
  if (existing) {
    const ver = await prisma.recipeVersion.findFirst({
      where: { recipeId: existing.id, version: 1 },
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
  await prisma.product.update({
    where: { id: product.id },
    data: { isActive: false },
  });
  console.log(`  [x] Desactivado: '${name}'`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ─── FASE A: Cargar categorías en catMap (para ensureItem) ─────────────────
  console.log("\n── FASE A: Categorías ──────────────────────────────────────");
  await ensureCategory("Carnes", 40);
  await ensureCategory("Frutas y Verduras", 50);
  await ensureCategory("Aceites y Condimentos", 60);
  await ensureCategory("Elaborados Propios", 80);
  await ensureCategory("Snacks y Kiosco", 90);
  await ensureCategory("Varios", 100);

  // ─── FASE B: Nuevos items de inventario ───────────────────────────────────
  console.log("\n── FASE B: Nuevos items ────────────────────────────────────");

  // Snacks comprados
  await ensureItem("papas fritas chicas",  "Snacks y Kiosco", "UN");
  await ensureItem("papas fritas grandes", "Snacks y Kiosco", "UN");

  // Porciones elaboradas (output de recetas PRODUCTION)
  const EP = "Elaborados Propios";
  await ensureItem("guiso de lentejas porcion",     EP, "UN");
  await ensureItem("wok de ternera porcion",         EP, "UN");
  await ensureItem("bondiola a la cerveza porcion",  EP, "UN");
  await ensureItem("pollo a la crema porcion",       EP, "UN");

  // Carnes compradas
  await ensureItem("patitas de pollo",   "Carnes", "UN");
  await ensureItem("carne roast beef",   "Carnes", "G");

  // Vegetales para wok
  await ensureItem("berenjena", "Frutas y Verduras", "G");
  await ensureItem("brocoli",   "Frutas y Verduras", "UN");

  // Condimentos para wok
  await ensureItem("vinagre",           "Aceites y Condimentos", "ML");
  await ensureItem("semillas de sesamo", "Aceites y Condimentos", "ML");

  // ─── FASE C: Cargar items existentes en itemMap ───────────────────────────
  console.log("\n── FASE C: Cargar items existentes ─────────────────────────");

  // Varios
  await loadItem("te negro");
  await loadItem("cafe comun");
  await loadItem("mate cocido");
  await loadItem("barra de chocolate");
  await loadItem("nesquik");
  await loadItem("ramen coreano");

  // Lácteos
  await loadItem("leche");
  await loadItem("crema de leche");
  await loadItem("manteca");

  // Frutas y Verduras
  await loadItem("limon");
  await loadItem("papa");
  await loadItem("tomate");
  await loadItem("cebolla");
  await loadItem("pimiento");
  await loadItem("zanahoria");
  await loadItem("fruta porcion");

  // Materias Primas
  await loadItem("azucar");
  await loadItem("lenteja");
  await loadItem("maicena");
  await loadItem("granola");

  // Aceites y Condimentos
  await loadItem("aceite girasol");
  await loadItem("sal gruesa");
  await loadItem("sal fina");
  await loadItem("provensal");
  await loadItem("comino");
  await loadItem("caldo");
  await loadItem("ajo");
  await loadItem("salsa de tomate");
  await loadItem("salsa de soja");
  await loadItem("azucar");
  await loadItem("aji cayena");
  await loadItem("dulce de leche");

  // Carnes
  await loadItem("pollo");
  await loadItem("bondiola");

  // Bebidas
  await loadItem("cerveza negra");

  // Elaborados Propios
  await loadItem("milanesa porcion");
  await loadItem("empanada carne");
  await loadItem("empanada queso");
  await loadItem("empanada caprese");
  await loadItem("empanada choclo");
  await loadItem("panqueque");
  await loadItem("crema pastelera");

  // ─── FASE D: Desactivar productos eliminados del menú ─────────────────────
  console.log("\n── FASE D: Desactivar productos ────────────────────────────");
  await deactivateProduct("Empanada de quinoa x unidad");
  await deactivateProduct("Wraps de Pollo");

  // ─── FASE E: Item directo — productos simples ─────────────────────────────
  console.log("\n── FASE E: Links item directo ──────────────────────────────");
  await linkProductToItem("Mate cocido",                         "mate cocido");
  await linkProductToItem("Ramen",                               "ramen coreano");
  await linkProductToItem("Papas fritas chicas",                 "papas fritas chicas");
  await linkProductToItem("Papas fritas grandes",                "papas fritas grandes");
  await linkProductToItem("Milanesa al plato c/ guarnicion",     "milanesa porcion");

  // ─── FASE F: Recetas de PRODUCCIÓN (lotes) ───────────────────────────────
  console.log("\n── FASE F: Recetas de Producción ───────────────────────────");

  // Guiso de lentejas — ajustar lote si es necesario (actualmente: 4 porciones)
  await ensureRecipe("Guiso de lentejas", "PRODUCTION", [
    { itemName: "lenteja",                   direction: "OUT", qty: 800 },
    { itemName: "cebolla",                   direction: "OUT", qty: 400 },
    { itemName: "pimiento",                  direction: "OUT", qty: 200 },
    { itemName: "tomate",                    direction: "OUT", qty: 400 },
    { itemName: "caldo",                     direction: "OUT", qty: 200 },
    { itemName: "comino",                    direction: "OUT", qty: 10 },
    { itemName: "guiso de lentejas porcion", direction: "IN",  qty: 4 },
  ]);

  // Bondiola a la cerveza — 17 porciones (receta real del local)
  // Cerveza negra: 473ml por botella ≈ 7 UN — ajustar si el tamaño de botella es distinto
  await ensureRecipe("Bondiola a la cerveza", "PRODUCTION", [
    { itemName: "bondiola",                       direction: "OUT", qty: 4500 },
    { itemName: "cebolla",                        direction: "OUT", qty: 4000 },
    { itemName: "cerveza negra",                  direction: "OUT", qty: 7 },
    { itemName: "aji cayena",                     direction: "OUT", qty: 60 },
    { itemName: "salsa de tomate",                direction: "OUT", qty: 80 },
    { itemName: "azucar",                         direction: "OUT", qty: 100 },
    { itemName: "sal fina",                       direction: "OUT", qty: 50 },
    { itemName: "aceite girasol",                 direction: "OUT", qty: 50 },
    { itemName: "ajo",                            direction: "OUT", qty: 3 },
    { itemName: "bondiola a la cerveza porcion",  direction: "IN",  qty: 17 },
  ]);

  // Pollo a la crema — 19 porciones (receta real del local)
  await ensureRecipe("Pollo a la crema", "PRODUCTION", [
    { itemName: "pollo",                  direction: "OUT", qty: 11000 },
    { itemName: "cebolla",               direction: "OUT", qty: 2000 },
    { itemName: "pimiento",              direction: "OUT", qty: 200 },
    { itemName: "zanahoria",             direction: "OUT", qty: 350 },
    { itemName: "crema de leche",        direction: "OUT", qty: 1000 },
    { itemName: "pollo a la crema porcion", direction: "IN", qty: 19 },
  ]);

  // Wok de ternera — 19 porciones (receta real del local)
  await ensureRecipe("Wok de ternera", "PRODUCTION", [
    { itemName: "carne roast beef",      direction: "OUT", qty: 4200 },
    { itemName: "zanahoria",             direction: "OUT", qty: 500 },
    { itemName: "pimiento",              direction: "OUT", qty: 2200 },
    { itemName: "berenjena",             direction: "OUT", qty: 650 },
    { itemName: "brocoli",               direction: "OUT", qty: 3 },
    { itemName: "ajo",                   direction: "OUT", qty: 3 },
    { itemName: "manteca",               direction: "OUT", qty: 300 },
    { itemName: "aceite girasol",        direction: "OUT", qty: 50 },
    { itemName: "salsa de soja",         direction: "OUT", qty: 500 },
    { itemName: "vinagre",               direction: "OUT", qty: 400 },
    { itemName: "semillas de sesamo",    direction: "OUT", qty: 30 },
    { itemName: "maicena",               direction: "OUT", qty: 150 },
    { itemName: "wok de ternera porcion", direction: "IN", qty: 19 },
  ]);

  // ─── FASE G: Recetas de CONSUMO + links ──────────────────────────────────
  console.log("\n── FASE G: Recetas de Consumo + Links ──────────────────────");

  // ── Cafetería ──
  // Cantidades aproximadas: cafe comun (G) + leche (ML). Ajustar si no coinciden con la planilla.
  const rvTe = await ensureRecipe("Consumo: Te", "CONSUMPTION", [
    { itemName: "te negro", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Te", rvTe);

  const rvCafe80 = await ensureRecipe("Consumo: Cafe 80ml", "CONSUMPTION", [
    { itemName: "cafe comun", direction: "OUT", qty: 7 },
    { itemName: "leche",      direction: "OUT", qty: 60 },
  ]);
  await linkProductToRecipe("Cafe con o sin leche de 80ml", rvCafe80);

  const rvCafe180 = await ensureRecipe("Consumo: Cafe 180ml", "CONSUMPTION", [
    { itemName: "cafe comun", direction: "OUT", qty: 10 },
    { itemName: "leche",      direction: "OUT", qty: 130 },
  ]);
  await linkProductToRecipe("Cafe con o sin leche de 180ml", rvCafe180);

  const rvCafe350 = await ensureRecipe("Consumo: Cafe 350ml", "CONSUMPTION", [
    { itemName: "cafe comun", direction: "OUT", qty: 14 },
    { itemName: "leche",      direction: "OUT", qty: 270 },
  ]);
  await linkProductToRecipe("Cafe con o sin leche de 350ml", rvCafe350);

  const rvChocolatada = await ensureRecipe("Consumo: Chocolatada", "CONSUMPTION", [
    { itemName: "nesquik", direction: "OUT", qty: 30 },
    { itemName: "leche",   direction: "OUT", qty: 220 },
  ]);
  await linkProductToRecipe("Chocolatada", rvChocolatada);

  const rvSubmarino = await ensureRecipe("Consumo: Submarino", "CONSUMPTION", [
    { itemName: "barra de chocolate", direction: "OUT", qty: 1 },
    { itemName: "leche",              direction: "OUT", qty: 180 },
  ]);
  await linkProductToRecipe("Submarino", rvSubmarino);

  // ── Bebidas ──
  const rvLimonada = await ensureRecipe("Consumo: Limonada 1L", "CONSUMPTION", [
    { itemName: "limon",  direction: "OUT", qty: 3 },
    { itemName: "azucar", direction: "OUT", qty: 100 },
  ]);
  await linkProductToRecipe("Limonada de 1L", rvLimonada);

  // ── Al plato ──
  const rvPapasRusticas = await ensureRecipe("Consumo: Papas Rusticas", "CONSUMPTION", [
    { itemName: "papa",          direction: "OUT", qty: 400 },
    { itemName: "aceite girasol", direction: "OUT", qty: 30 },
    { itemName: "provensal",     direction: "OUT", qty: 5 },
    { itemName: "sal gruesa",    direction: "OUT", qty: 3 },
  ]);
  await linkProductToRecipe("Papas Rústicas", rvPapasRusticas);

  const rvPatitas = await ensureRecipe("Consumo: Patitas de Pollo x6", "CONSUMPTION", [
    { itemName: "patitas de pollo", direction: "OUT", qty: 6 },
    { itemName: "papa",             direction: "OUT", qty: 400 },
    { itemName: "provensal",        direction: "OUT", qty: 5 },
    { itemName: "sal gruesa",       direction: "OUT", qty: 3 },
  ]);
  await linkProductToRecipe("Patitas de Pollo x6un con papas rusticas", rvPatitas);

  const rvMixEmpanadas = await ensureRecipe("Consumo: Mix Empanadas x8", "CONSUMPTION", [
    { itemName: "empanada carne",   direction: "OUT", qty: 2 },
    { itemName: "empanada queso",   direction: "OUT", qty: 2 },
    { itemName: "empanada caprese", direction: "OUT", qty: 2 },
    { itemName: "empanada choclo",  direction: "OUT", qty: 2 },
  ]);
  await linkProductToRecipe("Mix empanadas x8", rvMixEmpanadas);

  // ── Postres — pendiente documentar in situ con el personal ──
  // Los ingredientes reales se obtienen en SAC y se agregan en migrate-stock-fix-02.ts
  //
  // const rvTentacion = await ensureRecipe("Consumo: Postre Tentacion Bacona", "CONSUMPTION", [...]);
  // await linkProductToRecipe("Postre Tentacion Bacoña", rvTentacion);
  //
  // const rvYogurtina = await ensureRecipe("Consumo: Postre Yogurtina", "CONSUMPTION", [...]);
  // await linkProductToRecipe("Postre Yogurtina", rvYogurtina);
  //
  // const rvFrutos = await ensureRecipe("Consumo: Postre Frutos Secos", "CONSUMPTION", [...]);
  // await linkProductToRecipe("Postre frutos secos", rvFrutos);

  // ─── FASE H: Re-link bondiola y pollo (consumo aprox → item porcion batch) ─
  console.log("\n── FASE H: Re-link batch (bondiola + pollo) ────────────────");
  await linkProductToItem("Bondiola a la cerveza c/ guarnicion", "bondiola a la cerveza porcion");
  await linkProductToItem("Pollo a la crema c/ guarnicion",      "pollo a la crema porcion");

  // ─── FASE I: Link de productos batch restantes ────────────────────────────
  console.log("\n── FASE I: Links items elaborados por lote ─────────────────");
  await linkProductToItem("Guiso de lentejas", "guiso de lentejas porcion");
  await linkProductToItem("Wok de ternera",    "wok de ternera porcion");

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n✅ migrate-stock-fix-01 completado exitosamente");
  console.log("\nPENDIENTES:");
  console.log("  [?] Verificar recetas de postres (marcadas // COMPLETAR)");
  console.log("  [?] Verificar cantidades de café (cafe comun en G, leche en ML)");
  console.log("  [?] Confirmar botella cerveza negra (340ml → 7 UN en bondiola)");
  console.log("  [?] Confirmar lote guiso (ajustar IN qty si el lote real es distinto)");
  console.log("  [!] Sin link intencional: Agua caliente + Corpo x6");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
