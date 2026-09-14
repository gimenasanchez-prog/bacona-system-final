import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod/v4";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

const bodySchema = z.object({
  reason: z.string().trim().min(1, "Se requiere un motivo"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id: saleId } = await params;
  try {
    const body = await req.json();
    const { reason } = bodySchema.parse(body);
    const sale = await PosSaleService.cancelSaleByGerencia(saleId, reason);
    return NextResponse.json({ sale });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
