import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { PreciosService } from "@/modules/precios/services/preciosService";

const patchSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio").max(150).optional(),
    priceCents: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.priceCents !== undefined || d.isActive !== undefined, {
    message: "Se requiere al menos un campo para actualizar",
  });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const product = await PreciosService.updateProduct({
      productId: id,
      employeeId,
      ...parsed.data,
    });
    return NextResponse.json({ product });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Producto no encontrado";
    const status = message === "Producto no encontrado" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
