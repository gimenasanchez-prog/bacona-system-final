/**
 * Catálogo de tarifas corporativas ("planCode" en CuentaCorrienteAccount).
 *
 * Single source of truth compartida entre el POS (filtro de menú por tarifa,
 * src/app/pos/page.tsx) y el alta de cuentas corrientes (dropdown de tarifas +
 * sugerencia de tope de cobertura). Antes esto vivía duplicado/hardcodeado
 * dentro de un useMemo en pos/page.tsx.
 */

export type CorpoFilter = "all" | "corpo1" | "corpo1_snack" | "corpo2" | "corpo2_basic" | "corpo3";

export type PlanTariffConfig = {
  showSnacks: boolean;
  showBebidas: boolean;
  corpoFilter: CorpoFilter;
  cartaLibre: boolean;
  capCentsPerPerson: number | null;
};

/**
 * Tarifas con lógica de filtrado de menú en el POS. "CARTA_LIBRE" existe como
 * planCode (cliente "Grupo SierraDelta SRL") pero deliberadamente no tiene
 * entrada acá: su ausencia ya produce el comportamiento correcto de "sin
 * filtro, ve todo el menú" (ver `allowedPlanConfig` en pos/page.tsx).
 */
export const PLAN_TARIFF_CONFIG: Record<string, PlanTariffConfig> = {
  CORPO1: { showSnacks: false, showBebidas: false, corpoFilter: "corpo1", cartaLibre: false, capCentsPerPerson: null },
  CORPO1_BEBIDAS: { showSnacks: false, showBebidas: true, corpoFilter: "corpo1", cartaLibre: false, capCentsPerPerson: null },
  CORPO1_SNACK_BEBIDA: { showSnacks: false, showBebidas: true, corpoFilter: "corpo1_snack", cartaLibre: false, capCentsPerPerson: null },
  CORPO1_SNACKS: { showSnacks: true, showBebidas: true, corpoFilter: "corpo1", cartaLibre: false, capCentsPerPerson: null },
  CORPO2: { showSnacks: false, showBebidas: false, corpoFilter: "corpo2", cartaLibre: false, capCentsPerPerson: null },
  CORPO2_SNACKS: { showSnacks: true, showBebidas: true, corpoFilter: "corpo2", cartaLibre: false, capCentsPerPerson: null },
  CORPO2_CARTA_LIBRE: { showSnacks: true, showBebidas: true, corpoFilter: "corpo2", cartaLibre: true, capCentsPerPerson: null },
  CORPO_BRUNCH: { showSnacks: false, showBebidas: false, corpoFilter: "corpo3", cartaLibre: false, capCentsPerPerson: null },
};

/** Todas las tarifas ofrecidas en el alta de cuentas corrientes, incluida CARTA_LIBRE. */
export const PLAN_CODES = [
  "CORPO1",
  "CORPO1_BEBIDAS",
  "CORPO1_SNACK_BEBIDA",
  "CORPO1_SNACKS",
  "CORPO2",
  "CORPO2_SNACKS",
  "CORPO2_CARTA_LIBRE",
  "CORPO_BRUNCH",
  "CARTA_LIBRE",
] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

export const PLAN_LABELS: Record<PlanCode, string> = {
  CORPO1: "Corpo 1 (básico)",
  CORPO1_BEBIDAS: "Corpo 1 + bebidas",
  CORPO1_SNACK_BEBIDA: "Corpo 1 snack + bebida",
  CORPO1_SNACKS: "Corpo 1 + snacks y bebidas",
  CORPO2: "Corpo 2 (básico)",
  CORPO2_SNACKS: "Corpo 2 + snacks y bebidas",
  CORPO2_CARTA_LIBRE: "Corpo 2 carta libre",
  CORPO_BRUNCH: "Corpo 3 / Brunch",
  CARTA_LIBRE: "Carta libre (sin restricción de menú)",
};

/**
 * Filtro de productos "Corporativo" por tarifa, por substring del nombre del
 * producto (en minúsculas). Extraído tal cual de pos/page.tsx para poder
 * reusarlo server-side (sugerencia de tope de cobertura).
 */
export function matchesCorpoFilter(productNameLower: string, corpoFilter: CorpoFilter): boolean {
  if (corpoFilter === "all") return true;
  if (corpoFilter === "corpo1") return productNameLower.includes("corpo 1");
  if (corpoFilter === "corpo1_snack") {
    return productNameLower.includes("corpo 1") && productNameLower.includes("snack");
  }
  if (corpoFilter === "corpo2") return productNameLower.includes("corpo 2");
  if (corpoFilter === "corpo2_basic") {
    return (
      productNameLower.includes("corpo 2") &&
      (productNameLower.includes("snack") || productNameLower.includes("brunch"))
    );
  }
  if (corpoFilter === "corpo3") return productNameLower.includes("corpo 3");
  return true;
}

/**
 * true si la tarifa no tiene tope de cobertura automático: sin plan, plan
 * desconocido (ej. CARTA_LIBRE, que no está en PLAN_TARIFF_CONFIG), o un plan
 * marcado explícitamente como carta libre (ej. CORPO2_CARTA_LIBRE).
 */
export function isUncappedPlan(planCode: string | null | undefined): boolean {
  if (!planCode) return true;
  const config = PLAN_TARIFF_CONFIG[planCode];
  if (!config) return true;
  return config.cartaLibre;
}
