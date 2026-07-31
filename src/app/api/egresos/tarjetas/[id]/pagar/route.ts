import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CreditCardService } from "@/modules/egresos_proveedores/services/creditCardService";

const BodySchema = z.object({
  period: z.string().datetime(),
  amountCents: z.number().int().positive(),
  cashBoxId: z.string().cuid(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { id } = await params;
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const payment = await CreditCardService.payStatement({
      creditCardId: id,
      period: new Date(d.period),
      amountCents: d.amountCents,
      cashBoxId: d.cashBoxId,
      employeeId,
      notes: d.notes ?? null,
    });
    return NextResponse.json(payment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al pagar resumen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
