import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CreditCardService } from "@/modules/egresos_proveedores/services/creditCardService";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  closingDay: z.number().int().min(1).max(28).optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  payFromCashBoxId: z.string().cuid().nullable().optional(),
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
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const card = await CreditCardService.updateCard(id, parsed.data);
    return NextResponse.json(card);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al editar la tarjeta.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
