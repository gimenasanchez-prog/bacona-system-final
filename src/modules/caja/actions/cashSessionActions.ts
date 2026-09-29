"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";

const ShiftSchema = z.enum(["MANIANA", "TARDE", "NOCHE"]);

const OpenCashSessionSchema = z.object({
  employeeId: z.string().min(1),
  shift: ShiftSchema,
  businessDate: z.string().optional(),
});

export type OpenCashSessionState = { error: string | null };

export async function openCashSessionAction(
  _prevState: OpenCashSessionState,
  formData: FormData
): Promise<OpenCashSessionState> {
  const parsed = OpenCashSessionSchema.safeParse({
    employeeId: String(formData.get("employeeId") ?? ""),
    shift: String(formData.get("shift") ?? ""),
    businessDate: String(formData.get("businessDate") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.message };

  let pendingPrevious = false;
  try {
    const businessDate = parsed.data.businessDate
      ? new Date(`${parsed.data.businessDate}T00:00:00`)
      : undefined;

    // Turnos que quedaron abiertos (se salió sin cerrar, se perdió la sesión del navegador):
    // los vacíos se cierran solos; si hay uno con actividad, se retoma para cerrarlo primero.
    const pending = await CashSessionService.closeEmptyOpenSessions(parsed.data.employeeId);
    const requestedDay = (businessDate ?? new Date()).toDateString();
    const previous = pending.find(
      (s) => !(s.shift === parsed.data.shift && s.businessDate.toDateString() === requestedDay)
    );
    const cashSession =
      previous ??
      (await CashSessionService.openCashSession({
        employeeId: parsed.data.employeeId,
        shift: parsed.data.shift,
        businessDate,
      }));
    pendingPrevious = !!previous;
    // Turno nuevo: toma las mesas que el turno anterior le pasó sin cobrar.
    if (!previous) await CashSessionService.adoptTransferredTables(cashSession.id);

    const employee = await prisma.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { role: true },
    });

    const jar = await cookies();
    jar.set("bcn_cashSessionId", cashSession.id, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.set("bcn_employeeId", parsed.data.employeeId, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.set("bcn_shift", cashSession.shift, { httpOnly: true, sameSite: "lax", path: "/" });
    if (employee) {
      jar.set("bcn_role", employee.role, { httpOnly: true, sameSite: "lax", path: "/" });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  redirect(pendingPrevious ? "/caja/turno?aviso=turno-pendiente" : "/caja/turno");
}

const CloseCashSessionSchema = z.object({
  cashSessionId: z.string().min(1),
});

export async function closeCashSessionAction(formData: FormData) {
  const parsed = CloseCashSessionSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
  });
  if (!parsed.success) throw new Error(parsed.error.message);

  let errorMsg: string | null = null;
  try {
    await CashSessionService.closeCashSession({ cashSessionId: parsed.data.cashSessionId });
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al cerrar el turno.";
  }
  if (errorMsg) redirect(`/caja/turno?error=${encodeURIComponent(errorMsg)}`);

  const jar = await cookies();
  jar.set("bcn_cashSessionId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_employeeId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_shift", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  redirect("/caja/abrir");
}

export async function transferOpenTableAction(formData: FormData) {
  const saleId = String(formData.get("saleId") ?? "");
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;

  let errorMsg: string | null = null;
  try {
    if (!saleId || !cashSessionId) throw new Error("Datos inválidos.");
    await CashSessionService.transferOpenTable({ saleId, fromCashSessionId: cashSessionId });
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al pasar la mesa.";
  }
  redirect(errorMsg ? `/caja/turno?error=${encodeURIComponent(errorMsg)}` : "/caja/turno");
}

export async function getCurrentCashSessionIdFromCookies(): Promise<string | null> {
  return (await cookies()).get("bcn_cashSessionId")?.value ?? null;
}

export async function getCashSessionSummaryAction(cashSessionId: string) {
  return CashSessionService.getCashSessionSummary(cashSessionId);
}

export async function getCurrentCashSessionSummaryAction() {
  const cashSessionId = await getCurrentCashSessionIdFromCookies();
  if (!cashSessionId) return null;
  return CashSessionService.getCashSessionSummary(cashSessionId);
}

