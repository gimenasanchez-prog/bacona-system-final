import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

const UpdateInvoiceSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("togglePaid") }),
  z.object({
    action: z.literal("recordPayment"),
    paidAmountCents: z.number().int().min(0),
    paymentDate: z.string().datetime(),
    paymentReference: z.string().optional(),
    bankAccountId: z.string().cuid(),
    bankWithholdingCents: z.number().int().min(0).optional(),
    bankFeesCents: z.number().int().min(0).optional(),
    ivaRetentionCents: z.number().int().min(0).optional(),
    gananciasRetentionCents: z.number().int().min(0).optional(),
    rentasRetentionCents: z.number().int().min(0).optional(),
    sussRetentionCents: z.number().int().min(0).optional(),
    tisshRetentionCents: z.number().int().min(0).optional(),
  }),
  z.object({
    action: z.literal("registerPartialPayment"),
    amountCents: z.number().int().min(1),
    paymentDate: z.string().datetime(),
    paymentReference: z.string().optional(),
    bankAccountId: z.string().cuid(),
    bankWithholdingCents: z.number().int().min(0).optional(),
    bankFeesCents: z.number().int().min(0).optional(),
  }),
  z.object({
    action: z.literal("update"),
    estimatedPaymentDate: z.string().datetime().optional(),
    arcaFacturaNumber: z.string().nullable().optional(),
    ivaExento: z.boolean().optional(),
    ivaDiscriminado: z.boolean().optional(),
    ivaAmountCents: z.number().int().min(0).optional(),
    bankWithholdingCents: z.number().int().min(0).optional(),
    bankFeesCents: z.number().int().min(0).optional(),
    ivaRetentionCents: z.number().int().min(0).optional(),
    gananciasRetentionCents: z.number().int().min(0).optional(),
    rentasRetentionCents: z.number().int().min(0).optional(),
    digitalInvoiceUrl: z.string().url().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params;
    const detail = await CuentaCorrienteService.getInvoiceDetail(invoiceId);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener detalle.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params;
    const body = await req.json();
    const parsed = UpdateInvoiceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "togglePaid") {
      const updated = await CuentaCorrienteService.toggleInvoicePaid(invoiceId);
      return NextResponse.json(updated);
    }

    if (parsed.data.action === "recordPayment") {
      const jar = await cookies();
      const employeeId = jar.get("bcn_employeeId")?.value;
      if (!employeeId) {
        return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
      }

      const d = parsed.data;
      const updated = await CuentaCorrienteService.recordPayment(invoiceId, {
        paidAmountCents: d.paidAmountCents,
        paymentDate: new Date(d.paymentDate),
        paymentReference: d.paymentReference,
        bankAccountId: d.bankAccountId,
        bankWithholdingCents: d.bankWithholdingCents,
        bankFeesCents: d.bankFeesCents,
        ivaRetentionCents: d.ivaRetentionCents,
        gananciasRetentionCents: d.gananciasRetentionCents,
        rentasRetentionCents: d.rentasRetentionCents,
        sussRetentionCents: d.sussRetentionCents,
        tisshRetentionCents: d.tisshRetentionCents,
        createdByEmployeeId: employeeId,
      });
      return NextResponse.json(updated);
    }

    if (parsed.data.action === "registerPartialPayment") {
      const jar = await cookies();
      const employeeId = jar.get("bcn_employeeId")?.value;
      if (!employeeId) {
        return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
      }

      const d = parsed.data;
      const updated = await CuentaCorrienteService.registerPartialPayment(invoiceId, {
        amountCents: d.amountCents,
        paymentDate: new Date(d.paymentDate),
        paymentReference: d.paymentReference,
        bankAccountId: d.bankAccountId,
        bankWithholdingCents: d.bankWithholdingCents,
        bankFeesCents: d.bankFeesCents,
        createdByEmployeeId: employeeId,
      });
      return NextResponse.json(updated);
    }

    const { action: _action, estimatedPaymentDate, ...rest } = parsed.data;
    const updated = await CuentaCorrienteService.updateInvoice(invoiceId, {
      ...rest,
      ...(estimatedPaymentDate ? { estimatedPaymentDate: new Date(estimatedPaymentDate) } : {}),
    });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al actualizar factura.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params;
    await CuentaCorrienteService.voidInvoice(invoiceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al anular factura.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
