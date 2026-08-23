import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

const PatchSchema = z
  .object({
    payableId: z.string().cuid().nullable().optional(),
    amountCents: z.number().int().positive().optional(),
    date: z.string().datetime().optional(),
    method: z.enum(["EFECTIVO_CAJA", "TRANSFERENCIA", "TARJETA_CREDITO"]).optional(),
    cashBoxId: z.string().cuid().nullable().optional(),
    creditCardId: z.string().cuid().nullable().optional(),
    installments: z.number().int().min(1).max(24).optional(),
    notes: z.string().nullable().optional(),
    skipCashImpact: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Se requiere al menos un campo para actualizar" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const d = parsed.data;
    const payment = await SupplierPayableService.updatePayment(
      id,
      {
        payableId: d.payableId,
        amountCents: d.amountCents,
        date: d.date ? new Date(d.date) : undefined,
        method: d.method,
        cashBoxId: d.cashBoxId,
        creditCardId: d.creditCardId,
        installments: d.installments,
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await SupplierPayableService.deletePayment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar el pago.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
