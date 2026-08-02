import { cookies } from "next/headers";
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
      payable: {
        include: {
          payments: {
            include: {
              cashBox: { select: { id: true, name: true } },
              creditCard: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  return NextResponse.json({ purchases });
}

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);

const PaymentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("PENDING"), dueDate: z.string().datetime().nullable().optional() }),
  z.object({
    mode: z.literal("PAID_NOW"),
    method: z.enum(["EFECTIVO_CAJA", "TRANSFERENCIA", "TARJETA_CREDITO"]),
    cashBoxId: z.string().cuid().nullable().optional(),
    creditCardId: z.string().cuid().nullable().optional(),
    installments: z.number().int().min(1).max(24).optional(),
  }),
]);

const CreatePurchaseSchema = z.object({
  type: z.enum(["APROVISIONAMIENTO", "IN_SITU"]),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]).optional(),
  supplierId: z.string().cuid(),
  supplierName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  invoiceTotalCents: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  purchasedAt: z.string().datetime().optional(),
  payment: PaymentSchema.nullable().optional(),
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
    .min(0),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreatePurchaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const jar = await cookies();
    const employeeId = jar.get("bcn_employeeId")?.value;

    let payment: import("@/modules/compras/services/purchaseService").PurchasePaymentInput | null = null;
    if (parsed.data.payment?.mode === "PENDING") {
      payment = { mode: "PENDING", dueDate: parsed.data.payment.dueDate ? new Date(parsed.data.payment.dueDate) : null };
    } else if (parsed.data.payment?.mode === "PAID_NOW") {
      if (!employeeId) {
        return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
      }
      payment = {
        mode: "PAID_NOW",
        method: parsed.data.payment.method,
        cashBoxId: parsed.data.payment.cashBoxId ?? null,
        creditCardId: parsed.data.payment.creditCardId ?? null,
        installments: parsed.data.payment.installments,
        createdByEmployeeId: employeeId,
      };
    }

    const purchase = await PurchaseService.createAndPost({
      type: parsed.data.type,
      locationCode: parsed.data.locationCode,
      supplierId: parsed.data.supplierId,
      supplierName: parsed.data.supplierName,
      invoiceNumber: parsed.data.invoiceNumber,
      invoiceTotalCents: parsed.data.invoiceTotalCents,
      notes: parsed.data.notes,
      purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : undefined,
      payment,
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

