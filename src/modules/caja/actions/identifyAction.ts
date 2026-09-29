"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";

export type IdentifyState = { error: string } | null;

export async function identifyAction(_prev: IdentifyState, formData: FormData): Promise<IdentifyState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) redirect("/");

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId, isActive: true },
    select: { role: true, pinHash: true },
  });
  if (!employee) redirect("/");

  // Si el empleado tiene PIN asignado, verificarlo
  if (employee.pinHash) {
    const pin = String(formData.get("pin") ?? "");
    const ok = await bcrypt.compare(pin, employee.pinHash);
    if (!ok) return { error: "PIN incorrecto" };
  }

  const jar = await cookies();
  jar.set("bcn_employeeId", employeeId, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.set("bcn_role", employee.role, { httpOnly: true, sameSite: "lax", path: "/" });

  redirect("/");
}

export async function clearIdentityAction() {
  const jar = await cookies();

  // Salir no puede dejar un turno abierto para siempre: si está vacío se cierra solo;
  // si tiene ventas, egresos o sobre, hay que cerrarlo desde "Tu turno".
  const cashSessionId = jar.get("bcn_cashSessionId")?.value;
  if (cashSessionId) {
    const session = await prisma.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { status: true },
    });
    if (session?.status === "OPEN") {
      if (await CashSessionService.hasActivity(cashSessionId)) {
        redirect("/caja/turno?aviso=cerrar-antes-de-salir");
      }
      await CashSessionService.closeCashSession({
        cashSessionId,
        notes: "Cerrado automáticamente al salir: turno sin actividad",
      });
    }
  }

  jar.set("bcn_employeeId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_cashSessionId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_shift", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/");
}
