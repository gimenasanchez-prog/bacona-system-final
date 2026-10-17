/** Los 11 dígitos de un CUIT (sin guiones ni espacios), o null si no tiene 11 dígitos. */
export function cuitDigits(cuit: string | null | undefined): string | null {
  const d = (cuit ?? "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

/** CUIT con guiones (30-71123086-2), o null si no tiene 11 dígitos. */
export function formatCuit(cuit: string | null | undefined): string | null {
  const d = cuitDigits(cuit);
  return d ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null;
}

/** Para lo que se escribe a mano: con guiones si tiene 11 dígitos; si no, como se escribió (null si está vacío). */
export function normalizeCuitInput(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  return formatCuit(t) ?? t;
}
