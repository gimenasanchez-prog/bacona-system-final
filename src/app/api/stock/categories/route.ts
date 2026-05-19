import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.inventoryCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ categories });
}

const CreateCategorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateCategorySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const category = await prisma.inventoryCategory.create({
    data: {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: true,
    },
  });
  return NextResponse.json({ category });
}

