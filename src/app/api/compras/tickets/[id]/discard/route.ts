import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TicketImportService } from "@/modules/compras/services/ticketImportService";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  try {
    await TicketImportService.discard(id, employeeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
