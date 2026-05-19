import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where = cashSessionId
    ? {
        saleType: "RESERVA" as const,
        status: { in: ["DRAFT" as const, "CONFIRMED" as const] },
        reservationAt: { gte: now, lte: in7Days },
      }
    : {
        saleType: "RESERVA" as const,
        status: { in: ["DRAFT" as const, "CONFIRMED" as const] },
        reservationAt: { gte: now, lte: in7Days },
      };

  const sales = await prisma.posSale.findMany({
    where,
    include: {
      cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } },
      items: { select: { id: true } },
    },
    orderBy: { reservationAt: "asc" },
    take: 20,
  });

  return NextResponse.json({
    reservations: sales.map((s) => ({
      id: s.id,
      reservationAt: s.reservationAt,
      status: s.status,
      customerName:
        s.customerNameFreeText ??
        s.cuentaCorrienteAccount?.customer?.displayName ??
        "Sin nombre",
      totalCents: s.totalCents,
      itemCount: s.items.length,
      coverCount: (s.externalRefs as any)?.coverCount ?? null,
    })),
  });
}
