import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/proveedores GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1),
  categoria: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const supplier = await prisma.supplier.create({
      data: { name: parsed.data.name, categoria: parsed.data.categoria ?? null },
    });
    return NextResponse.json(supplier);
  } catch (err) {
    console.error("[/api/proveedores POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
