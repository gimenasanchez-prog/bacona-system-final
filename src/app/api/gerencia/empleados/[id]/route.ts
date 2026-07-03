import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(["ASOCIADO", "CAJA_LOCAL", "GERENCIA", "ADMINISTRATIVO"]).optional(),
  })
  .refine((d) => d.isActive !== undefined || d.role !== undefined, {
    message: "Se requiere al menos un campo para actualizar",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: parsed.data,
      select: { id: true, displayName: true, role: true, isActive: true },
    });
    return NextResponse.json({ employee });
  } catch {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
}
