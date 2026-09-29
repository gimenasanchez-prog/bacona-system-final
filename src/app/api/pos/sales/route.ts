import { NextResponse } from "next/server";
import { z } from "zod";

import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

const CreateSaleSchema = z.object({
  saleType: z.enum(["MOSTRADOR", "MESA", "RESERVA"]),
  tableId: z.string().nullable().optional(),
  reservationAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateSaleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const cookieCashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  const openSession = cookieCashSessionId
    ? await prisma.cashSession.findFirst({
        where: { id: cookieCashSessionId, status: "OPEN" },
        select: { id: true, openedAt: true },
      })
    : null;
  // Un turno abierto hace más de un día no puede recibir ventas nuevas: quedarían en la
  // fecha vieja y ese turno nunca se cierra (ej. ventas de semanas cargadas al 17/08).
  if (openSession && CashSessionService.isStale(openSession.openedAt)) {
    return NextResponse.json(
      { error: "Tu turno es de otro día y sigue abierto. Cerralo desde \"Tu turno\" y abrí el turno de hoy." },
      { status: 409 }
    );
  }
  const cashSessionId = openSession?.id ?? null;

  const sale = await PosSaleService.createDraft({
    saleType: parsed.data.saleType,
    tableId: parsed.data.tableId ?? null,
    reservationAt: parsed.data.reservationAt ? new Date(parsed.data.reservationAt) : null,
    cashSessionId,
  });

  return NextResponse.json({ sale });
}

