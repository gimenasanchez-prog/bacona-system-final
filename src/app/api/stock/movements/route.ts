import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const now = new Date();
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = parsed.data.to ? new Date(parsed.data.to) : now;

  const movements = await prisma.stockMovement.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    include: {
      lines: {
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true } },
          location: { select: { id: true, code: true, label: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), movements });
}

