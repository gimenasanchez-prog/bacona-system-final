import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { categoryId, isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, priceCents: true },
  });

  return NextResponse.json({ products });
}

