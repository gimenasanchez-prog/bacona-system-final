import { NextResponse } from "next/server";
import { z } from "zod";

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
  const cashSessionId =
    cookieCashSessionId &&
    (await prisma.cashSession.findFirst({
      where: { id: cookieCashSessionId, status: "OPEN" },
      select: { id: true },
    }))
      ? cookieCashSessionId
      : null;

  const sale = await PosSaleService.createDraft({
    saleType: parsed.data.saleType,
    tableId: parsed.data.tableId ?? null,
    reservationAt: parsed.data.reservationAt ? new Date(parsed.data.reservationAt) : null,
    cashSessionId,
  });

  return NextResponse.json({ sale });
}

