"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EnvelopeService, type EnvelopeCountResult } from "@/modules/sobres/services/envelopeService";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";

const SubmitCountSchema = z.object({
  cashSessionId: z.string().min(1),
  countedPesos: z.string().trim().min(1).transform(Number).pipe(z.number().min(0)),
  note: z.string().optional(),
});

export type EnvelopeCountState = { error: string | null; result: EnvelopeCountResult | null };

export async function submitEnvelopeCountAction(
  _prev: EnvelopeCountState,
  formData: FormData
): Promise<EnvelopeCountState> {
  const parsed = SubmitCountSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
    countedPesos: String(formData.get("countedPesos") ?? "").replace(",", "."),
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Cargá el monto contado.", result: null };

  const cookieSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (cookieSessionId !== parsed.data.cashSessionId) {
    return { error: "Solo quien tiene el turno abierto puede sellar su sobre.", result: null };
  }

  try {
    const result = await EnvelopeService.submitCount({
      cashSessionId: parsed.data.cashSessionId,
      countedCents: Math.round(parsed.data.countedPesos * 100),
      note: parsed.data.note ?? null,
    });
    return { error: null, result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error", result: null };
  }
}

async function currentEmployeeId() {
  const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
  if (!employeeId) throw new Error("No hay sesión activa.");
  return employeeId;
}

function back(returnTo: string, errorMsg: string | null, okMsg?: string): never {
  if (errorMsg) redirect(`${returnTo}?error=${encodeURIComponent(errorMsg)}`);
  redirect(okMsg ? `${returnTo}?ok=${encodeURIComponent(okMsg)}` : returnTo);
}

export async function receiveEnvelopesAction(formData: FormData) {
  let errorMsg: string | null = null;
  let okMsg: string | undefined;
  try {
    const ids = formData.getAll("envelopeId").map(String).filter(Boolean);
    const count = await EnvelopeCustodyService.receiveEnvelopes({
      envelopeIds: ids,
      employeeId: await currentEmployeeId(),
    });
    okMsg = count === 1 ? "Sobre recibido." : `${count} sobres recibidos.`;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al recibir los sobres.";
  }
  back("/caja/local", errorMsg, okMsg);
}

export async function handoverCustodyAction(formData: FormData) {
  let errorMsg: string | null = null;
  let okMsg: string | undefined;
  try {
    const toEmployeeId = String(formData.get("toEmployeeId") ?? "");
    if (!toEmployeeId) throw new Error("Elegí a quién le pasás los sobres.");
    const employeeId = await currentEmployeeId();
    const role = (await cookies()).get("bcn_role")?.value;
    // Puede pasar la custodia gerencia (a distancia) o la encargada actual antes de irse.
    if (role !== "GERENCIA" && !(await EnvelopeCustodyService.isActiveCustodian(employeeId))) {
      throw new Error("Solo gerencia o la encargada de sobres actual pueden pasar la custodia.");
    }
    await EnvelopeCustodyService.handover({ toEmployeeId, createdByEmployeeId: employeeId });
    okMsg = "Encargada de sobres actualizada.";
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al pasar la custodia.";
  }
  back("/caja/local", errorMsg, okMsg);
}

export async function confirmHandoverAction(formData: FormData) {
  let errorMsg: string | null = null;
  let okMsg: string | undefined;
  try {
    const handoverId = String(formData.get("handoverId") ?? "");
    const acceptedEnvelopeIds = formData.getAll("envelopeId").map(String).filter(Boolean);
    await EnvelopeCustodyService.confirmHandover({
      handoverId,
      acceptedEnvelopeIds,
      employeeId: await currentEmployeeId(),
    });
    okMsg = "Traspaso confirmado.";
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al confirmar el traspaso.";
  }
  back("/caja/local", errorMsg, okMsg);
}
