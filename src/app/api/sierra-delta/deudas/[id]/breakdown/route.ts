import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SierraDeltaDebtService } from "@/modules/sierra_delta/services/sierraDeltaDebtService";

const BodySchema = z.object({
  periodLabel: z.string().min(1),
  paymentMonthLabel: z.string().min(1),
  amountPerPartnerCents: z.number().int().positive(),
  partnersCount: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const line = await SierraDeltaDebtService.addBreakdownLine({ debtId: id, ...parsed.data });
    return NextResponse.json(line);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al agregar el detalle." }, { status: 400 });
  }
}
