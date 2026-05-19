import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      priceCents: true,
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        select: {
          group: {
            select: {
              id: true,
              name: true,
              minSelect: true,
              maxSelect: true,
              options: {
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, priceDeltaCents: true },
              },
            },
          },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      modifierGroups: product.modifierGroups.map((mg) => mg.group),
    },
  });
}

