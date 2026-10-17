/**
 * Cómo se reconoce a un proveedor: por CUIT y por razón social (como figuran en sus facturas).
 * Lo usan la lectura de tickets, el alta de proveedores (para no duplicar) y la limpieza de duplicados.
 */

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

/** Razón social o nombre comparable: sin acentos, mayúsculas, espacios ni signos ("S.R.L." = "SRL"). */
export function nameKey(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type SupplierIdentity = { id: string; name: string; razonSocial: string | null; cuit: string | null };

/** Proveedores que parecen el mismo que `target`: mismo CUIT, o misma razón social / nombre. */
export function sameSupplierAs<T extends SupplierIdentity>(
  target: { cuit?: string | null; razonSocial?: string | null; name?: string | null },
  suppliers: T[],
): T[] {
  const cuit = cuitDigits(target.cuit);
  const keys = new Set([nameKey(target.razonSocial), nameKey(target.name)].filter(Boolean));
  return suppliers.filter(
    (s) =>
      (cuit != null && cuitDigits(s.cuit) === cuit) ||
      keys.has(nameKey(s.name)) ||
      (s.razonSocial != null && keys.has(nameKey(s.razonSocial))),
  );
}
