import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { HoursService } from "@/modules/horas/services/hoursService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const month = req.nextUrl.searchParams.get("month");
  if (!employeeId || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { entries } = await HoursService.listMonthEntries(employeeId, new Date(`${month}-01T00:00:00.000Z`));

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      workDate: e.workDate,
      checkIn: e.checkIn,
      checkOut: e.checkOut,
      hoursWorked: e.hoursWorked.toFixed(2),
    })),
  });
}
