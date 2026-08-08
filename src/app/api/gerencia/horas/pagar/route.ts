import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { HoursService } from "@/modules/horas/services/hoursService";

const PagarSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Período inválido"),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const createdByEmployeeId = jar.get("bcn_employeeId")?.value;
  if (role !== "GERENCIA" || !createdByEmployeeId) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PagarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const payment = await HoursService.markPeriodPaid({
      employeeId: parsed.data.employeeId,
      period: new Date(`${parsed.data.period}-01T00:00:00.000Z`),
      createdByEmployeeId,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
