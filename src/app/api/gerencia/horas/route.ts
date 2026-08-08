import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { HoursService } from "@/modules/horas/services/hoursService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const month = req.nextUrl.searchParams.get("month");
  const period = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00.000Z`) : new Date();

  const summary = await HoursService.monthlySummaryForAllEmployees(period);

  return NextResponse.json({
    summary: summary.map((row) => ({
      employee: row.employee,
      totalHours: row.totalHours.toFixed(2),
      amountCents: row.amountCents,
      isPaid: row.isPaid,
      paidAt: row.paidAt,
      paidAmountCents: row.paidAmountCents,
    })),
  });
}
