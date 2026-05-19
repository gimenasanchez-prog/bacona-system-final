import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ProductionService } from "@/modules/produccion/services/productionService";

export async function GET() {
  const batches = await prisma.productionBatch.findMany({
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: {
      location: { select: { id: true, code: true, label: true } },
      lines: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  return NextResponse.json({ batches });
}

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);

const CreateBatchSchema = z.object({
  occurredAt: z.string().datetime().optional(),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]).optional(),
  deviationFlag: z.boolean().optional(),
  deviationReason: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        direction: z.enum(["IN", "OUT"]),
        qty: z.union([z.number().positive(), z.string().min(1)]),
        unit: STOCK_UNIT.nullable().optional(),
        uomId: z.string().nullable().optional(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateBatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const batch = await ProductionService.createAndConfirmBatch({
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
      locationCode: parsed.data.locationCode,
      deviationFlag: parsed.data.deviationFlag,
      deviationReason: parsed.data.deviationReason,
      lines: parsed.data.lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        direction: l.direction,
        qty: l.qty,
        unit: l.unit ?? null,
        uomId: l.uomId ?? null,
      })),
    });
    return NextResponse.json({ batch });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

