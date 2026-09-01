import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { PosPaymentMethod } from "@prisma/client";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

const schema = z.object({
  actualQty: z.number().int().min(0),
  actualCobradas: z.number().int().min(0),
  paymentMethod: z.nativeEnum(PosPaymentMethod),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const { lineId } = await params;
  const jar = await cookies();
  const employeeId = jar.get("bcn_employeeId")?.value;
  const cashSessionId = jar.get("bcn_cashSessionId")?.value;

  if (!employeeId || !cashSessionId) {
    return NextResponse.json({ error: "Necesitás un turno de caja abierto para entregar y cobrar." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const line = await ComercialSaleService.deliverLine({
      lineId,
      actualQty: parsed.data.actualQty,
      actualCobradas: parsed.data.actualCobradas,
      paymentMethod: parsed.data.paymentMethod,
      employeeId,
      cashSessionId,
    });
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al entregar y cobrar la venta comercial." },
      { status: 400 }
    );
  }
}
