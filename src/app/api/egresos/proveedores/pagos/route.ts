import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

const BodySchema = z.object({
  supplierId: z.string().cuid(),
  payableId: z.string().cuid().optional(),
  amountCents: z.number().int().positive(),
  date: z.string().datetime(),
  method: z.enum(["EFECTIVO_CAJA", "TRANSFERENCIA", "TARJETA_CREDITO"]),
  cashBoxId: z.string().cuid().optional(),
  creditCardId: z.string().cuid().optional(),
  installments: z.number().int().min(1).max(24).optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const payment = await SupplierPayableService.registerPayment({
      supplierId: d.supplierId,
      payableId: d.payableId ?? null,
      amountCents: d.amountCents,
      date: new Date(d.date),
      method: d.method,
      cashBoxId: d.cashBoxId ?? null,
      creditCardId: d.creditCardId ?? null,
      installments: d.installments,
      notes: d.notes ?? null,
      createdByEmployeeId: employeeId,
    });
    return NextResponse.json(payment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al registrar pago.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
