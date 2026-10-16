/**
 * Script puntual — octubre 2026
 *   1. Crea el producto POS "Hojas de coca x 25grs" ($4.500) en Snacks y Kiosco
 *   2. Lo vincula 1:1 al ítem de stock "hojas de coca x25gr"
 *   3. Deja el stock actual en Bacona en 10 UN (movimiento ADJUSTMENT por la diferencia)
 *
 * Idempotente: se puede correr más de una vez sin duplicar.
 * Ejecutar: npx tsx prisma/add-hojas-coca-25.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PRODUCT_NAME = "Hojas de coca x 25grs";
const PRICE_CENTS = 450000;
const ITEM_NAME = "hojas de coca x25gr";
const TARGET_QTY = 10;

async function main() {
  // ── 1. Producto ──────────────────────────────────────────────────────────
  const category = await prisma.category.findFirst({ where: { name: "Snacks y Kiosco" } });
  if (!category) throw new Error("Categoría 'Snacks y Kiosco' no encontrada");

  let item = await prisma.inventoryItem.findFirst({
    where: { name: { equals: ITEM_NAME, mode: "insensitive" } },
  });
  if (!item) {
    let stockCat = await prisma.inventoryCategory.findFirst({ where: { name: "Snacks y Kiosco" } });
    if (!stockCat) {
      stockCat = await prisma.inventoryCategory.create({
        data: { name: "Snacks y Kiosco", sortOrder: 90, isActive: true },
      });
    }
    item = await prisma.inventoryItem.create({
      data: {
        name: ITEM_NAME,
        categoryId: stockCat.id,
        unit: "UN",
        dimension: "COUNT",
        displayUnit: "UN",
        isActive: true,
        targetDaysCover: 14,
      },
    });
    console.log(`Creado ítem de stock: ${ITEM_NAME}`);
  }

  let product = await prisma.product.findFirst({ where: { name: PRODUCT_NAME } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: PRODUCT_NAME,
        priceCents: PRICE_CENTS,
        isActive: true,
        inventoryItemId: item.id,
      },
    });
    console.log(`Creado: ${PRODUCT_NAME} ($4.500) → stock '${ITEM_NAME}'`);
  } else {
    console.log(`Ya existe: ${PRODUCT_NAME}`);
    if (!product.inventoryItemId && !product.consumptionRecipeVersionId) {
      await prisma.product.update({ where: { id: product.id }, data: { inventoryItemId: item.id } });
      console.log(`   Vinculado a stock '${ITEM_NAME}'`);
    }
  }

  // ── 2. Stock actual en Bacona = 10 ───────────────────────────────────────
  const bacona = await prisma.stockLocation.findFirst({ where: { code: "BACONA" } });
  if (!bacona) throw new Error("Ubicación BACONA no encontrada");

  const sums = await prisma.stockMovementLine.groupBy({
    by: ["direction"],
    where: { inventoryItemId: item.id, locationId: bacona.id },
    _sum: { qty: true },
  });
  const sumOf = (d: "IN" | "OUT") =>
    Number(sums.find((s) => s.direction === d)?._sum.qty ?? 0);
  const current = sumOf("IN") - sumOf("OUT");
  const diff = TARGET_QTY - current;
  console.log(`Stock actual en Bacona: ${current} UN`);

  if (diff === 0) {
    console.log("   Ya está en 10, no se ajusta");
  } else {
    await prisma.stockMovement.create({
      data: {
        type: "ADJUSTMENT",
        occurredAt: new Date(),
        notes: `INVENTORY_COUNT: carga inicial ${PRODUCT_NAME} (${TARGET_QTY} UN)`,
        externalKey: `init-stock:${item.id}:bacona:2026-10`,
        lines: {
          create: [{
            inventoryItemId: item.id,
            locationId: bacona.id,
            direction: diff > 0 ? "IN" : "OUT",
            qty: new Prisma.Decimal(Math.abs(diff)),
          }],
        },
      },
    });
    console.log(`   Ajuste ${diff > 0 ? "IN" : "OUT"} ${Math.abs(diff)} UN → stock = ${TARGET_QTY}`);
  }

  console.log("\n✅ Listo");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
