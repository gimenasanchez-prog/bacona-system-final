import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (!cashSessionId) return NextResponse.json({ sales: [] });

  const sales = await prisma.posSale.findMany({
    where: {
      cashSessionId,
      saleType: "MESA",
      status: { in: ["DRAFT", "CONFIRMED"] },
    },
    include: {
      table: { select: { id: true, label: true } },
      items: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      tableId: s.tableId,
      tableLabel: s.table?.label ?? null,
      status: s.status,
      totalCents: s.totalCents,
      itemCount: s.items.length,
    })),
  });
}
