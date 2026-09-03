import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { HoursService } from "@/modules/horas/services/hoursService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const employeeId = req.nextUrl.searchParams.get("employeeId") ?? undefined;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const payments = await HoursService.listPaymentHistory({
    employeeId,
    from: from && /^\d{4}-\d{2}$/.test(from) ? new Date(`${from}-01T00:00:00.000Z`) : undefined,
    to: to && /^\d{4}-\d{2}$/.test(to) ? new Date(`${to}-01T00:00:00.000Z`) : undefined,
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      employeeName: p.employee.displayName,
      period: p.period,
      paymentType: p.paymentType,
      hoursSnapshot: p.hoursSnapshot != null ? p.hoursSnapshot.toFixed(2) : null,
      hourlyRateCentsSnapshot: p.hourlyRateCentsSnapshot,
      monthlySalaryCentsSnapshot: p.monthlySalaryCentsSnapshot,
      amountCents: p.amountCents,
      paidAt: p.paidAt,
    })),
  });
}
