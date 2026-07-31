import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  categoria: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const supplier = await prisma.supplier.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(supplier);
  } catch (err) {
    console.error("[/api/proveedores/[id] PATCH]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
