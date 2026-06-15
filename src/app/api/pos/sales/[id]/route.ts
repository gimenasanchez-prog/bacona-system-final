import { NextResponse } from "next/server";
import { z } from "zod";

import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const details = await PosSaleService.getSaleDetails(id);
    return NextResponse.json(details);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 404 }
    );
  }
}

const PatchSaleSchema = z.object({
  saleType: z.enum(["MOSTRADOR", "MESA", "RESERVA"]).optional(),
  customerId: z.string().nullable().optional(),
  cuentaCorrienteAccountId: z.string().nullable().optional(),
  customerNameFreeText: z.string().nullable().optional(),
  tableId: z.string().nullable().optional(),
  reservationAt: z.string().datetime().nullable().optional(),
  externalRefs: z.record(z.string(), z.any()).nullable().optional(),
  comandaNumber: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchSaleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    const reservationAt =
      parsed.data.reservationAt === undefined
        ? undefined
        : parsed.data.reservationAt === null
          ? null
          : new Date(parsed.data.reservationAt);

    const updated = await PosSaleService.updateSale(id, {
      ...parsed.data,
      reservationAt,
    });
    return NextResponse.json({ sale: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

