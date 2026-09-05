import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SierraDeltaDebtService } from "@/modules/sierra_delta/services/sierraDeltaDebtService";

export async function GET() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const items = await SierraDeltaDebtService.list();
  return NextResponse.json({ items });
}

const BodySchema = z.object({
  concepto: z.string().min(1),
  currency: z.enum(["ARS", "USD"]),
  totalAmountCents: z.number().int().positive(),
  notas: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const debt = await SierraDeltaDebtService.createDebt({
      concepto: parsed.data.concepto,
      currency: parsed.data.currency,
      totalAmountCents: parsed.data.totalAmountCents,
      notas: parsed.data.notas ?? null,
    });
    return NextResponse.json(debt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear la deuda.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
