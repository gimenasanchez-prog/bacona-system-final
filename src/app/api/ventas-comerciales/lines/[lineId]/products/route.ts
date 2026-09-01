import { NextResponse } from "next/server";
import { z } from "zod";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

const schema = z.object({
  products: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyPerUnit: z.number().positive(),
      })
    )
    .max(50),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const { lineId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const line = await ComercialSaleService.setLineProducts(lineId, parsed.data.products);
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar el desglose de productos." },
      { status: 400 }
    );
  }
}
