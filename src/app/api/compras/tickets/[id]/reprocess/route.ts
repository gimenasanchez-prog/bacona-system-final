import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TicketImportService } from "@/modules/compras/services/ticketImportService";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  if (!jar.get("bcn_employeeId")?.value) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  try {
    await TicketImportService.reprocess(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
