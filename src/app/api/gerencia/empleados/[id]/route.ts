import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(["ASOCIADO", "CAJA_LOCAL", "GERENCIA", "ADMINISTRATIVO", "COMERCIAL"]).optional(),
    pin: z.string().regex(/^\d{4}$/, "El PIN debe tener exactamente 4 dígitos").optional(),
    hourlyRateCents: z.number().int().nonnegative().optional(),
    paymentType: z.enum(["HOURLY", "FIXED_MONTHLY"]).optional(),
    monthlySalaryCents: z.number().int().nonnegative().optional(),
  })
  .refine(
    (d) =>
      d.isActive !== undefined ||
      d.role !== undefined ||
      d.pin !== undefined ||
      d.hourlyRateCents !== undefined ||
      d.paymentType !== undefined ||
      d.monthlySalaryCents !== undefined,
    { message: "Se requiere al menos un campo para actualizar" }
  );

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

  const { pin, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (pin !== undefined) {
    data.pinHash = await bcrypt.hash(pin, 10);
  }

  try {
    const employee = await prisma.employee.update({
      where: { id },
      data,
      select: {
        id: true,
        displayName: true,
        role: true,
        isActive: true,
        pinHash: true,
        hourlyRateCents: true,
        paymentType: true,
        monthlySalaryCents: true,
      },
    });
    return NextResponse.json({
      employee: { ...employee, hasPin: employee.pinHash !== null, pinHash: undefined },
    });
  } catch {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
}
