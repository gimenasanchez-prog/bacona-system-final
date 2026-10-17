import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { PurchasePaymentInput } from "@/modules/compras/services/purchaseService";
import { TicketImportService } from "@/modules/compras/services/ticketImportService";

const STOCK_UNIT = z.enum(["UN", "KG", "G", "L", "ML"]);

const PaymentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("PENDING") }),
  z.object({
    mode: z.literal("PAID_NOW"),
    method: z.enum(["EFECTIVO_CAJA", "TRANSFERENCIA", "TARJETA_CREDITO"]),
    cashBoxId: z.string().nullable().optional(),
    creditCardId: z.string().nullable().optional(),
    installments: z.number().int().min(1).max(24).optional(),
    skipCashImpact: z.boolean().optional(),
  }),
]);

const ConfirmSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().nullable(),
  invoiceTotalCents: z.number().int().positive(),
  purchasedAt: z.string().datetime(),
  type: z.enum(["APROVISIONAMIENTO", "IN_SITU"]),
  locationCode: z.enum(["BACONA", "SALTA", "EN_TRANSITO"]),
  payment: PaymentSchema,
  lines: z.array(
    z.object({
      id: z.string().nullable().optional(),
      rawDescription: z.string(),
      qty: z.number(),
      unit: STOCK_UNIT.nullable(),
      uomId: z.string().nullable(),
      inventoryItemId: z.string().nullable(),
      // Puede ser negativo en descuentos/bonificaciones; el servicio solo lo rechaza si la línea va al stock
      unitPriceCents: z.number().int().nullable(),
      ignored: z.boolean(),
    }),
  ),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path[0] === "lines" && typeof issue.path[1] === "number" ? ` (producto ${issue.path[1] + 1})` : "";
    return NextResponse.json({ error: `Hay un dato inválido${where}. Revisá el ticket y volvé a intentar.` }, { status: 400 });
  }
  const data = parsed.data;

  const payment: PurchasePaymentInput =
    data.payment.mode === "PENDING"
      ? { mode: "PENDING" }
      : {
          mode: "PAID_NOW",
          method: data.payment.method,
          cashBoxId: data.payment.cashBoxId ?? null,
          creditCardId: data.payment.creditCardId ?? null,
          installments: data.payment.installments,
          createdByEmployeeId: employeeId,
          skipCashImpact: data.payment.method !== "TARJETA_CREDITO" ? data.payment.skipCashImpact : undefined,
        };

  try {
    const purchase = await TicketImportService.confirm({
      id,
      employeeId,
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber,
      invoiceTotalCents: data.invoiceTotalCents,
      purchasedAt: new Date(data.purchasedAt),
      type: data.type,
      locationCode: data.locationCode,
      payment,
      lines: data.lines,
    });
    return NextResponse.json({ purchaseId: purchase.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
