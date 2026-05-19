"use server";

import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";

export async function listCashClosuresAction(params: {
  from?: Date;
  to?: Date;
  shift?: "MANIANA" | "TARDE" | "NOCHE";
  employeeId?: string;
  cashSessionStatus?: "OPEN" | "CLOSED";
  envelopeStatus?: "CLOSED" | "OPENED" | "CONTROLLED" | "NOT_CONTROLLED";
}) {
  return ConsolidatedClosuresService.listCashClosures(params);
}

export async function getCashClosureDetailAction(cashSessionId: string) {
  return ConsolidatedClosuresService.getCashClosureDetail(cashSessionId);
}

