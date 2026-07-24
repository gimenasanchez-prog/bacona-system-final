import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  displayName: z.string().min(1, "El nombre es obligatorio").max(100),
  role: z.enum(["ASOCIADO", "CAJA_LOCAL", "GERENCIA", "ADMINISTRATIVO"]),
});

export async function GET() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const raw = await prisma.employee.findMany({
    select: { id: true, displayName: true, role: true, isActive: true, pinHash: true },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });

  const employees = raw.map(({ pinHash, ...e }) => ({ ...e, hasPin: pinHash !== null }));
  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const created = await prisma.employee.create({
    data: { displayName: parsed.data.displayName.trim(), role: parsed.data.role },
    select: { id: true, displayName: true, role: true, isActive: true },
  });

  return NextResponse.json({ employee: { ...created, hasPin: false } }, { status: 201 });
}
