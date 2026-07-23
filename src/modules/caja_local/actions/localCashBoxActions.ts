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

const OpenAndControlSchema = z.object({
  envelopeId: z.string().min(1),
  actualAmountCents: z.coerce.number().int().min(0),
  notes: z.string().optional(),
});

export async function openAndControlEnvelopeAction(formData: FormData) {
  let errorMsg: string | null = null;
  const returnTo = String(formData.get("returnTo") ?? "/caja/local");

  try {
    const parsed = OpenAndControlSchema.safeParse({
      envelopeId: String(formData.get("envelopeId") ?? ""),
      actualAmountCents: formData.get("actualAmountCents"),
      notes: String(formData.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) throw new Error("Datos inválidos: completá todos los campos.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa.");

    const localCashBoxIdOverride = String(formData.get("localCashBoxId") ?? "");
    const box = localCashBoxIdOverride
      ? { id: localCashBoxIdOverride }
      : await LocalCashBoxService.getActiveLocalCashBox();

    await LocalCashBoxService.openAndControlEnvelope({
      envelopeId: parsed.data.envelopeId,
      localCashBoxId: box.id,
      actualAmountCents: parsed.data.actualAmountCents,
      notes: parsed.data.notes ?? null,
      employeeId,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al registrar el sobre.";
  }

  if (errorMsg) redirect(`${returnTo}?error=${encodeURIComponent(errorMsg)}`);
  redirect(returnTo);
}

const ControlOpenedSchema = z.object({
  envelopeId: z.string().min(1),
  actualAmountCents: z.coerce.number().int().min(0),
  notes: z.string().optional(),
});

export async function controlOpenedEnvelopeAction(formData: FormData) {
  let errorMsg: string | null = null;

  try {
    const parsed = ControlOpenedSchema.safeParse({
      envelopeId: String(formData.get("envelopeId") ?? ""),
      actualAmountCents: formData.get("actualAmountCents"),
      notes: String(formData.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) throw new Error("Datos inválidos.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa.");

    await LocalCashBoxService.controlOpenedEnvelope({
      envelopeId: parsed.data.envelopeId,
      actualAmountCents: parsed.data.actualAmountCents,
      notes: parsed.data.notes ?? null,
      employeeId,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al registrar el control.";
  }

  if (errorMsg) redirect(`/caja/local?error=${encodeURIComponent(errorMsg)}`);
  redirect("/caja/local");
}

const BatchItemSchema = z.object({
  envelopeId: z.string().min(1),
  actualAmountCents: z.number().int().min(0),
});

export async function openAndControlEnvelopeBatchAction(formData: FormData) {
  let errorMsg: string | null = null;
  const returnTo = String(formData.get("returnTo") ?? "/caja/local");

  try {
    const raw = String(formData.get("batch") ?? "[]");
    const parsed = z.array(BatchItemSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("Datos inválidos en el lote.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa.");

    const localCashBoxIdOverride = String(formData.get("localCashBoxId") ?? "");
    const box = localCashBoxIdOverride
      ? { id: localCashBoxIdOverride }
      : await LocalCashBoxService.getActiveLocalCashBox();

    await LocalCashBoxService.openAndControlEnvelopeBatch(parsed.data, box.id, employeeId);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al procesar el lote.";
  }

  if (errorMsg) redirect(`${returnTo}?error=${encodeURIComponent(errorMsg)}`);
  redirect(returnTo);
}

const ManualMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amountCents: z.coerce.number().int().positive(),
  date: z.string().min(1),
  description: z.string().optional(),
});

export async function createLocalCashManualMovementAction(formData: FormData) {
  let errorMsg: string | null = null;
  const returnTo = String(formData.get("returnTo") ?? "/caja/local");

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

    const localCashBoxIdOverride = String(formData.get("localCashBoxId") ?? "");
    const box = localCashBoxIdOverride
      ? { id: localCashBoxIdOverride }
      : await LocalCashBoxService.getActiveLocalCashBox();

    const timeOfDay = new Date().toTimeString().slice(0, 8);
    await LocalCashBoxService.createManualMovement({
      localCashBoxId: box.id,
      type: parsed.data.type,
      amountCents: parsed.data.amountCents,
      date: new Date(`${parsed.data.date}T${timeOfDay}`),
      description: parsed.data.description ?? null,
      createdByEmployeeId: employeeId,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error desconocido al registrar el movimiento.";
  }

  if (errorMsg) redirect(`${returnTo}?error=${encodeURIComponent(errorMsg)}`);
  redirect(returnTo);
}

export async function transferToCajaGerenciaAction() {
  let errorMsg: string | null = null;

  try {
    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa.");

    const cajaBCN = await LocalCashBoxService.getActiveLocalCashBox();
    const cajaGerencia = await LocalCashBoxService.getCajaByName("Caja Gerencia");
    const balance = await LocalCashBoxService.getLocalCashBalance(cajaBCN.id);

    if (balance <= 0) throw new Error("El saldo de Caja BCN es cero, no hay nada que transferir.");

    await LocalCashBoxService.transferBalance({
      fromBoxId: cajaBCN.id,
      toBoxId: cajaGerencia.id,
      amountCents: balance,
      employeeId,
      fromDescription: "Entrega a Caja Gerencia",
      toDescription: `Recepción de ${cajaBCN.name}`,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al transferir el saldo.";
  }

  if (errorMsg) redirect(`/caja/local?error=${encodeURIComponent(errorMsg)}`);
  redirect("/caja/local");
}

