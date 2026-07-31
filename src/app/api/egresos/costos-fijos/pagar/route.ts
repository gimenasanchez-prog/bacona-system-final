import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CostosFijosService } from "@/modules/rentabilidad/services/costosFijosService";

const BodySchema = z.object({
  costoFijoId: z.string().cuid(),
  period: z.string().datetime(),
  amountCents: z.number().int().positive(),
  cashBoxId: z.string().cuid(),
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
    const payment = await CostosFijosService.payPeriod({
      costoFijoId: d.costoFijoId,
      period: new Date(d.period),
      amountCents: d.amountCents,
      cashBoxId: d.cashBoxId,
      employeeId,
    });
    return NextResponse.json(payment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al pagar costo fijo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
