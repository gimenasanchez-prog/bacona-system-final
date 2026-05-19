import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { StockDefaultsService } from "@/modules/stock/services/stockDefaultsService";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: purchaseId } = await params;
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        location: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.lines.length === 0) throw new Error("Purchase has no lines");

    const { bacona } = await StockDefaultsService.ensureDefaultLocations(prisma);
    if (purchase.locationId === bacona.id) {
      return NextResponse.json({ ok: true, message: "Already in BACONA (no transfer needed)" });
    }

    const notes = `Receive purchase ${purchase.id} (${purchase.location.code} -> ${bacona.code})`;

    // NOTE: avoid relying on a schema-specific idempotency field here
    // (dev servers sometimes run with a stale Prisma client until restarted).
    const existing = await prisma.stockMovement.findFirst({
      where: { type: "TRANSFER", notes },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({ ok: true, movementId: existing.id });
    }

    const movement = await prisma.stockMovement.create({
      data: {
        type: "TRANSFER",
        occurredAt: new Date(),
        notes,
        lines: {
          create: purchase.lines.flatMap((l, idx) => [
            {
              inventoryItemId: l.inventoryItemId,
              locationId: purchase.locationId,
              direction: "OUT",
              qty: l.qty,
              sortOrder: idx * 2,
            },
            {
              inventoryItemId: l.inventoryItemId,
              locationId: bacona.id,
              direction: "IN",
              qty: l.qty,
              sortOrder: idx * 2 + 1,
            },
          ]),
        },
      },
    });

    return NextResponse.json({ ok: true, movementId: movement.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

