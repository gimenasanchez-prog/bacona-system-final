"use server";

import { z } from "zod";

import { EnvelopeService } from "@/modules/sobres/services/envelopeService";

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
