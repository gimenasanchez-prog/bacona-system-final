import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const CreateMovementSchema = z.object({
  type: z.enum(["ADJUSTMENT", "INVENTORY_COUNT"]),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      inventoryItemId: z.string(),
      direction: z.enum(["IN", "OUT"]),
      qty: z.number().gt(0),
    })
  ).min(1),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const now = new Date();
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = parsed.data.to ? new Date(parsed.data.to) : now;

  const movements = await prisma.stockMovement.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    include: {
      lines: {
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true } },
          location: { select: { id: true, code: true, label: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), movements });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CreateMovementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const { type, locationCode, notes, lines } = parsed.data;

    const location = await prisma.stockLocation.findFirst({
      where: { code: locationCode },
    });
    if (!location) {
      return NextResponse.json({ error: `Location ${locationCode} not found` }, { status: 404 });
    }

    const movement = await prisma.stockMovement.create({
      data: {
        type: type === "INVENTORY_COUNT" ? "ADJUSTMENT" : type,
        occurredAt: new Date(),
        notes: type === "INVENTORY_COUNT" ? `INVENTORY_COUNT: ${notes || ""}` : notes,
        lines: {
          create: lines.map((l, idx) => ({
            inventoryItemId: l.inventoryItemId,
            locationId: location.id,
            direction: l.direction,
            qty: new Prisma.Decimal(l.qty),
            sortOrder: idx,
          })),
        },
      },
      include: {
        lines: {
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
            location: { select: { id: true, code: true, label: true } },
          },
        },
      },
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (e) {
    console.error("Error creating stock movement:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

