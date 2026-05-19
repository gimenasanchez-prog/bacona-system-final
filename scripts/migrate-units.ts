/**
 * Data migration: conversiones de unidades
 *
 * Qué hace:
 *   1. Para cada InventoryItem, infiere dimension + displayUnit del campo `unit` actual.
 *   2. Si el ítem tenía `unit = L`  → cambia unit a ML, displayUnit = L,  dimension = VOLUME.
 *      Si el ítem tenía `unit = KG` → cambia unit a G,  displayUnit = KG, dimension = MASS.
 *      Otros (ML, G, UN) → solo asigna dimension + displayUnit correctos (unit no cambia).
 *   3. Convierte todos los StockMovementLine.qty del ítem:
 *      - qty_nueva = qty_vieja × 1000  (para L→ML y KG→G)
 *   4. También convierte RecipeLine.qty, ProductionBatchLine.qty, PurchaseLine.qty,
 *      LossEventLine.qty para los ítems afectados.
 *
 * Cómo ejecutar (después de correr `npm run prisma:migrate`):
 *   npx ts-node --project tsconfig.json scripts/migrate-units.ts
 *   o bien:
 *   npx tsx scripts/migrate-units.ts
 *
 * IMPORTANTE: hacer backup de la DB antes de correr este script.
 * El script es idempotente: si unit ya es ML/G/UN y dimension ya está seteado, no hace nada.
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type ConversionRule = {
  newUnit: "ML" | "G" | "UN";
  displayUnit: "L" | "KG" | "ML" | "G" | "UN";
  dimension: "VOLUME" | "MASS" | "COUNT";
  multiplier: number; // multiply existing qty by this to get base qty
};

const RULES: Record<string, ConversionRule> = {
  L: { newUnit: "ML", displayUnit: "L", dimension: "VOLUME", multiplier: 1000 },
  KG: { newUnit: "G", displayUnit: "KG", dimension: "MASS", multiplier: 1000 },
  ML: { newUnit: "ML", displayUnit: "ML", dimension: "VOLUME", multiplier: 1 },
  G: { newUnit: "G", displayUnit: "G", dimension: "MASS", multiplier: 1 },
  UN: { newUnit: "UN", displayUnit: "UN", dimension: "COUNT", multiplier: 1 },
};

async function main() {
  const items = await prisma.inventoryItem.findMany();

  let updated = 0;
  let converted = 0;

  for (const item of items) {
    const rule = RULES[item.unit];
    if (!rule) {
      console.warn(`[SKIP] Item "${item.name}" (id: ${item.id}) has unknown unit: ${item.unit}`);
      continue;
    }

    // Skip if already migrated (dimension and displayUnit already set correctly)
    const alreadyMigrated =
      item.dimension === rule.dimension &&
      item.displayUnit === rule.displayUnit &&
      item.unit === rule.newUnit;

    if (alreadyMigrated) {
      console.log(`[OK]   "${item.name}" already migrated (${item.unit} / ${item.displayUnit})`);
      continue;
    }

    const needsQtyConversion = rule.multiplier !== 1;

    await prisma.$transaction(async (tx) => {
      // 1. Update InventoryItem
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          unit: rule.newUnit,
          displayUnit: rule.displayUnit,
          dimension: rule.dimension,
        },
      });

      if (needsQtyConversion) {
        // 2. Convert StockMovementLine.qty
        await tx.$executeRaw`
          UPDATE "StockMovementLine"
          SET "qty" = "qty" * ${rule.multiplier}
          WHERE "inventoryItemId" = ${item.id}
        `;

        // 3. Convert RecipeLine.qty
        await tx.$executeRaw`
          UPDATE "RecipeLine"
          SET "qty" = "qty" * ${rule.multiplier}
          WHERE "inventoryItemId" = ${item.id}
        `;

        // 4. Convert ProductionBatchLine.qty (base qty only — not entryQty)
        await tx.$executeRaw`
          UPDATE "ProductionBatchLine"
          SET "qty" = "qty" * ${rule.multiplier}
          WHERE "inventoryItemId" = ${item.id}
        `;

        // 5. Convert PurchaseLine.qty (base qty only)
        await tx.$executeRaw`
          UPDATE "PurchaseLine"
          SET "qty" = "qty" * ${rule.multiplier}
          WHERE "inventoryItemId" = ${item.id}
        `;

        // 6. Convert LossEventLine.qty (base qty only)
        await tx.$executeRaw`
          UPDATE "LossEventLine"
          SET "qty" = "qty" * ${rule.multiplier}
          WHERE "inventoryItemId" = ${item.id}
        `;

        converted++;
        console.log(
          `[CONV] "${item.name}": ${item.unit} → ${rule.newUnit} (×${rule.multiplier}, display: ${rule.displayUnit})`
        );
      } else {
        updated++;
        console.log(
          `[UPD]  "${item.name}": unit=${rule.newUnit}, displayUnit=${rule.displayUnit}, dimension=${rule.dimension}`
        );
      }
    });
  }

  console.log(`\nDone. Updated: ${updated}, Converted (qty ×1000): ${converted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
