import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SupplierPayableService } from "@/modules/egresos_proveedores/services/supplierPayableService";

const BodySchema = z.object({
  supplierId: z.string().cuid(),
  description: z.string().optional(),
  totalAmountCents: z.number().int().positive(),
  dueDate: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const payable = await SupplierPayableService.createPayable({
      supplierId: d.supplierId,
      description: d.description ?? null,
      totalAmountCents: d.totalAmountCents,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
    });
    return NextResponse.json(payable);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cargar deuda.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
