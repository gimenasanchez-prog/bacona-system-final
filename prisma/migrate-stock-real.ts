/**
 * Migración de stock real — BCN mayo 2026
 * Crea InventoryCategories, InventoryItems (~150), Recetas de Producción (18)
 * y Recetas de Consumo con sus links a productos POS.
 *
 * Idempotente: findFirst → crear solo si no existe.
 * Ejecutar: npx tsx prisma/migrate-stock-real.ts
 *
 * NOTAS POST-EJECUCIÓN:
 *  - Items ficticios del seed (Tomate, Pan tostado, Jamón cocido, Coca-Cola 250ml)
 *    quedan activos. Desactivarlos en Prisma Studio si se desea.
 *  - Pizza Huevos / Pizza Pesto: recetas creadas sin link. Crear productos POS si se venden separados.
 *  - Sacramento / Yasgua: recetas creadas sin link. Crear productos POS si aplica.
 *  - Energizante: usa "energizante monster mango" como proxy. Actualizar si se quiere tracking fino.
 *  - Gaseosas: items genéricos "gaseosa 500ml" / "gaseosa 375ml". Compras van por marca específica.
 *  - "pan de papa XL" = "pan de queso XL" de las recetas del PDF (mismo ítem, nombre del maestro).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ── tipos locales ─────────────────────────────────────────────────────────────

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

const catMap = new Map<string, string>(); // nombre categoría → id
const itemMap = new Map<string, string>(); // nombre item → id

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
    if (!inventoryItemId) throw new Error(`Item '${l.itemName}' no en mapa — receta '${name}'`);
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

async function linkProductToRecipe(productName: string, recipeVersionId: string | null): Promise<void> {
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

async function linkProductToItem(productName: string, itemName: string): Promise<void> {
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

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ─── FASE 1: CATEGORÍAS ───────────────────────────────────────────────────
  console.log("\n── FASE 1: Categorías ──────────────────────────────────────");
  await ensureCategory("Materias Primas", 10);
  await ensureCategory("Lácteos y Huevos", 20);
  await ensureCategory("Quesos y Fiambres", 30);
  await ensureCategory("Carnes", 40);
  await ensureCategory("Frutas y Verduras", 50);
  await ensureCategory("Aceites y Condimentos", 60);
  await ensureCategory("Bebidas", 70);
  await ensureCategory("Elaborados Propios", 80);
  await ensureCategory("Snacks y Kiosco", 90);
  await ensureCategory("Varios", 100);

  // ─── FASE 2: INVENTORY ITEMS ──────────────────────────────────────────────
  console.log("\n── FASE 2: Items de inventario ─────────────────────────────");

  // Materias Primas
  const MP = "Materias Primas";
  await ensureItem("harina 000", MP, "G");
  await ensureItem("harina 0000", MP, "G");
  await ensureItem("harina leudante", MP, "G");
  await ensureItem("levadura", MP, "G");
  await ensureItem("sal fina", MP, "G");
  await ensureItem("sal gruesa", MP, "G");
  await ensureItem("azucar", MP, "G");
  await ensureItem("maicena", MP, "G");
  await ensureItem("polvo para hornear", MP, "G");
  await ensureItem("coco rallado", MP, "G");
  await ensureItem("pan rallado", MP, "G");
  await ensureItem("lenteja", MP, "G");
  await ensureItem("harina de algarroba", MP, "G");
  await ensureItem("membrillo", MP, "G");
  await ensureItem("granola", MP, "G");
  await ensureItem("gelatina", MP, "G");
  await ensureItem("baño repostero", MP, "G");
  await ensureItem("grasa", MP, "G");
  await ensureItem("arroz", MP, "G");
  await ensureItem("fideo", MP, "G");
  await ensureItem("tapa de algarroba", MP, "UN");

  // Lácteos y Huevos
  const LE = "Lácteos y Huevos";
  await ensureItem("huevo", LE, "UN");
  await ensureItem("leche", LE, "ML");
  await ensureItem("manteca", LE, "G");
  await ensureItem("crema de leche", LE, "G");

  // Quesos y Fiambres
  const QF = "Quesos y Fiambres";
  await ensureItem("queso tybo", QF, "G");
  await ensureItem("queso crema", QF, "G");
  await ensureItem("queso muzzarella", QF, "G");
  await ensureItem("queso cheddar", QF, "G");
  await ensureItem("queso roquefort", QF, "G");
  await ensureItem("jamon comun", QF, "G");
  await ensureItem("bacon", QF, "G");

  // Carnes
  const CA = "Carnes";
  await ensureItem("pulpa", CA, "G");
  await ensureItem("carne molida", CA, "G");
  await ensureItem("pollo", CA, "G");
  await ensureItem("bondiola", CA, "G");
  await ensureItem("chori", CA, "G");
  await ensureItem("carne de cordero", CA, "G");
  await ensureItem("milanesa porcion", CA, "UN");
  await ensureItem("desmechado porcion", CA, "UN");
  await ensureItem("not mila porcion", CA, "UN");
  await ensureItem("patynesa veggie porcion", CA, "UN");
  await ensureItem("patynesa comun porcion", CA, "UN");

  // Frutas y Verduras
  const FV = "Frutas y Verduras";
  await ensureItem("tomate", FV, "G");
  await ensureItem("cebolla", FV, "G");
  await ensureItem("papa", FV, "G");
  await ensureItem("zapallo", FV, "G");
  await ensureItem("pimiento", FV, "G");
  await ensureItem("ajo", FV, "UN");
  await ensureItem("limon", FV, "UN");
  await ensureItem("remolacha", FV, "G");
  await ensureItem("zanahoria", FV, "G");
  await ensureItem("cabutia", FV, "G");
  await ensureItem("zapallito verde", FV, "G");
  await ensureItem("fruta porcion", FV, "UN");              // genérico para licuados
  await ensureItem("fruta anana y pera", FV, "UN");
  await ensureItem("fruta frutilla y frambuesa", FV, "UN");
  await ensureItem("fruta mango y durazno", FV, "UN");
  await ensureItem("fruta arandanos y zarzamora", FV, "UN");
  await ensureItem("fruta melon y kiwi", FV, "UN");
  await ensureItem("fruta frutilla", FV, "UN");

  // Aceites y Condimentos
  const AC = "Aceites y Condimentos";
  await ensureItem("aceite girasol", AC, "ML");
  await ensureItem("aceite de oliva", AC, "ML");
  await ensureItem("esencia de vainilla", AC, "ML");
  await ensureItem("pimenton", AC, "G");
  await ensureItem("comino", AC, "G");
  await ensureItem("aji cayena", AC, "G");
  await ensureItem("oregano", AC, "G");
  await ensureItem("provensal", AC, "G");
  await ensureItem("aji callena", AC, "G");
  await ensureItem("dulce de leche", AC, "G");
  await ensureItem("salsa de tomate", AC, "G");
  await ensureItem("aceitunas", AC, "G");
  await ensureItem("salsa de soja", AC, "ML");
  await ensureItem("salsa terayki", AC, "ML");
  await ensureItem("vino", AC, "ML");
  await ensureItem("pesto especie", AC, "G");               // ingrediente sin costo en planilla
  await ensureItem("caldo", AC, "G");
  await ensureItem("mayo comun", AC, "G");                  // mayonesa comprada (≠ mayo BCN casera)
  await ensureItem("ketchup en sobre", AC, "UN");
  await ensureItem("savora en sobre", AC, "UN");
  await ensureItem("sal en sobre", AC, "UN");
  await ensureItem("azucar sobre", AC, "UN");
  await ensureItem("mermelada", AC, "G");

  // Bebidas
  const BE = "Bebidas";
  await ensureItem("gaseosa Fanta 500ml", BE, "UN");
  await ensureItem("gaseosa Sprite 500ml", BE, "UN");
  await ensureItem("gaseosa CocaComun 500ml", BE, "UN");
  await ensureItem("gaseosa CocaZero 500ml", BE, "UN");
  await ensureItem("gaseosa Paso de los Toros 500ml", BE, "UN");
  await ensureItem("gaseosa Fanta 375ml", BE, "UN");
  await ensureItem("gaseosa Sprite 375ml", BE, "UN");
  await ensureItem("gaseosa CocaComun 375ml", BE, "UN");
  await ensureItem("gaseosa CocaZero 375ml", BE, "UN");
  await ensureItem("jugo citric 500ml", BE, "UN");
  await ensureItem("jugo citric 1L", BE, "UN");
  await ensureItem("agua con gas 500ml", BE, "UN");
  await ensureItem("agua sin gas 500ml", BE, "UN");
  await ensureItem("energizante monster mango", BE, "UN");
  await ensureItem("energizante monster taurina", BE, "UN");
  await ensureItem("energizante speed", BE, "UN");
  await ensureItem("cerveza rubia", BE, "UN");
  await ensureItem("cerveza negra", BE, "UN");
  await ensureItem("gaseosa 500ml", BE, "UN");              // genérico para consumo POS
  await ensureItem("gaseosa 375ml", BE, "UN");              // genérico para consumo POS

  // Elaborados Propios
  const EP = "Elaborados Propios";
  await ensureItem("mayo BCN", EP, "G");
  await ensureItem("pure de tomate", EP, "ML");
  await ensureItem("prepizza G", EP, "UN");
  await ensureItem("prepizza C", EP, "UN");
  await ensureItem("panqueque", EP, "UN");
  await ensureItem("maicenita", EP, "UN");
  await ensureItem("bollo", EP, "UN");
  await ensureItem("pan chip", EP, "UN");
  await ensureItem("pasta chips", EP, "ML");
  await ensureItem("miguelito", EP, "UN");
  await ensureItem("crema pastelera", EP, "G");
  await ensureItem("pastafrola", EP, "UN");
  await ensureItem("budin", EP, "UN");
  await ensureItem("sopa porcion", EP, "UN");
  await ensureItem("focaccia porcion", EP, "UN");
  await ensureItem("pan de megacito", EP, "UN");
  await ensureItem("pastel de cabrito porcion", EP, "UN");
  await ensureItem("pesto", EP, "ML");
  await ensureItem("dulce de vino", EP, "ML");
  await ensureItem("empanada carne", EP, "UN");
  await ensureItem("empanada queso", EP, "UN");
  await ensureItem("empanada caprese", EP, "UN");
  await ensureItem("empanada choclo", EP, "UN");
  await ensureItem("pan de papa XL", EP, "UN");             // "pan de queso XL" en recetas del PDF
  await ensureItem("pan de papa M", EP, "UN");              // pan para burguer
  await ensureItem("pan de milanesa", EP, "UN");
  await ensureItem("plancha pan de miga", EP, "UN");
  await ensureItem("medialuna", EP, "UN");
  await ensureItem("churro", EP, "UN");
  await ensureItem("sacramento", EP, "UN");

  // Snacks y Kiosco
  const SK = "Snacks y Kiosco";
  await ensureItem("galletas pepitos x118gr", SK, "UN");
  await ensureItem("galletas oreos x118gr", SK, "UN");
  await ensureItem("galletas chocolinas x100gr", SK, "UN");
  await ensureItem("galletas chocolinas x170gr", SK, "UN");
  await ensureItem("galletas chocolinas x250gr", SK, "UN");
  await ensureItem("galletas coquitas x177gr", SK, "UN");   // POS dice 117gr, insumos dice 177gr
  await ensureItem("galletas donsatur dulces", SK, "UN");
  await ensureItem("galletas donsatur salada", SK, "UN");
  await ensureItem("galletas oreos mini", SK, "UN");
  await ensureItem("galletas pepitos mini", SK, "UN");
  await ensureItem("caramelos halls", SK, "UN");
  await ensureItem("chicles topline", SK, "UN");
  await ensureItem("cigarrillos hills", SK, "UN");
  await ensureItem("bica", SK, "UN");
  await ensureItem("alfajor rasta", SK, "UN");
  await ensureItem("gomitas mogul x12", SK, "UN");
  await ensureItem("encendedor", SK, "UN");
  await ensureItem("hojas de coca x25gr", SK, "UN");
  await ensureItem("hojas de coca x250gr", SK, "UN");

  // Varios
  const VA = "Varios";
  await ensureItem("te negro", VA, "UN");
  await ensureItem("te manzana y canela", VA, "UN");
  await ensureItem("te limon", VA, "UN");
  await ensureItem("te verde", VA, "UN");
  await ensureItem("te boldo", VA, "UN");
  await ensureItem("te manzanilla", VA, "UN");
  await ensureItem("te tilo", VA, "UN");
  await ensureItem("te frutilla", VA, "UN");
  await ensureItem("te durazno", VA, "UN");
  await ensureItem("te marcacuya", VA, "UN");
  await ensureItem("te canela", VA, "UN");
  await ensureItem("mate cocido", VA, "UN");
  await ensureItem("cafe especialidad", VA, "G");
  await ensureItem("cafe comun", VA, "G");
  await ensureItem("nesquik", VA, "G");
  await ensureItem("barra de chocolate", VA, "UN");
  await ensureItem("ramen coreano", VA, "UN");

  // ─── FASE 3: RECETAS DE PRODUCCIÓN ───────────────────────────────────────
  console.log("\n── FASE 3: Recetas de Producción ───────────────────────────");

  await ensureRecipe("Pure de tomates", "PRODUCTION", [
    { itemName: "tomate",        direction: "OUT", qty: 530 },
    { itemName: "pure de tomate", direction: "IN",  qty: 530 },
  ]);

  await ensureRecipe("Mayonesa BCN", "PRODUCTION", [
    { itemName: "huevo",         direction: "OUT", qty: 5 },
    { itemName: "aceite girasol", direction: "OUT", qty: 45 },
    { itemName: "sal fina",      direction: "OUT", qty: 10 },
    { itemName: "mayo BCN",      direction: "IN",  qty: 400 },
  ]);

  await ensureRecipe("Panqueques", "PRODUCTION", [
    { itemName: "huevo",         direction: "OUT", qty: 3 },
    { itemName: "harina 0000",   direction: "OUT", qty: 250 },
    { itemName: "leche",         direction: "OUT", qty: 600 },
    { itemName: "sal fina",      direction: "OUT", qty: 20 },
    { itemName: "aceite girasol", direction: "OUT", qty: 40 },
    { itemName: "panqueque",     direction: "IN",  qty: 15 },
  ]);

  await ensureRecipe("Prepizzas", "PRODUCTION", [
    { itemName: "harina 000",    direction: "OUT", qty: 1000 },
    { itemName: "levadura",      direction: "OUT", qty: 50 },
    { itemName: "aceite girasol", direction: "OUT", qty: 50 },
    { itemName: "azucar",        direction: "OUT", qty: 20 },
    { itemName: "prepizza G",    direction: "IN",  qty: 3 },
    { itemName: "prepizza C",    direction: "IN",  qty: 1 },
  ]);

  await ensureRecipe("Maicenitas", "PRODUCTION", [
    { itemName: "manteca",           direction: "OUT", qty: 200 },
    { itemName: "azucar",            direction: "OUT", qty: 200 },
    { itemName: "leche",             direction: "OUT", qty: 150 }, // PDF: 150 unidad = 150 ML de leche
    { itemName: "huevo",             direction: "OUT", qty: 3 },
    { itemName: "harina leudante",   direction: "OUT", qty: 400 },
    { itemName: "maicena",           direction: "OUT", qty: 300 },
    { itemName: "esencia de vainilla", direction: "OUT", qty: 20 },
    { itemName: "maicenita",         direction: "IN",  qty: 45 },
  ]);

  await ensureRecipe("Bollitos", "PRODUCTION", [
    { itemName: "harina 000", direction: "OUT", qty: 2000 },
    { itemName: "levadura",   direction: "OUT", qty: 40 },
    { itemName: "grasa",      direction: "OUT", qty: 200 },
    { itemName: "sal fina",   direction: "OUT", qty: 30 },
    { itemName: "bollo",      direction: "IN",  qty: 31 },
  ]);

  await ensureRecipe("Panes de chips", "PRODUCTION", [
    { itemName: "harina 000",  direction: "OUT", qty: 1000 },
    { itemName: "sal fina",    direction: "OUT", qty: 20 },
    { itemName: "leche",       direction: "OUT", qty: 230 },
    { itemName: "azucar",      direction: "OUT", qty: 150 },
    { itemName: "huevo",       direction: "OUT", qty: 3 },
    { itemName: "manteca",     direction: "OUT", qty: 90 },
    { itemName: "levadura",    direction: "OUT", qty: 45 },
    { itemName: "pan chip",    direction: "IN",  qty: 60 },
  ]);

  await ensureRecipe("Pasta chips", "PRODUCTION", [
    { itemName: "queso crema", direction: "OUT", qty: 100 },
    { itemName: "jamon comun", direction: "OUT", qty: 50 },
    { itemName: "queso tybo",  direction: "OUT", qty: 50 },
    { itemName: "pasta chips", direction: "IN",  qty: 300 },
  ]);

  await ensureRecipe("Miguelitos", "PRODUCTION", [
    { itemName: "harina 0000",       direction: "OUT", qty: 1000 },
    { itemName: "azucar",            direction: "OUT", qty: 180 },
    { itemName: "manteca",           direction: "OUT", qty: 150 },
    { itemName: "levadura",          direction: "OUT", qty: 80 },
    { itemName: "huevo",             direction: "OUT", qty: 4 },
    { itemName: "leche",             direction: "OUT", qty: 200 },
    { itemName: "sal fina",          direction: "OUT", qty: 5 },
    { itemName: "esencia de vainilla", direction: "OUT", qty: 10 },
    { itemName: "miguelito",         direction: "IN",  qty: 40 },
  ]);

  await ensureRecipe("Crema pastelera", "PRODUCTION", [
    { itemName: "leche",             direction: "OUT", qty: 250 },
    { itemName: "azucar",            direction: "OUT", qty: 80 },
    { itemName: "harina 0000",       direction: "OUT", qty: 50 },
    { itemName: "huevo",             direction: "OUT", qty: 1 },
    { itemName: "esencia de vainilla", direction: "OUT", qty: 10 },
    { itemName: "crema pastelera",   direction: "IN",  qty: 778 },
  ]);

  await ensureRecipe("Pastafrolas", "PRODUCTION", [
    { itemName: "harina leudante",   direction: "OUT", qty: 500 },
    { itemName: "azucar",            direction: "OUT", qty: 100 },
    { itemName: "huevo",             direction: "OUT", qty: 2 },
    { itemName: "manteca",           direction: "OUT", qty: 100 },
    { itemName: "leche",             direction: "OUT", qty: 50 },
    { itemName: "esencia de vainilla", direction: "OUT", qty: 40 },
    { itemName: "membrillo",         direction: "OUT", qty: 500 },
    { itemName: "pastafrola",        direction: "IN",  qty: 8 },
  ]);

  await ensureRecipe("Budin", "PRODUCTION", [
    { itemName: "harina leudante",   direction: "OUT", qty: 290 },
    { itemName: "azucar",            direction: "OUT", qty: 350 },
    { itemName: "huevo",             direction: "OUT", qty: 2 },
    { itemName: "aceite girasol",    direction: "OUT", qty: 100 },
    { itemName: "leche",             direction: "OUT", qty: 100 },
    { itemName: "esencia de vainilla", direction: "OUT", qty: 40 },
    { itemName: "limon",             direction: "OUT", qty: 1 },
    { itemName: "budin",             direction: "IN",  qty: 10 },
  ]);

  await ensureRecipe("Pastel de cabrito", "PRODUCTION", [
    { itemName: "carne de cordero", direction: "OUT", qty: 3000 },
    { itemName: "cabutia",          direction: "OUT", qty: 5000 },
    { itemName: "cebolla",          direction: "OUT", qty: 1000 },
    { itemName: "pimiento",         direction: "OUT", qty: 500 },
    { itemName: "pastel de cabrito porcion", direction: "IN", qty: 8 },
  ]);

  await ensureRecipe("Sopa", "PRODUCTION", [
    { itemName: "cebolla",         direction: "OUT", qty: 500 },
    { itemName: "zanahoria",       direction: "OUT", qty: 600 },
    { itemName: "zapallo",         direction: "OUT", qty: 1600 },
    { itemName: "zapallito verde", direction: "OUT", qty: 200 },
    { itemName: "sopa porcion",    direction: "IN",  qty: 16 },
  ]);

  await ensureRecipe("Focaccia", "PRODUCTION", [
    { itemName: "levadura",       direction: "OUT", qty: 60 },
    { itemName: "harina 000",     direction: "OUT", qty: 1000 },
    { itemName: "sal fina",       direction: "OUT", qty: 8 },
    { itemName: "aceite de oliva", direction: "OUT", qty: 100 },
    { itemName: "ajo",            direction: "OUT", qty: 2 },
    { itemName: "focaccia porcion", direction: "IN", qty: 32 },
  ]);

  await ensureRecipe("Panes de megacito", "PRODUCTION", [
    { itemName: "harina 0000",    direction: "OUT", qty: 1000 },
    { itemName: "levadura",       direction: "OUT", qty: 15 },
    { itemName: "huevo",          direction: "OUT", qty: 1 },
    { itemName: "azucar",         direction: "OUT", qty: 40 },
    { itemName: "sal fina",       direction: "OUT", qty: 20 },
    { itemName: "aceite girasol", direction: "OUT", qty: 100 },
    { itemName: "queso tybo",     direction: "OUT", qty: 50 },
    { itemName: "pan de megacito", direction: "IN", qty: 15 },
  ]);

  await ensureRecipe("Empanadas de carne", "PRODUCTION", [
    { itemName: "harina 0000", direction: "OUT", qty: 8000 },
    { itemName: "pulpa",       direction: "OUT", qty: 3800 },
    { itemName: "papa",        direction: "OUT", qty: 1000 },
    { itemName: "cebolla",     direction: "OUT", qty: 3500 },
    { itemName: "huevo",       direction: "OUT", qty: 20 },
    { itemName: "grasa",       direction: "OUT", qty: 1600 },
    { itemName: "sal fina",    direction: "OUT", qty: 500 },
    { itemName: "pimenton",    direction: "OUT", qty: 200 },
    { itemName: "comino",      direction: "OUT", qty: 100 },
    { itemName: "aji cayena",  direction: "OUT", qty: 70 },
    { itemName: "empanada carne", direction: "IN", qty: 340 },
  ]);

  // Pesto — pesto especie sin costo en planilla; se crea igual
  await ensureRecipe("Pesto", "PRODUCTION", [
    { itemName: "aceite de oliva", direction: "OUT", qty: 150 },
    { itemName: "pesto especie",   direction: "OUT", qty: 100 },
    { itemName: "pesto",           direction: "IN",  qty: 200 },
  ]);

  // Dulce de vino — vino sin costo en planilla; se crea igual
  await ensureRecipe("Dulce de vino", "PRODUCTION", [
    { itemName: "vino",   direction: "OUT", qty: 1000 },
    { itemName: "azucar", direction: "OUT", qty: 250 },
    { itemName: "dulce de vino", direction: "IN", qty: 300 },
  ]);

  // ─── FASE 4: RECETAS DE CONSUMO + LINKS A PRODUCTOS ──────────────────────
  console.log("\n── FASE 4: Recetas de Consumo + Links ──────────────────────");

  // ── Sandwiches ──
  const rvDesmechado = await ensureRecipe("Consumo: Sandwich Desmechado", "CONSUMPTION", [
    { itemName: "desmechado porcion", direction: "OUT", qty: 1 },
    { itemName: "pan de papa XL",     direction: "OUT", qty: 1 },
    { itemName: "tomate",             direction: "OUT", qty: 100 },
    { itemName: "queso tybo",         direction: "OUT", qty: 35 },
    { itemName: "mayo BCN",           direction: "OUT", qty: 50 },
    { itemName: "huevo",              direction: "OUT", qty: 2 },
  ]);
  await linkProductToRecipe("Sandwich Desmechado", rvDesmechado);

  const rvMegacito = await ensureRecipe("Consumo: Megacito", "CONSUMPTION", [
    { itemName: "jamon comun",    direction: "OUT", qty: 35 },
    { itemName: "queso tybo",     direction: "OUT", qty: 35 },
    { itemName: "mayo BCN",       direction: "OUT", qty: 30 },
    { itemName: "tomate",         direction: "OUT", qty: 50 },
    { itemName: "pan de megacito", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Megacito", rvMegacito);

  const rvPatinesa = await ensureRecipe("Consumo: Patinesa", "CONSUMPTION", [
    { itemName: "not mila porcion", direction: "OUT", qty: 1 },
    { itemName: "pan de papa XL",   direction: "OUT", qty: 1 },
    { itemName: "tomate",           direction: "OUT", qty: 100 },
    { itemName: "queso tybo",       direction: "OUT", qty: 35 },
    { itemName: "mayo BCN",         direction: "OUT", qty: 50 },
    { itemName: "huevo",            direction: "OUT", qty: 2 },
  ]);
  await linkProductToRecipe("Patinesa", rvPatinesa);

  const rvBurguer = await ensureRecipe("Consumo: Burguer BCÑ", "CONSUMPTION", [
    { itemName: "carne molida", direction: "OUT", qty: 120 },
    { itemName: "queso tybo",   direction: "OUT", qty: 70 },
    { itemName: "mayo comun",   direction: "OUT", qty: 40 },
    { itemName: "huevo",        direction: "OUT", qty: 1 },
    { itemName: "tomate",       direction: "OUT", qty: 50 },
    { itemName: "pan de papa M", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Burguer BCÑ", rvBurguer);

  const rvMilanesa = await ensureRecipe("Consumo: Sandwich de Milanesa", "CONSUMPTION", [
    { itemName: "pulpa",          direction: "OUT", qty: 200 },
    { itemName: "pan rallado",    direction: "OUT", qty: 25 },
    { itemName: "aceite girasol", direction: "OUT", qty: 15 },
    { itemName: "huevo",          direction: "OUT", qty: 1 },
    { itemName: "tomate",         direction: "OUT", qty: 100 },
    { itemName: "mayo comun",     direction: "OUT", qty: 40 },
    { itemName: "pan de milanesa", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Sandwich de Milanesa", rvMilanesa);

  const rvMigaJQ = await ensureRecipe("Consumo: Sandwich de miga jamon y queso", "CONSUMPTION", [
    { itemName: "queso tybo",        direction: "OUT", qty: 21.25 },
    { itemName: "jamon comun",       direction: "OUT", qty: 35 },
    { itemName: "mayo comun",        direction: "OUT", qty: 50 },
    { itemName: "leche",             direction: "OUT", qty: 10 },
    { itemName: "manteca",           direction: "OUT", qty: 50 },
    { itemName: "plancha pan de miga", direction: "OUT", qty: 0.5 },
  ]);
  await linkProductToRecipe("Sandwich de miga jamón y queso", rvMigaJQ);

  const rvMigaHJQ = await ensureRecipe("Consumo: Sandwich de miga huevo jamon y queso", "CONSUMPTION", [
    { itemName: "queso tybo",        direction: "OUT", qty: 21.25 },
    { itemName: "jamon comun",       direction: "OUT", qty: 35 },
    { itemName: "mayo comun",        direction: "OUT", qty: 50 },
    { itemName: "leche",             direction: "OUT", qty: 10 },
    { itemName: "manteca",           direction: "OUT", qty: 50 },
    { itemName: "plancha pan de miga", direction: "OUT", qty: 0.75 },
    { itemName: "huevo",             direction: "OUT", qty: 0.75 },
  ]);
  await linkProductToRecipe("Sandwich de miga huevo, jamon y queso", rvMigaHJQ);

  // ── Pizzas ──
  const rvPizzaMuzz = await ensureRecipe("Consumo: Pizza Muzzarella", "CONSUMPTION", [
    { itemName: "prepizza C",       direction: "OUT", qty: 1 },
    { itemName: "queso muzzarella", direction: "OUT", qty: 200 },
    { itemName: "salsa de tomate",  direction: "OUT", qty: 100 },
    { itemName: "aceitunas",        direction: "OUT", qty: 25 },
  ]);
  await linkProductToRecipe("Pizza Individual (4 porciones)", rvPizzaMuzz);

  // Pizza Huevos y Pizza Pesto: creadas, sin link — agregar productos POS si se venden separadas
  await ensureRecipe("Consumo: Pizza Huevos", "CONSUMPTION", [
    { itemName: "prepizza C",       direction: "OUT", qty: 1 },
    { itemName: "queso muzzarella", direction: "OUT", qty: 200 },
    { itemName: "salsa de tomate",  direction: "OUT", qty: 100 },
    { itemName: "aceitunas",        direction: "OUT", qty: 25 },
    { itemName: "huevo",            direction: "OUT", qty: 1 },
  ]);

  await ensureRecipe("Consumo: Pizza Pesto", "CONSUMPTION", [
    { itemName: "prepizza C",       direction: "OUT", qty: 1 },
    { itemName: "queso muzzarella", direction: "OUT", qty: 200 },
    { itemName: "salsa de tomate",  direction: "OUT", qty: 100 },
    { itemName: "aceitunas",        direction: "OUT", qty: 25 },
    { itemName: "pesto",            direction: "OUT", qty: 40 },
  ]);

  // ── Sopa ──
  const rvSopa = await ensureRecipe("Consumo: Sopa", "CONSUMPTION", [
    { itemName: "sopa porcion",    direction: "OUT", qty: 1 },
    { itemName: "focaccia porcion", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Sopa c/ focaccia", rvSopa);

  // ── Pastelería ──
  await linkProductToItem("Medialuna x1", "medialuna");
  await linkProductToItem("Churro x1", "churro");
  await linkProductToItem("Bollo casero c/ queso crema y mermelada", "bollo");

  const rvChips = await ensureRecipe("Consumo: Chip de Jamon y Queso", "CONSUMPTION", [
    { itemName: "pan chip",       direction: "OUT", qty: 1 },
    { itemName: "queso crema",    direction: "OUT", qty: 20 },
    { itemName: "jamon comun",    direction: "OUT", qty: 10 },
    { itemName: "queso tybo",     direction: "OUT", qty: 10 },
    { itemName: "aceite de oliva", direction: "OUT", qty: 2 },
  ]);
  await linkProductToRecipe("Chip de Jamon y Queso x2", rvChips);

  const rvMiguelitos = await ensureRecipe("Consumo: Miguelitos", "CONSUMPTION", [
    { itemName: "miguelito",    direction: "OUT", qty: 1 },
    { itemName: "dulce de leche", direction: "OUT", qty: 30 },
  ]);
  await linkProductToRecipe("Miguelitos c/ dulce de leche x2", rvMiguelitos);

  const rvAlfajor = await ensureRecipe("Consumo: Alfajor de algarroba", "CONSUMPTION", [
    { itemName: "tapa de algarroba", direction: "OUT", qty: 1 },
    { itemName: "dulce de leche",    direction: "OUT", qty: 10 },
    { itemName: "coco rallado",      direction: "OUT", qty: 2 },
    { itemName: "baño repostero",    direction: "OUT", qty: 20 },
  ]);
  await linkProductToRecipe("Alfajor de algarroba BCÑ", rvAlfajor);

  // Sacramento: sin link — agregar producto POS si aplica
  await ensureRecipe("Consumo: Sacramento", "CONSUMPTION", [
    { itemName: "sacramento", direction: "OUT", qty: 1 },
  ]);

  // ── Empanadas — item directo ──
  await linkProductToItem("Empanada de carne x unidad", "empanada carne");
  await linkProductToItem("Empanada de queso x unidad", "empanada queso");
  await linkProductToItem("Empanada de caprese x unidad", "empanada caprese");
  await linkProductToItem("Empanada de choclo x unidad", "empanada choclo");

  // Yasgua: sin link — agregar producto POS si aplica
  await ensureRecipe("Consumo: Yasgua", "CONSUMPTION", [
    { itemName: "empanada carne",  direction: "OUT", qty: 1 },
    { itemName: "pure de tomate",  direction: "OUT", qty: 40 },
    { itemName: "aceite girasol",  direction: "OUT", qty: 5 },
    { itemName: "sal fina",        direction: "OUT", qty: 10 },
  ]);

  // ── Brunch / Platos ──
  const rvHuevosBCN = await ensureRecipe("Consumo: Huevos BCÑ", "CONSUMPTION", [
    { itemName: "huevo",      direction: "OUT", qty: 2 },
    { itemName: "tomate",     direction: "OUT", qty: 100 },
    { itemName: "queso tybo", direction: "OUT", qty: 35 },
    { itemName: "jamon comun", direction: "OUT", qty: 35 },
  ]);
  await linkProductToRecipe("Huevos BCÑ", rvHuevosBCN);

  const rvHuevosDuros = await ensureRecipe("Consumo: Huevos duros", "CONSUMPTION", [
    { itemName: "huevo",         direction: "OUT", qty: 2 },
    { itemName: "salsa terayki", direction: "OUT", qty: 60 },
  ]);
  await linkProductToRecipe("Huevos duros x2", rvHuevosDuros);

  const rvPollo = await ensureRecipe("Consumo: Pollo al plato", "CONSUMPTION", [
    { itemName: "pollo",          direction: "OUT", qty: 200 },
    { itemName: "crema de leche", direction: "OUT", qty: 40 },
    { itemName: "tomate",         direction: "OUT", qty: 50 },
    { itemName: "cebolla",        direction: "OUT", qty: 50 },
    { itemName: "pimiento",       direction: "OUT", qty: 10 },
  ]);
  await linkProductToRecipe("Pollo a la crema c/ guarnicion", rvPollo);

  const rvBondiola = await ensureRecipe("Consumo: Bondiola a la cerveza", "CONSUMPTION", [
    { itemName: "bondiola",       direction: "OUT", qty: 200 },
    { itemName: "crema de leche", direction: "OUT", qty: 40 },
    { itemName: "tomate",         direction: "OUT", qty: 50 },
    { itemName: "cebolla",        direction: "OUT", qty: 50 },
    { itemName: "pimiento",       direction: "OUT", qty: 10 },
  ]);
  await linkProductToRecipe("Bondiola a la cerveza c/ guarnicion", rvBondiola);

  // ── Bebidas — item directo ──
  await linkProductToItem("Agua con gas", "agua con gas 500ml");
  await linkProductToItem("Agua sin gas", "agua sin gas 500ml");
  await linkProductToItem("Jugo citric de 500ml", "jugo citric 500ml");
  await linkProductToItem("Jugo citric de 1L", "jugo citric 1L");
  await linkProductToItem("Cerveza rubia", "cerveza rubia");
  await linkProductToItem("Cerveza negra", "cerveza negra");

  // Gaseosas — item genérico (las compras van por marca, el consumo descuenta genérico)
  const rvGaseosa500 = await ensureRecipe("Consumo: Gaseosa 500ml", "CONSUMPTION", [
    { itemName: "gaseosa 500ml", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Gaseosa de 500ml", rvGaseosa500);

  const rvGaseosa375 = await ensureRecipe("Consumo: Gaseosa 375ml", "CONSUMPTION", [
    { itemName: "gaseosa 375ml", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Gaseosa de 375ml", rvGaseosa375);

  // Energizante — usa "energizante monster mango" como proxy (ajustar si se quiere tracking fino)
  const rvEnergizante = await ensureRecipe("Consumo: Energizante", "CONSUMPTION", [
    { itemName: "energizante monster mango", direction: "OUT", qty: 1 },
  ]);
  await linkProductToRecipe("Energizante Monster o Speed", rvEnergizante);

  // Licuados
  const rvLicuado600 = await ensureRecipe("Consumo: Licuado 600ml", "CONSUMPTION", [
    { itemName: "fruta porcion", direction: "OUT", qty: 1 },
    { itemName: "azucar",        direction: "OUT", qty: 80 },
  ]);
  await linkProductToRecipe("Licuado de 600ml", rvLicuado600);

  const rvLicuado1L = await ensureRecipe("Consumo: Licuado 1L", "CONSUMPTION", [
    { itemName: "fruta porcion", direction: "OUT", qty: 1 },
    { itemName: "leche",         direction: "OUT", qty: 250 },
    { itemName: "azucar",        direction: "OUT", qty: 80 },
  ]);
  await linkProductToRecipe("Licuado de 1L", rvLicuado1L);

  // ── Snacks — item directo ──
  await linkProductToItem("Galletas Chocolinas de 170gr", "galletas chocolinas x170gr");
  await linkProductToItem("Galletas Chocolinas de 250gr", "galletas chocolinas x250gr");
  await linkProductToItem("Galletas Oreos de 118gr", "galletas oreos x118gr");
  await linkProductToItem("Galletas Pepitos de 118gr", "galletas pepitos x118gr");
  await linkProductToItem("Galletas coquitas de 117gr", "galletas coquitas x177gr"); // POS 117gr ≠ insumos 177gr — confirmar
  await linkProductToItem("Galletas Mini oreos", "galletas oreos mini");
  await linkProductToItem("Galletas Mini pepitos", "galletas pepitos mini");
  await linkProductToItem("Galletas Hogareñas saladas", "galletas donsatur salada"); // DonSatur Hogareñas
  await linkProductToItem("Galletas Don Santur saladas", "galletas donsatur salada");
  await linkProductToItem("Alfajor rasta", "alfajor rasta");
  await linkProductToItem("Caramelos Halls", "caramelos halls");
  await linkProductToItem("Gomitas Mogul", "gomitas mogul x12");
  await linkProductToItem("Chicles Topline", "chicles topline");
  await linkProductToItem("Cigarrillos", "cigarrillos hills");
  await linkProductToItem("Encendedor", "encendedor");

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n✅ Migración completada exitosamente");
  console.log("\nPENDIENTES (ver notas al inicio del archivo):");
  console.log("  [?] Galletas coquitas — confirmar si son 117gr o 177gr");
  console.log("  [?] Pizza Huevos / Pizza Pesto — crear productos POS si aplica");
  console.log("  [?] Sacramento / Yasgua — crear productos POS si aplica");
  console.log("  [?] Energizante — receta usa monster mango como proxy");
  console.log("  [?] Desactivar items ficticios del seed en Prisma Studio");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
