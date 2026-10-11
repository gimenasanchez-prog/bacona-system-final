import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TicketImportService } from "@/modules/compras/services/ticketImportService";

// Busca tickets nuevos en Drive. Lo llama el cron de Railway (con CRON_SECRET)
// o el botón "Buscar tickets nuevos" (con la sesión del empleado).
export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromCron = Boolean(secret) && bearer === secret;
  if (!fromCron) {
    const jar = await cookies();
    if (!jar.get("bcn_employeeId")?.value) {
      return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    }
  }

  try {
    const result = await TicketImportService.runImport();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[tickets] run", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
