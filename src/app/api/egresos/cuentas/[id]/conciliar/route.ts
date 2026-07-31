import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

const BodySchema = z.object({
  posPaymentIds: z.array(z.string().cuid()).min(1),
  withholdingCents: z.number().int().min(0).default(0),
  feesCents: z.number().int().min(0).default(0),
  date: z.string().datetime(),
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
    await LocalCashBoxService.reconcileSales({
      cashBoxId: id,
      posPaymentIds: d.posPaymentIds,
      withholdingCents: d.withholdingCents,
      feesCents: d.feesCents,
      date: new Date(d.date),
      createdByEmployeeId: employeeId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al conciliar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
