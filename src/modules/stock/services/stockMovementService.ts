import { Prisma, StockMovementDirection, StockMovementType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { StockDefaultsService } from "./stockDefaultsService";

type Db = PrismaClient | Prisma.TransactionClient;

function oppositeDirection(dir: StockMovementDirection): StockMovementDirection {
  return dir === "IN" ? "OUT" : "IN";
}

export class StockMovementService {
  static async ensureSaleMovement(db: Db, saleId: string) {
    const existing = await db.stockMovement.findUnique({ where: { posSaleId: saleId } });
    if (existing) return existing;

    const { bacona } = await StockDefaultsService.ensureDefaultLocations(db);

    const sale = await db.posSale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                inventoryItemId: true,
                consumptionRecipeVersionId: true,
              },
            },
            modifiers: {
              include: {
                modifierOption: {
                  select: {
                    inventoryItemId: true,
                    inventoryQty: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!sale) throw new Error("Sale not found");

    const recipeIds = [
      ...new Set(
        sale.items
          .map((i) => i.product.consumptionRecipeVersionId)
          .filter((v): v is string => !!v)
      ),
    ];

    const recipeLinesByVersionId = new Map<string, Array<{ inventoryItemId: string; direction: StockMovementDirection; qty: Prisma.Decimal }>>();
    if (recipeIds.length) {
      const lines = await db.recipeLine.findMany({
        where: { recipeVersionId: { in: recipeIds } },
        select: { recipeVersionId: true, inventoryItemId: true, direction: true, qty: true, sortOrder: true },
        orderBy: [{ recipeVersionId: "asc" }, { sortOrder: "asc" }],
      });
      for (const l of lines) {
        const arr = recipeLinesByVersionId.get(l.recipeVersionId) ?? [];
        arr.push({ inventoryItemId: l.inventoryItemId, direction: l.direction, qty: l.qty });
        recipeLinesByVersionId.set(l.recipeVersionId, arr);
      }
    }

    const totals = new Map<string, Prisma.Decimal>();
    const directions = new Map<string, StockMovementDirection>();
    for (const item of sale.items) {
      const product = item.product;
      if (product.inventoryItemId && product.consumptionRecipeVersionId) {
        throw new Error("Product has both inventoryItemId and consumptionRecipeVersionId");
      }

      if (product.consumptionRecipeVersionId) {
        const lines = recipeLinesByVersionId.get(product.consumptionRecipeVersionId) ?? [];
        for (const l of lines) {
          const key = `${l.inventoryItemId}:${l.direction}`;
          const qty = l.qty.mul(item.qty);
          totals.set(key, (totals.get(key) ?? new Prisma.Decimal(0)).add(qty));
          directions.set(key, l.direction);
        }
      } else if (product.inventoryItemId) {
        const key = `${product.inventoryItemId}:OUT`;
        const qty = new Prisma.Decimal(item.qty);
        totals.set(key, (totals.get(key) ?? new Prisma.Decimal(0)).add(qty));
        directions.set(key, "OUT");
      }

      for (const mod of item.modifiers) {
        const opt = mod.modifierOption;
        if (opt.inventoryItemId && opt.inventoryQty) {
          const key = `${opt.inventoryItemId}:OUT`;
          const qty = opt.inventoryQty.mul(item.qty);
          totals.set(key, (totals.get(key) ?? new Prisma.Decimal(0)).add(qty));
          directions.set(key, "OUT");
        }
      }
    }

    const linesToCreate = [...totals.entries()]
      .filter(([, qty]) => qty.gt(0))
      .map(([key, qty], idx) => {
        const [inventoryItemId] = key.split(":");
        const direction = directions.get(key);
        if (!direction) throw new Error("Missing direction for movement line");
        return {
          inventoryItemId,
          locationId: bacona.id,
          direction,
          qty,
          sortOrder: idx,
        };
      });

    return db.stockMovement.create({
      data: {
        type: StockMovementType.SALE,
        posSaleId: saleId,
        occurredAt: new Date(),
        lines: { create: linesToCreate },
      },
    });
  }

  static async ensureReversalForSaleMovement(db: Db, saleId: string) {
    const movement = await db.stockMovement.findUnique({
      where: { posSaleId: saleId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!movement) return null;
    return this.ensureReversalForMovement(db, movement.id);
  }

  static async ensureReversalForMovement(db: Db, movementId: string) {
    const existing = await db.stockMovement.findUnique({ where: { reversesMovementId: movementId } });
    if (existing) return existing;

    const movement = await db.stockMovement.findUnique({
      where: { id: movementId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!movement) throw new Error("Stock movement not found");

    return db.stockMovement.create({
      data: {
        type: StockMovementType.ADJUSTMENT,
        occurredAt: new Date(),
        notes: `Reversal of movement ${movement.id}`,
        reversesMovementId: movement.id,
        lines: {
          create: movement.lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            locationId: l.locationId,
            direction: oppositeDirection(l.direction),
            qty: l.qty,
            sortOrder: l.sortOrder,
          })),
        },
      },
    });
  }
}

