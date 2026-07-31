import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const updated = await LocalCashBoxService.updateBankAccount(id, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[/api/egresos/cuentas/[id] PATCH]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
