export type ReportDateRange = { from: Date; to: Date };

export function parseDateRange(sp: Record<string, string | string[] | undefined>): {
  from: Date | undefined;
  to: Date | undefined;
} {
  const from = typeof sp.from === "string" && sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = typeof sp.to === "string" && sp.to ? new Date(`${sp.to}T23:59:59`) : undefined;
  return { from, to };
}
