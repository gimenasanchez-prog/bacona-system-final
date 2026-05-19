import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const tables = await prisma.posTable.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
  return NextResponse.json({ tables });
}

