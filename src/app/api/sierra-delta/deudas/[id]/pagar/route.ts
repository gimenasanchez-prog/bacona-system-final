import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SierraDeltaDebtService } from "@/modules/sierra_delta/services/sierraDeltaDebtService";

const BodySchema = z.object({
  date: z.string().datetime(),
  amountCents: z.number().int().positive(),
  exchangeRate: z.number().positive().optional(),
  cashBoxId: z.string().cuid(),
  notes: z.string().optional(),
  skipCashImpact: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
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
    const payment = await SierraDeltaDebtService.registerPayment({
      debtId: id,
      date: new Date(d.date),
      amountCents: d.amountCents,
      exchangeRate: d.exchangeRate ?? null,
      cashBoxId: d.cashBoxId,
      createdByEmployeeId: employeeId,
      notes: d.notes ?? null,
      skipCashImpact: d.skipCashImpact,
    });
    return NextResponse.json(payment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al registrar el pago.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
