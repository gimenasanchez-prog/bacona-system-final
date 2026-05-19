/**
 * Bulk import script: InventoryCategories + InventoryItems from CSV.
 *
 * Usage:
 *   npx tsx prisma/import-stock-catalog.ts [path/to/file.csv]
 *
 * Default CSV path: prisma/data/stock-catalog.csv
 *
 * CSV format (header row required):
 *   category,name,unit,dimension,displayUnit,targetDaysCover
 *
 * Valid values:
 *   unit / displayUnit : UN | KG | G | L | ML
 *   dimension          : COUNT | MASS | VOLUME
 *   targetDaysCover    : integer (default: 14)
 *
 * The script is idempotent — safe to re-run after editing the CSV.
 * Categories are upserted by name. Items are upserted by (name, categoryId).
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Prisma client (same pattern as seed.ts)
// ---------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const StockUnit = z.enum(["UN", "KG", "G", "L", "ML"]);
const StockDimension = z.enum(["COUNT", "MASS", "VOLUME"]);

const RowSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  unit: StockUnit,
  dimension: StockDimension,
  displayUnit: StockUnit,
  targetDaysCover: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 14))
    .pipe(z.number().int().positive()),
});

type Row = z.infer<typeof RowSchema>;

// ---------------------------------------------------------------------------
// CSV parser (no dependencies beyond Node built-ins)
// ---------------------------------------------------------------------------
function parseCsv(filePath: string): { rows: Row[]; errors: string[] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV has no data rows (only header or empty)"] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const required = ["category", "name", "unit", "dimension", "displayUnit"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}`] };
  }

  const rows: Row[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] ?? "";
    });

    const result = RowSchema.safeParse(raw);
    if (!result.success) {
      const msg = result.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      errors.push(`Row ${i + 1}: ${msg}`);
    } else {
      rows.push(result.data);
    }
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Import logic
// ---------------------------------------------------------------------------
async function importCatalog(rows: Row[]) {
  // Collect unique category names in CSV order
  const categoryNames = [...new Set(rows.map((r) => r.category))];

  // Upsert categories (by name) — assign sortOrder by first appearance
  const categoryMap = new Map<string, string>(); // name → id

  let catIdx = 0;
  for (const name of categoryNames) {
    // Find current max sortOrder so we append, not overwrite existing ones
    const existing = await prisma.inventoryCategory.findFirst({
      where: { name },
      select: { id: true, sortOrder: true },
    });

    if (existing) {
      categoryMap.set(name, existing.id);
    } else {
      const maxSort = await prisma.inventoryCategory.aggregate({
        _max: { sortOrder: true },
      });
      const nextSort = (maxSort._max.sortOrder ?? -1) + 1 + catIdx;
      const created = await prisma.inventoryCategory.create({
        data: { name, sortOrder: nextSort },
        select: { id: true },
      });
      categoryMap.set(name, created.id);
      catIdx++;
    }
  }

  // Upsert items by (name, categoryId) — no unique constraint in schema,
  // so we use findFirst + create/update manually.
  let itemsUpserted = 0;
  for (const row of rows) {
    const categoryId = categoryMap.get(row.category)!;

    const existing = await prisma.inventoryItem.findFirst({
      where: { name: row.name, categoryId },
      select: { id: true },
    });

    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: {
          unit: row.unit,
          dimension: row.dimension,
          displayUnit: row.displayUnit,
          targetDaysCover: row.targetDaysCover,
        },
      });
    } else {
      await prisma.inventoryItem.create({
        data: {
          categoryId,
          name: row.name,
          unit: row.unit,
          dimension: row.dimension,
          displayUnit: row.displayUnit,
          targetDaysCover: row.targetDaysCover,
        },
      });
    }
    itemsUpserted++;
  }

  return { categoriesUpserted: categoryNames.length, itemsUpserted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "data/stock-catalog.csv");

  console.log(`\nReading CSV: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const { rows, errors } = parseCsv(csvPath);

  if (errors.length > 0) {
    console.error("\nValidation errors found — fix these before importing:\n");
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    if (rows.length === 0) process.exit(1);
    console.warn(`\nProceeding with ${rows.length} valid row(s), skipping ${errors.length} error(s).\n`);
  } else {
    console.log(`Parsed ${rows.length} rows — no validation errors.\n`);
  }

  const { categoriesUpserted, itemsUpserted } = await importCatalog(rows);

  console.log("Done.");
  console.log(`  Categories upserted : ${categoriesUpserted}`);
  console.log(`  Items upserted      : ${itemsUpserted}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
