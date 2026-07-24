"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

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
  jar.set("bcn_employeeId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_role", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_cashSessionId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set("bcn_shift", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/");
}
