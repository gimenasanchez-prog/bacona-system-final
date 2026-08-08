"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HoursService } from "@/modules/horas/services/hoursService";

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida");

const SaveHoursEntrySchema = z.object({
  workDate: z.string().min(1, "La fecha es obligatoria"),
  checkInTime: TimeSchema,
  checkOutTime: TimeSchema,
});

export type SaveHoursEntryState = { error: string | null };

export async function saveHoursEntryAction(
  _prevState: SaveHoursEntryState,
  formData: FormData
): Promise<SaveHoursEntryState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId || (role !== "ASOCIADO" && role !== "CAJA_LOCAL")) {
    return { error: "Sin permiso" };
  }

  const parsed = SaveHoursEntrySchema.safeParse({
    workDate: String(formData.get("workDate") ?? ""),
    checkInTime: String(formData.get("checkInTime") ?? ""),
    checkOutTime: String(formData.get("checkOutTime") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await HoursService.upsertDailyEntry({
      employeeId,
      workDate: new Date(`${parsed.data.workDate}T00:00:00.000Z`),
      checkInTime: parsed.data.checkInTime,
      checkOutTime: parsed.data.checkOutTime,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  redirect("/horas");
}
