import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const tickets = await prisma.ticketImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      driveFileName: true,
      status: true,
      errorMessage: true,
      supplierNameRaw: true,
      purchasedAt: true,
      totalCents: true,
      createdAt: true,
      reviewedAt: true,
      supplier: { select: { name: true } },
      reviewedByEmployee: { select: { displayName: true } },
      _count: { select: { lines: true } },
    },
  });
  return NextResponse.json({ tickets });
}
