import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { UnitConversionService } from "./unitConversionService";
import { StockDefaultsService } from "./stockDefaultsService";

type DashboardItem = {
  id: string;
  name: string;
  unit: string;        // base unit (ledger unit)
  displayUnit: string; // user-facing unit
  category: { id: string; name: string };
  targetDaysCover: number;
  currentQty: string;        // in displayUnit
  currentQtyBase: string;    // in base unit (for internal use)
  recommendedQty: string;    // in displayUnit
  semaforo: "GREEN" | "YELLOW" | "RED";
};

export class StockDashboardService {
  static async getBaconaDashboard() {
    const { bacona } = await StockDefaultsService.ensureDefaultLocations(prisma);

    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    });

    const currentRows = await prisma.$queryRaw<
      Array<{ inventoryItemId: string; currentQty: string | number | null }>
    >`
      SELECT
        l."inventoryItemId" as "inventoryItemId",
        SUM(CASE WHEN l."direction" = 'IN' THEN l."qty" ELSE -l."qty" END) as "currentQty"
      FROM "StockMovementLine" l
      WHERE l."locationId" = ${bacona.id}
      GROUP BY l."inventoryItemId"
    `;

    const currentByItemId = new Map<string, Prisma.Decimal>();
    for (const r of currentRows) {
      const qty = r.currentQty ?? 0;
      currentByItemId.set(r.inventoryItemId, new Prisma.Decimal(qty as any));
    }

    const outflowRows = await prisma.$queryRaw<
      Array<{ inventoryItemId: string; outQty90d: string | number | null }>
    >`
      SELECT
        l."inventoryItemId" as "inventoryItemId",
        SUM(l."qty") as "outQty90d"
      FROM "StockMovementLine" l
      JOIN "StockMovement" m ON m."id" = l."movementId"
      WHERE l."locationId" = ${bacona.id}
        AND l."direction" = 'OUT'
        AND m."occurredAt" >= NOW() - INTERVAL '90 days'
        AND m."type" IN ('SALE', 'PRODUCTION', 'LOSS')
      GROUP BY l."inventoryItemId"
    `;

    const outflowByItemId = new Map<string, Prisma.Decimal>();
    for (const r of outflowRows) {
      const qty = r.outQty90d ?? 0;
      outflowByItemId.set(r.inventoryItemId, new Prisma.Decimal(qty as any));
    }

    const dashboardItems: DashboardItem[] = items.map((it) => {
      const currentBase = currentByItemId.get(it.id) ?? new Prisma.Decimal(0);
      const out90 = outflowByItemId.get(it.id) ?? new Prisma.Decimal(0);
      const avgDaily = out90.div(90);
      const recommendedBase = avgDaily.mul(it.targetDaysCover);

      // Convert base quantities to displayUnit for semaforo comparison (same unit = same ratio)
      const semaforo = (() => {
        if (recommendedBase.lte(0)) return "GREEN";
        if (currentBase.gte(recommendedBase)) return "GREEN";
        if (currentBase.gte(recommendedBase.mul(0.7))) return "YELLOW";
        return "RED";
      })();

      // Convert to displayUnit for presentation
      const currentDisplay = UnitConversionService.toDisplayQty({
        qtyBase: currentBase,
        baseUnit: it.unit,
        displayUnit: it.displayUnit,
      });
      const recommendedDisplay = UnitConversionService.toDisplayQty({
        qtyBase: recommendedBase,
        baseUnit: it.unit,
        displayUnit: it.displayUnit,
      });

      return {
        id: it.id,
        name: it.name,
        unit: it.unit,
        displayUnit: it.displayUnit,
        category: { id: it.category.id, name: it.category.name },
        targetDaysCover: it.targetDaysCover,
        currentQty: currentDisplay.toFixed(3).replace(/\.?0+$/, "") || "0",
        currentQtyBase: currentBase.toString(),
        recommendedQty: recommendedDisplay.toFixed(3).replace(/\.?0+$/, "") || "0",
        semaforo,
      };
    });

    return {
      location: { id: bacona.id, code: bacona.code, label: bacona.label },
      items: dashboardItems,
    };
  }
}
