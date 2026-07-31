import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CreditCardService } from "@/modules/egresos_proveedores/services/creditCardService";

export async function GET() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const cards = await CreditCardService.listCards();
    const withPeriods = await Promise.all(
      cards.map(async (card) => ({
        ...card,
        periods: await CreditCardService.getPeriodsSummary(card.id),
      }))
    );
    return NextResponse.json({ items: withPeriods });
  } catch (err) {
    console.error("[/api/egresos/tarjetas GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  payFromCashBoxId: z.string().cuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const card = await CreditCardService.createCard(parsed.data);
    return NextResponse.json(card);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear la tarjeta.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
