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

/**
 * Convierte un valor de <input type="date"> ("YYYY-MM-DD", sin hora) a un
 * Date estable sin importar el huso horario del servidor: se ancla al
 * mediodía UTC para que nunca "cruce" al día anterior o siguiente al
 * guardarse o reformatearse. Si ya viene con hora/offset (ISO completo), se
 * respeta tal cual.
 */
export function parseDateOnly(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
}

export function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
