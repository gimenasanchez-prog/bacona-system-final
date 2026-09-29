export type EnvelopeStatus = "CLOSED" | "OPENED" | "CONTROLLED" | "NOT_CONTROLLED";

// NOT_CONTROLLED no significa "sin controlar": es un sobre contado cuyo monto no coincide.
export const ENVELOPE_STATUS_LABEL: Record<EnvelopeStatus, string> = {
  CLOSED: "Sin abrir",
  OPENED: "Abierto, sin contar",
  CONTROLLED: "Controlado ✓",
  NOT_CONTROLLED: "Controlado con diferencia",
};

export const ENVELOPE_STATUS_BADGE_CLASS: Record<EnvelopeStatus, string> = {
  CLOSED: "bg-neutral-100 text-neutral-700",
  OPENED: "bg-yellow-50 text-yellow-700",
  CONTROLLED: "bg-green-50 text-green-700",
  NOT_CONTROLLED: "bg-red-50 text-red-700",
};

/** Contado − esperado. Negativo = faltante, positivo = sobrante, null = todavía no se contó. */
export function envelopeDifferenceCents(envelope: {
  expectedAmountCents: number;
  actualAmountCents: number | null;
}): number | null {
  if (envelope.actualAmountCents == null) return null;
  return envelope.actualAmountCents - envelope.expectedAmountCents;
}
