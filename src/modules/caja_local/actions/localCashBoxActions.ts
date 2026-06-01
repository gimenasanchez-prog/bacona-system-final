"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

export async function getLocalCashBalanceAction() {
  const box = await LocalCashBoxService.getActiveLocalCashBox();
  const balanceCents = await LocalCashBoxService.getLocalCashBalance(box.id);
  return { box, balanceCents };
}

const TransferEnvelopeSchema = z.object({
  envelopeId: z.string().min(1),
  amountCents: z.coerce.number().int().positive(),
});

export async function transferEnvelopeToLocalCashAction(formData: FormData) {
  let errorMsg: string | null = null;

  try {
    const parsed = TransferEnvelopeSchema.safeParse({
      envelopeId: String(formData.get("envelopeId") ?? ""),
      amountCents: formData.get("amountCents"),
    });
    if (!parsed.success) throw new Error("Datos inválidos: completá los dos campos.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa. Cerrá y volvé a abrir la caja.");

    const box = await LocalCashBoxService.getActiveLocalCashBox();
    await LocalCashBoxService.transferEnvelopeToLocalCash({
      envelopeId: parsed.data.envelopeId,
      localCashBoxId: box.id,
      amountCents: parsed.data.amountCents,
      openedByEmployeeId: employeeId,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error desconocido al guardar el sobre.";
  }

  if (errorMsg) redirect(`/caja/local?error=${encodeURIComponent(errorMsg)}`);
  redirect("/caja/local");
}

const ManualMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amountCents: z.coerce.number().int().positive(),
  date: z.string().min(1),
  description: z.string().optional(),
});

export async function createLocalCashManualMovementAction(formData: FormData) {
  let errorMsg: string | null = null;

  try {
    const parsed = ManualMovementSchema.safeParse({
      type: String(formData.get("type") ?? ""),
      amountCents: formData.get("amountCents"),
      date: String(formData.get("date") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
    });
    if (!parsed.success) throw new Error("Datos inválidos: completá todos los campos.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa. Cerrá y volvé a abrir la caja.");

    const box = await LocalCashBoxService.getActiveLocalCashBox();
    await LocalCashBoxService.createManualMovement({
      localCashBoxId: box.id,
      type: parsed.data.type,
      amountCents: parsed.data.amountCents,
      date: new Date(`${parsed.data.date}T00:00:00`),
      description: parsed.data.description ?? null,
      createdByEmployeeId: employeeId,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error desconocido al registrar el movimiento.";
  }

  if (errorMsg) redirect(`/caja/local?error=${encodeURIComponent(errorMsg)}`);
  redirect("/caja/local");
}

