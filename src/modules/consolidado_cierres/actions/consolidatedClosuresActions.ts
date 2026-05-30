"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

export async function deleteCashSessionAction(formData: FormData) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") throw new Error("No autorizado");

  const cashSessionId = formData.get("cashSessionId");
  if (typeof cashSessionId !== "string" || !cashSessionId) throw new Error("ID inválido");

  await ConsolidatedClosuresService.deleteCashSession(cashSessionId);
  redirect("/caja/consolidado");
}

