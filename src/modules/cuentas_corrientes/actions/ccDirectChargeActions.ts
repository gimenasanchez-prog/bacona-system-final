"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { CcDirectChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  cuentaCorrienteAccountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1, "La descripción es obligatoria"),
  motive: z.string().min(1, "El motivo es obligatorio"),
  category: z.nativeEnum(CcDirectChargeCategory),
  amountCents: z.coerce.number().min(0.01, "El monto debe ser mayor a cero"),
  comandaNumber: z.string().optional(),
});

export type CcDirectChargeState = { error: string | null; createdId: string | null };

export async function createCcDirectChargeAction(
  _prev: CcDirectChargeState,
  formData: FormData
): Promise<CcDirectChargeState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const employeeId = jar.get("bcn_employeeId")?.value;

  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return { error: "Sin permisos para registrar cargos directos.", createdId: null };
  }
  if (!employeeId) {
    return { error: "Sesión no encontrada.", createdId: null };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, createdId: null };
  }

  const { cuentaCorrienteAccountId, date, description, motive, category, amountCents, comandaNumber } = parsed.data;

  const charge = await prisma.ccDirectCharge.create({
    data: {
      cuentaCorrienteAccountId,
      date: new Date(date + "T12:00:00.000Z"),
      description,
      motive,
      category,
      amountCents: Math.round(amountCents * 100),
      comandaNumber: comandaNumber?.trim() || null,
      createdByEmployeeId: employeeId,
    },
  });

  return { error: null, createdId: charge.id };
}
