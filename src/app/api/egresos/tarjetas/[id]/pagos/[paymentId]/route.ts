import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CreditCardService } from "@/modules/egresos_proveedores/services/creditCardService";

const PatchSchema = z
  .object({
    period: z.string().datetime().optional(),
    amountCents: z.number().int().positive().optional(),
    cashBoxId: z.string().cuid().optional(),
    notes: z.string().nullable().optional(),
    skipCashImpact: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Se requiere al menos un campo para actualizar" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const { paymentId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const d = parsed.data;
    const payment = await CreditCardService.updateStatementPayment(
      paymentId,
      {
        period: d.period ? new Date(d.period) : undefined,
        amountCents: d.amountCents,
        cashBoxId: d.cashBoxId,
        notes: d.notes,
        skipCashImpact: d.skipCashImpact,
      },
      employeeId
    );
    return NextResponse.json({ payment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al actualizar el pago.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { paymentId } = await params;
  try {
    await CreditCardService.deleteStatementPayment(paymentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar el pago.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
