import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { LossService } from "@/modules/mermas/services/lossService";

export async function GET() {
  const lossEvents = await prisma.lossEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: {
      location: { select: { id: true, code: true, label: true } },
      lines: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  return NextResponse.json({ lossEvents });
}

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);

const CreateLossSchema = z.object({
  reasonType: z.enum(["DURING_PRODUCTION", "DURING_SALE_PREP", "SPOILED", "OTHER"]),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]).optional(),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        qty: z.union([z.number().positive(), z.string().min(1)]),
        unit: STOCK_UNIT.nullable().optional(),
        uomId: z.string().nullable().optional(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateLossSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const lossEvent = await LossService.createLossEvent({
      reasonType: parsed.data.reasonType,
      locationCode: parsed.data.locationCode,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
      notes: parsed.data.notes,
      lines: parsed.data.lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        qty: l.qty,
        unit: l.unit ?? null,
        uomId: l.uomId ?? null,
      })),
    });
    return NextResponse.json({ lossEvent });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

