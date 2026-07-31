import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parseDateRange } from "@/modules/reportes/lib/dateRange";
import { ReportesDataService, ReportRangeTooLargeError } from "@/modules/reportes/services/reportesDataService";
import { ReportesExportService } from "@/modules/reportes/services/reportesExportService";

function allowedRole(role: string | undefined): boolean {
  return role === "GERENCIA" || role === "ADMINISTRATIVO";
}

function toDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request) {
  const jar = await cookies();
  if (!allowedRole(jar.get("bcn_role")?.value)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const { from, to } = parseDateRange(Object.fromEntries(searchParams));

  if (!from || !to) {
    return NextResponse.json({ error: "Elegí un rango de fechas (desde/hasta) para exportar." }, { status: 400 });
  }

  try {
    const data = await ReportesDataService.getReportData({ from, to });
    const workbook = ReportesExportService.buildWorkbook(data);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `reportes_${toDateStamp(from)}_a_${toDateStamp(to)}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ReportRangeTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[/api/reportes/export]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
