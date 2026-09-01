import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    products: products.map((p) => ({ id: p.id, name: p.name, categoryName: p.category.name })),
  });
}
