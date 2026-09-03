import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";
import { parseDateOnly } from "@/lib/dates";

const schema = z.object({
  deliveryDate: z.string().min(1).optional(),
  clienteLabel: z.string().trim().min(1).optional(),
  tipoVianda: z.string().trim().min(1).optional(),
  cant: z.number().int().min(1).optional(),
  horarioRetiro: z.string().trim().min(1).optional(),
  unitPriceCents: z.number().int().min(0).optional(),
  formaDePagoPlanificada: z.string().optional(),
  viandasCobradasPlanned: z.number().int().min(0).optional(),
  detalleComanda: z.string().optional(),
});

function checkRole(role: string | undefined) {
  return role === "GERENCIA" || role === "COMERCIAL";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const jar = await cookies();
  if (!checkRole(jar.get("bcn_role")?.value)) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { lineId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { deliveryDate, formaDePagoPlanificada, detalleComanda, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (deliveryDate !== undefined) {
    const d = parseDateOnly(deliveryDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Fecha de entrega inválida." }, { status: 400 });
    }
    patch.deliveryDate = d;
  }
  if (formaDePagoPlanificada !== undefined) patch.formaDePagoPlanificada = formaDePagoPlanificada.trim() || null;
  if (detalleComanda !== undefined) patch.detalleComanda = detalleComanda.trim() || null;

  try {
    const line = await ComercialSaleService.updateLine(lineId, patch);
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al editar la línea." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const jar = await cookies();
  if (!checkRole(jar.get("bcn_role")?.value)) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { lineId } = await params;
  try {
    await ComercialSaleService.removeLine(lineId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar la línea." },
      { status: 400 }
    );
  }
}
