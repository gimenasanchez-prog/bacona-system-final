"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ConsolidatedClosuresService } from "@/modules/consolidado_cierres/services/consolidatedClosuresService";
import { PosSaleService } from "@/modules/ventas_pos/services/posSaleService";

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

export async function deleteCashSessionAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") return { error: "No autorizado" };

  const cashSessionId = formData.get("cashSessionId");
  if (typeof cashSessionId !== "string" || !cashSessionId) return { error: "ID inválido" };

  try {
    await ConsolidatedClosuresService.deleteCashSession(cashSessionId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al eliminar" };
  }

  redirect("/caja/consolidado");
}

export async function cancelSaleGerenciaAction(formData: FormData) {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA") throw new Error("No autorizado");

  const saleId = formData.get("saleId");
  const cashSessionId = formData.get("cashSessionId");
  const reason = formData.get("reason");
  if (typeof saleId !== "string" || !saleId) throw new Error("ID inválido");
  if (typeof cashSessionId !== "string" || !cashSessionId) throw new Error("ID de sesión inválido");

  await PosSaleService.cancelSaleByGerencia(
    saleId,
    typeof reason === "string" && reason.trim() ? reason.trim() : "Anulación gerencia"
  );

  redirect(`/caja/cierres/${cashSessionId}`);
}

