/**
 * businessDate se guarda como medianoche UTC del día de negocio. Formatear con
 * getters locales del navegador (toLocaleDateString) lo corre un día para atrás
 * en Argentina (UTC-3). Estas funciones siempre leen/calculan en UTC.
 */
export function formatBusinessDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
