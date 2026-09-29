"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { formatArsFromCents } from "@/lib/money";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

export async function getLocalCashBalanceAction() {
  const box = await LocalCashBoxService.getActiveLocalCashBox();
  const balanceCents = await LocalCashBoxService.getLocalCashBalance(box.id);
  return { box, balanceCents };
}

const OpenEnvelopeItemSchema = z.object({
  envelopeId: z.string().min(1),
  actualAmountCents: z.number().int().min(0),
  notes: z.string().optional(),
});

/** Abre uno o varios sobres en Caja BCÑ. Recibe `batch` como JSON: [{ envelopeId, actualAmountCents, notes? }]. */
export async function openEnvelopesAction(formData: FormData) {
  let errorMsg: string | null = null;
  let okMsg = "";

  try {
    const parsed = z.array(OpenEnvelopeItemSchema).safeParse(JSON.parse(String(formData.get("batch") ?? "[]")));
    if (!parsed.success || !parsed.data.length) throw new Error("Cargá el monto contado de cada sobre.");

    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) throw new Error("No hay sesión activa.");

    const results = await LocalCashBoxService.openAndControlEnvelopes({
      items: parsed.data.map((i) => ({ ...i, notes: i.notes?.trim() || null })),
      employeeId,
    });
    const withDiff = results.filter((r) => r.differenceCents !== 0);
    okMsg =
      `${results.length === 1 ? "Sobre abierto" : `${results.length} sobres abiertos`}. ` +
      (withDiff.length
        ? "Con diferencia: " +
          withDiff
            .map((r) =>
              `${r.envelopeCode} ${r.differenceCents < 0 ? "faltan" : "sobran"} ${formatArsFromCents(Math.abs(r.differenceCents))}`
            )
            .join(" · ")
        : "Todos coinciden con lo que declaró el cajero ✓");
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al abrir los sobres.";
  }

  if (errorMsg) redirect(`/caja/local?error=${encodeURIComponent(errorMsg)}`);
  redirect(`/caja/local?ok=${encodeURIComponent(okMsg)}`);
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

const ManualMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amountCents: z.coerce.number().int().positive(),
  date: z.string().min(1),
  description: z.string().optional(),
  isRetiroGerencia: z.string().optional(),
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
      isRetiroGerencia: String(formData.get("isRetiroGerencia") ?? "") || undefined,
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
      sourceType: parsed.data.isRetiroGerencia && parsed.data.type === "OUT" ? "RETIRO_GERENCIA" : "MANUAL_ADJUSTMENT",
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

