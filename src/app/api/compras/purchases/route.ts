import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PurchaseService } from "@/modules/compras/services/purchaseService";

export async function GET() {
  const purchases = await prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    take: 50,
    include: {
      location: { select: { id: true, code: true, label: true } },
      lines: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  return NextResponse.json({ purchases });
}

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);

const CreatePurchaseSchema = z.object({
  type: z.enum(["APROVISIONAMIENTO", "IN_SITU"]),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]).optional(),
  supplierName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  purchasedAt: z.string().datetime().optional(),
  lines: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        qty: z.union([z.number().positive(), z.string().min(1)]),
        unit: STOCK_UNIT.nullable().optional(),
        uomId: z.string().nullable().optional(),
        unitCostCents: z.number().int().nonnegative().nullable().optional(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreatePurchaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const purchase = await PurchaseService.createAndPost({
      type: parsed.data.type,
      locationCode: parsed.data.locationCode,
      supplierName: parsed.data.supplierName,
      invoiceNumber: parsed.data.invoiceNumber,
      notes: parsed.data.notes,
      purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : undefined,
      lines: parsed.data.lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        qty: l.qty,
        unit: l.unit ?? null,
        uomId: l.uomId ?? null,
        unitCostCents: l.unitCostCents,
      })),
    });
    return NextResponse.json({ purchase });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

