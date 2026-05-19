"use server";

import { z } from "zod";
import { cookies } from "next/headers";

import { EnvelopeService } from "@/modules/sobres/services/envelopeService";
import { prisma } from "@/lib/prisma";

const ConfirmEnvelopeSchema = z.object({
  cashSessionId: z.string().min(1),
});

export type ConfirmEnvelopeState = { error: string | null; envelopeCode: string | null };

export async function confirmEnvelopeDepositAction(
  _prev: ConfirmEnvelopeState,
  formData: FormData
): Promise<ConfirmEnvelopeState> {
  const parsed = ConfirmEnvelopeSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.message, envelopeCode: null };

  try {
    const created = await EnvelopeService.confirmEnvelopeDeposit({
      cashSessionId: parsed.data.cashSessionId,
    });
    return { error: null, envelopeCode: created.envelopeCode };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error", envelopeCode: null };
  }
}

const UpdateEnvelopeSchema = z.object({
  envelopeId: z.string().min(1),
  status: z.enum(["CLOSED", "OPENED", "CONTROLLED", "NOT_CONTROLLED"]),
  actualAmountCents: z.coerce.number().int().positive().optional(),
});

export async function updateEnvelopeStatusAction(formData: FormData) {
  const parsed = UpdateEnvelopeSchema.safeParse({
    envelopeId: String(formData.get("envelopeId") ?? ""),
    status: String(formData.get("status") ?? ""),
    actualAmountCents: formData.get("actualAmountCents") ?? undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.message);

  const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;

  const now = new Date();
  const data: any = { status: parsed.data.status };
  if (parsed.data.status === "OPENED") {
    data.openedAt = now;
    data.openedByEmployeeId = employeeId;
  }
  if (parsed.data.status === "CONTROLLED" || parsed.data.status === "NOT_CONTROLLED") {
    data.controlledAt = now;
    data.controlledByEmployeeId = employeeId;
    if (typeof parsed.data.actualAmountCents === "number") data.actualAmountCents = parsed.data.actualAmountCents;
  }

  await prisma.envelope.update({
    where: { id: parsed.data.envelopeId },
    data,
  });
}

