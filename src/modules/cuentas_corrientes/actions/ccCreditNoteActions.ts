"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";

const schema = z
  .object({
    targetType: z.enum(["invoice", "directCharge"]),
    targetId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1, "La descripción es obligatoria"),
    motive: z.string().min(1, "El motivo es obligatorio"),
    amountCents: z.coerce.number().min(0.01, "El monto debe ser mayor a cero"),
    arcaFacturaNumber: z.string().optional(),
    ivaExento: z.coerce.boolean().default(false),
    ivaDiscriminado: z.coerce.boolean().default(false),
    ivaAmountCents: z.coerce.number().min(0).default(0),
  });

export type CcCreditNoteState = { error: string | null; createdId: string | null };

export async function createCcCreditNoteAction(
  _prev: CcCreditNoteState,
  formData: FormData
): Promise<CcCreditNoteState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const employeeId = jar.get("bcn_employeeId")?.value;

  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return { error: "Sin permisos para registrar notas de crédito.", createdId: null };
  }
  if (!employeeId) {
    return { error: "Sesión no encontrada.", createdId: null };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, createdId: null };
  }

  const {
    targetType, targetId, date, description, motive, amountCents,
    arcaFacturaNumber, ivaExento, ivaDiscriminado, ivaAmountCents,
  } = parsed.data;

  try {
    const creditNote = await CuentaCorrienteService.createCreditNote({
      target:
        targetType === "invoice"
          ? { type: "invoice", invoiceId: targetId }
          : { type: "directCharge", chargeId: targetId },
      date: new Date(date + "T12:00:00.000Z"),
      description,
      motive,
      amountCents: Math.round(amountCents * 100),
      arcaFacturaNumber: arcaFacturaNumber || undefined,
      ivaExento,
      ivaDiscriminado: ivaExento ? false : ivaDiscriminado,
      ivaAmountCents: ivaExento ? 0 : Math.round(ivaAmountCents * 100),
      createdByEmployeeId: employeeId,
    });
    return { error: null, createdId: creditNote.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al registrar la nota de crédito.", createdId: null };
  }
}
