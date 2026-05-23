import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (!cashSessionId) {
    return NextResponse.json({ sales: [] });
  }

  const sales = await prisma.posSale.findMany({
    where: {
      cashSessionId,
      status: { in: ["PAID", "CANCELLED"] },
    },
    include: {
      items: {
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      payments: {
        include: {
          cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } },
          employee: { select: { displayName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      customer: { select: { displayName: true } },
      cuentaCorrienteAccount: { include: { customer: { select: { displayName: true } } } },
      table: { select: { label: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sales });
}
