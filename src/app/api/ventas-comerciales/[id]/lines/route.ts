import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";
import { parseDateOnly } from "@/lib/dates";

const schema = z.object({
  deliveryDate: z.string().min(1),
  clienteLabel: z.string().trim().min(1),
  tipoVianda: z.string().trim().min(1),
  cant: z.number().int().min(1),
  horarioRetiro: z.string().trim().min(1),
  unitPriceCents: z.number().int().min(0),
  formaDePagoPlanificada: z.string().optional(),
  viandasCobradasPlanned: z.number().int().min(0),
  detalleComanda: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "COMERCIAL") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const deliveryDate = parseDateOnly(parsed.data.deliveryDate);
  if (Number.isNaN(deliveryDate.getTime())) {
    return NextResponse.json({ error: "Fecha de entrega inválida." }, { status: 400 });
  }

  try {
    const line = await ComercialSaleService.addLine(id, {
      deliveryDate,
      clienteLabel: parsed.data.clienteLabel,
      tipoVianda: parsed.data.tipoVianda,
      cant: parsed.data.cant,
      horarioRetiro: parsed.data.horarioRetiro,
      unitPriceCents: parsed.data.unitPriceCents,
      formaDePagoPlanificada: parsed.data.formaDePagoPlanificada?.trim() || null,
      viandasCobradasPlanned: parsed.data.viandasCobradasPlanned,
      detalleComanda: parsed.data.detalleComanda?.trim() || null,
    });
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al agregar la línea." },
      { status: 400 }
    );
  }
}
