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

  try {
    const businessDate = parsed.data.businessDate
      ? new Date(`${parsed.data.businessDate}T00:00:00`)
      : undefined;
    const cashSession = await CashSessionService.openCashSession({
      employeeId: parsed.data.employeeId,
      shift: parsed.data.shift,
      businessDate,
    });

    const employee = await prisma.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { role: true },
    });

    const jar = await cookies();
    jar.set("bcn_cashSessionId", cashSession.id, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.set("bcn_employeeId", parsed.data.employeeId, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.set("bcn_shift", parsed.data.shift, { httpOnly: true, sameSite: "lax", path: "/" });
    if (employee) {
      jar.set("bcn_role", employee.role, { httpOnly: true, sameSite: "lax", path: "/" });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  redirect("/caja/turno");
}

const CloseCashSessionSchema = z.object({
  cashSessionId: z.string().min(1),
});

export async function closeCashSessionAction(formData: FormData) {
  const parsed = CloseCashSessionSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
  });
  if (!parsed.success) throw new Error(parsed.error.message);

  await CashSessionService.closeCashSession({ cashSessionId: parsed.data.cashSessionId });

  const jar = await cookies();
  jar.set("bcn_cashSessionId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_employeeId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_shift", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  redirect("/caja/abrir");
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

