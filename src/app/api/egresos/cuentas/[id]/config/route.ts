import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

const ConfigSchema = z.object({
  configs: z.array(
    z.object({
      method: z.enum(["CREDITO", "DEBITO", "TRANSFERENCIA", "QR"]),
      enabled: z.boolean(),
      settlementBusinessDays: z.number().int().min(0).max(30),
      withholdingPercent: z.number().min(0).max(100).nullable(),
      feesPercent: z.number().min(0).max(100).nullable(),
    })
  ),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = ConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const configs = await LocalCashBoxService.setPaymentMethodConfigs(id, parsed.data.configs);
    return NextResponse.json({ configs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar la configuración.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
