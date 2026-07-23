"use server";

import { z } from "zod";
import { cookies } from "next/headers";

import { Prisma } from "@prisma/client";
import { LocalExpenseService } from "@/modules/egresos_locales/services/localExpenseService";

const LocalExpenseCategorySchema = z.enum([
  "APROVISIONAMIENTO_COMIDA_LOCAL",
  "APROVISIONAMIENTO_BEBIDAS_LOCAL",
  "GAS",
  "MANTENIMIENTO",
  "OTRO",
]);

const LocalExpensePaymentSourceSchema = z.enum(["SHIFT_CASH", "LOCAL_CASH"]);

const CreateLocalExpenseSchema = z.object({
  cashSessionId: z.string().min(1),
  date: z.string().min(1),
  category: LocalExpenseCategorySchema,
  supplierId: z.string().min(1),
  description: z.string().optional(),
  amountCents: z.coerce.number().int().positive(),
  paymentSource: LocalExpensePaymentSourceSchema,
  affectsStock: z.coerce.boolean().default(false),
  inventoryItemId: z.string().optional(),
  qty: z.string().optional(),
});

export type CreateLocalExpenseState = { error: string | null; createdId: string | null };

export async function createLocalExpenseAction(
  _prevState: CreateLocalExpenseState,
  formData: FormData
): Promise<CreateLocalExpenseState> {
  const parsed = CreateLocalExpenseSchema.safeParse({
    cashSessionId: String(formData.get("cashSessionId") ?? ""),
    date: String(formData.get("date") ?? ""),
    category: String(formData.get("category") ?? ""),
    supplierId: String(formData.get("supplierId") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    amountCents: formData.get("amountCents"),
    paymentSource: String(formData.get("paymentSource") ?? ""),
    affectsStock: formData.get("affectsStock") ? true : false,
    inventoryItemId: String(formData.get("inventoryItemId") ?? "") || undefined,
    qty: String(formData.get("qty") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.message, createdId: null };

  try {
    const employeeId = (await cookies()).get("bcn_employeeId")?.value ?? null;
    if (!employeeId) return { error: "No hay asociada/o seleccionada/o (abrí caja de nuevo)", createdId: null };

    const stockLink =
      parsed.data.affectsStock && parsed.data.inventoryItemId && parsed.data.qty
        ? {
            inventoryItemId: parsed.data.inventoryItemId,
            qty: new Prisma.Decimal(parsed.data.qty),
          }
        : null;

    const timeOfDay = new Date().toTimeString().slice(0, 8);
    const expense = await LocalExpenseService.createLocalExpense({
      cashSessionId: parsed.data.cashSessionId,
      date: new Date(`${parsed.data.date}T${timeOfDay}`),
      category: parsed.data.category,
      supplierId: parsed.data.supplierId,
      description: parsed.data.description ?? null,
      amountCents: parsed.data.amountCents,
      paymentSource: parsed.data.paymentSource,
      affectsStock: parsed.data.affectsStock,
      createdByEmployeeId: employeeId,
      stockLink,
    });

    return { error: null, createdId: expense.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error", createdId: null };
  }
}

