import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

const CreateInvoiceSchema = z.object({
  periodFrom: z.string().datetime(),
  periodTo: z.string().datetime(),
  estimatedPaymentDate: z.string().datetime(),
  arcaFacturaNumber: z.string().optional(),
  ivaExento: z.boolean(),
  ivaDiscriminado: z.boolean(),
  ivaAmountCents: z.number().int().min(0),
  notes: z.string().optional(),
  digitalInvoiceUrl: z.string().url().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CreateInvoiceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const invoice = await CuentaCorrienteService.createInvoice(id, {
      periodFrom: new Date(d.periodFrom),
      periodTo: new Date(d.periodTo),
      estimatedPaymentDate: new Date(d.estimatedPaymentDate),
      arcaFacturaNumber: d.arcaFacturaNumber,
      ivaExento: d.ivaExento,
      ivaDiscriminado: d.ivaDiscriminado,
      ivaAmountCents: d.ivaAmountCents,
      notes: d.notes,
      digitalInvoiceUrl: d.digitalInvoiceUrl ?? null,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear factura.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
