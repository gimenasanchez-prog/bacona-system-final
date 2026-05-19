import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim();

  const customers = await prisma.customer.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            displayName: {
              contains: query,
              mode: "insensitive",
            },
          }
        : {}),
    },
    orderBy: { displayName: "asc" },
    take: 50,
    select: { id: true, displayName: true },
  });

  return NextResponse.json({ customers });
}

