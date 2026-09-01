"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";

const lineSchema = z.object({
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

const batchSchema = z.object({
  cuentaCorrienteAccountId: z.string().optional(),
  notes: z.string().optional(),
  linesJson: z.string().min(1),
});

export type ComercialBatchState = { error: string | null; batchId: string | null };

function checkRole(role: string | undefined): string | null {
  if (role !== "GERENCIA" && role !== "COMERCIAL") {
    return "Sin permisos para gestionar ventas comerciales.";
  }
  return null;
}

function parseLines(linesJson: string) {
  const raw = z.array(lineSchema).min(1, "Agregá al menos una línea de entrega").parse(JSON.parse(linesJson));
  return raw.map((l) => {
    const deliveryDate = new Date(l.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) throw new Error("Fecha de entrega inválida");
    return {
      deliveryDate,
      clienteLabel: l.clienteLabel,
      tipoVianda: l.tipoVianda,
      cant: l.cant,
      horarioRetiro: l.horarioRetiro,
      unitPriceCents: l.unitPriceCents,
      formaDePagoPlanificada: l.formaDePagoPlanificada?.trim() || null,
      viandasCobradasPlanned: l.viandasCobradasPlanned,
      detalleComanda: l.detalleComanda?.trim() || null,
    };
  });
}

export async function saveComercialBatchAction(
  _prev: ComercialBatchState,
  formData: FormData
): Promise<ComercialBatchState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const employeeId = jar.get("bcn_employeeId")?.value;

  const roleError = checkRole(role);
  if (roleError) return { error: roleError, batchId: null };
  if (!employeeId) return { error: "Sesión no encontrada.", batchId: null };

  const parsed = batchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, batchId: null };

  let lines;
  try {
    lines = parseLines(parsed.data.linesJson);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "El detalle de líneas es inválido.", batchId: null };
  }

  try {
    const batch = await ComercialSaleService.createBatch({
      cuentaCorrienteAccountId: parsed.data.cuentaCorrienteAccountId || null,
      notes: parsed.data.notes?.trim() || null,
      createdByEmployeeId: employeeId,
      lines,
    });
    return { error: null, batchId: batch.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar el cierre comercial.", batchId: null };
  }
}

const cancelLineSchema = z.object({ lineId: z.string().min(1), reason: z.string().trim().min(1, "Ingresá un motivo") });

export async function cancelComercialLineAction(
  _prev: ComercialBatchState,
  formData: FormData
): Promise<ComercialBatchState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;

  const roleError = checkRole(role);
  if (roleError) return { error: roleError, batchId: null };

  const parsed = cancelLineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, batchId: null };

  try {
    const line = await ComercialSaleService.cancelLine(parsed.data.lineId, parsed.data.reason);
    return { error: null, batchId: line?.comercialSaleId ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cancelar la línea.", batchId: null };
  }
}
