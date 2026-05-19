import { NextResponse } from "next/server";
import { z } from "zod";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

const AddPaymentSchema = z.object({
  method: z.enum([
    "EFECTIVO",
    "CREDITO",
    "DEBITO",
    "TRANSFERENCIA",
    "QR",
    "CUENTA_CORRIENTE",
    "CUENTAS_INTERNAS",
  ]),
  amountCents: z.number().int().positive(),
  cuentaCorrienteAccountId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = AddPaymentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const details = await PosSaleService.addPayment({
      saleId,
      method: parsed.data.method,
      amountCents: parsed.data.amountCents,
      cuentaCorrienteAccountId: parsed.data.cuentaCorrienteAccountId ?? null,
      employeeId: parsed.data.employeeId ?? null,
    });
    return NextResponse.json(details);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

