"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { EnvelopeService } from "@/modules/sobres/services/envelopeService";

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

async function clearSessionCookies() {
  const jar = await cookies();
  jar.set("bcn_cashSessionId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_employeeId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_shift", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

const SealAndCloseSchema = z.object({
  cashSessionId: z.string().min(1),
  declaredPesos: z.string().trim().min(1).transform(Number).pipe(z.number().min(0)),
  note: z.string().optional(),
  acceptedResponsibility: z.string().optional(),
});

export type SealAndCloseState = { error: string | null };

/** Último paso del cierre guiado: sella el sobre y cierra el turno. */
export async function sealAndCloseShiftAction(
  _prev: SealAndCloseState,
  formData: FormData
): Promise<SealAndCloseState> {
  const parsed = SealAndCloseSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
    declaredPesos: String(formData.get("declaredPesos") ?? "").replace(",", "."),
    note: String(formData.get("note") ?? "") || undefined,
    acceptedResponsibility: String(formData.get("acceptedResponsibility") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Cargá cuánto estás metiendo en el sobre." };

  const cookieSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (cookieSessionId !== parsed.data.cashSessionId) {
    return { error: "Solo quien tiene el turno abierto puede cerrarlo." };
  }

  let envelopeId: string | null = null;
  try {
    ({ envelopeId } = await EnvelopeService.sealAndClose({
      cashSessionId: parsed.data.cashSessionId,
      declaredCents: Math.round(parsed.data.declaredPesos * 100),
      note: parsed.data.note ?? null,
      acceptedResponsibility: parsed.data.acceptedResponsibility === "1",
    }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al cerrar el turno." };
  }

  await clearSessionCookies();
  redirect(envelopeId ? `/caja/turno/cerrado?sobre=${envelopeId}` : "/caja/turno/cerrado");
}

export async function transferOpenTableAction(formData: FormData) {
  const saleId = String(formData.get("saleId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "") === "/caja/turno/cerrar" ? "/caja/turno/cerrar" : "/caja/turno";
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;

  let errorMsg: string | null = null;
  try {
    if (!saleId || !cashSessionId) throw new Error("Datos inválidos.");
    await CashSessionService.transferOpenTable({ saleId, fromCashSessionId: cashSessionId });
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Error al pasar la mesa.";
  }
  redirect(errorMsg ? `${returnTo}?error=${encodeURIComponent(errorMsg)}` : returnTo);
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

