export type EnvelopeStatus = "CLOSED" | "RECEIVED" | "OPENED" | "CONTROLLED" | "NOT_CONTROLLED";

// NOT_CONTROLLED no significa "sin controlar": es un sobre contado cuyo monto no coincide.
export const ENVELOPE_STATUS_LABEL: Record<EnvelopeStatus, string> = {
  CLOSED: "Sellado, lo tiene el cajero",
  RECEIVED: "Recibido, sin abrir",
  OPENED: "Abierto, sin contar",
  CONTROLLED: "Controlado ✓",
  NOT_CONTROLLED: "Controlado con diferencia",
};

export const ENVELOPE_STATUS_BADGE_CLASS: Record<EnvelopeStatus, string> = {
  CLOSED: "bg-neutral-100 text-neutral-700",
  RECEIVED: "bg-sky-50 text-sky-700",
  OPENED: "bg-yellow-50 text-yellow-700",
  CONTROLLED: "bg-green-50 text-green-700",
  NOT_CONTROLLED: "bg-red-50 text-red-700",
};

/** Días sin entregar a partir de los cuales un sobre sellado se marca en rojo. */
export const ENVELOPE_OVERDUE_DAYS = 3;

type EnvelopeAmounts = {
  expectedAmountCents: number;
  declaredAmountCents?: number | null;
  actualAmountCents: number | null;
};

/**
 * Diferencia de cajero: lo que declaró meter en el sobre − lo que dice el sistema.
 * Negativo = faltante, positivo = sobrante, null = sobre viejo sin conteo al cierre.
 */
export function envelopeCashierDifferenceCents(envelope: EnvelopeAmounts): number | null {
  if (envelope.declaredAmountCents == null) return null;
  return envelope.declaredAmountCents - envelope.expectedAmountCents;
}

/**
 * Diferencia de custodia: lo contado al abrir − lo que declaró el cajero al sellar.
 * Para sobres viejos sin monto declarado se compara contra el esperado del sistema.
 * null = todavía no se abrió.
 */
export function envelopeCustodyDifferenceCents(envelope: EnvelopeAmounts): number | null {
  if (envelope.actualAmountCents == null) return null;
  return envelope.actualAmountCents - (envelope.declaredAmountCents ?? envelope.expectedAmountCents);
}

/** Contado al abrir − esperado del sistema (diferencia total). null = todavía no se contó. */
export function envelopeDifferenceCents(envelope: EnvelopeAmounts): number | null {
  if (envelope.actualAmountCents == null) return null;
  return envelope.actualAmountCents - envelope.expectedAmountCents;
}
