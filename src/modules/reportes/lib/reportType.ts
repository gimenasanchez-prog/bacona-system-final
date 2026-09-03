export const REPORT_TYPES = [
  "TODOS",
  "CIERRES",
  "VENTAS_DIA",
  "VENTAS_DETALLE",
  "EGRESOS",
  "EGRESOS_MODULO",
  "CUENTAS_CORRIENTES",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  TODOS: "Todos (Excel completo)",
  CIERRES: "Cierres de caja",
  VENTAS_DIA: "Ventas por día y método de pago",
  VENTAS_DETALLE: "Ventas detalladas",
  EGRESOS: "Egresos (dinero de sobres)",
  EGRESOS_MODULO: "Egresos - Proveedores, Costos Fijos y Tarjetas",
  CUENTAS_CORRIENTES: "Cuentas corrientes",
};

export const REPORT_TYPE_SLUG: Record<ReportType, string> = {
  TODOS: "todos",
  CIERRES: "cierres",
  VENTAS_DIA: "ventas-dia",
  VENTAS_DETALLE: "ventas-detalle",
  EGRESOS: "egresos",
  EGRESOS_MODULO: "egresos-modulo",
  CUENTAS_CORRIENTES: "cuentas-corrientes",
};

export function parseReportType(value: string | string[] | undefined): ReportType {
  return typeof value === "string" && (REPORT_TYPES as readonly string[]).includes(value)
    ? (value as ReportType)
    : "TODOS";
}
