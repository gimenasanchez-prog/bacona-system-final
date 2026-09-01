"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { IvaCondition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLAN_CODES } from "@/modules/cuentas_corrientes/lib/planTariffs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  displayName: z.string().trim().min(1, "El nombre del cliente es obligatorio"),
  accountKind: z.enum(["CORPORATIVA", "TRANSITORIA"]).default("CORPORATIVA"),
  billingCycle: z.enum(["QUINCENAL", "MENSUAL"]).optional(),
  estimatedPaymentDate: z.string().optional(),
  planCode: z.string().optional(),
  uncapped: z.string().optional(),
  coverageAmountCents: z.string().optional(),
  address: z.string().optional(),
  razonSocial: z.string().optional(),
  cuit: z.string().optional(),
  ivaCondition: z.string().optional(),
  contactName1: z.string().optional(),
  contactPhone1: z.string().optional(),
  contactEmail1: z.string().optional(),
  contactName2: z.string().optional(),
  contactPhone2: z.string().optional(),
  contactEmail2: z.string().optional(),
});

export type CreateCcAccountState = { error: string | null; createdId: string | null };

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createCcAccountAction(
  _prev: CreateCcAccountState,
  formData: FormData
): Promise<CreateCcAccountState> {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;

  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO" && role !== "COMERCIAL") {
    return { error: "Sin permisos para crear cuentas corrientes.", createdId: null };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, createdId: null };
  }

  const data = parsed.data;
  const isTransitoria = data.accountKind === "TRANSITORIA";

  let planCode: string | null = null;
  let coverageAmountCents: number | null = null;
  let billingCycle: "QUINCENAL" | "MENSUAL" = "MENSUAL";
  let estimatedPaymentDate: Date | null = null;

  if (isTransitoria) {
    if (!data.estimatedPaymentDate) {
      return { error: "La fecha de pago estipulada es obligatoria para cuentas transitorias.", createdId: null };
    }
    estimatedPaymentDate = new Date(data.estimatedPaymentDate + "T12:00:00.000Z");
    if (Number.isNaN(estimatedPaymentDate.getTime())) {
      return { error: "Fecha de pago inválida.", createdId: null };
    }
  } else {
    planCode = emptyToNull(data.planCode);
    if (planCode && !(PLAN_CODES as readonly string[]).includes(planCode)) {
      return { error: "Tarifa inválida.", createdId: null };
    }

    const uncapped = data.uncapped === "true";
    if (!uncapped) {
      const amount = Number(data.coverageAmountCents);
      if (!data.coverageAmountCents || !Number.isFinite(amount) || amount <= 0) {
        return { error: "El tope de cobertura es obligatorio (o marcá \"Sin tope\").", createdId: null };
      }
      coverageAmountCents = Math.round(amount * 100);
    }

    if (!data.billingCycle) {
      return { error: "El ciclo de facturación es obligatorio.", createdId: null };
    }
    billingCycle = data.billingCycle;
  }

  const ivaConditionRaw = emptyToNull(data.ivaCondition);
  if (ivaConditionRaw && !(Object.values(IvaCondition) as string[]).includes(ivaConditionRaw)) {
    return { error: "Condición de IVA inválida.", createdId: null };
  }
  const ivaCondition = ivaConditionRaw as IvaCondition | null;

  const contactEmail1 = emptyToNull(data.contactEmail1);
  if (contactEmail1 && !EMAIL_RE.test(contactEmail1)) {
    return { error: "Email de contacto 1 inválido.", createdId: null };
  }
  const contactEmail2 = emptyToNull(data.contactEmail2);
  if (contactEmail2 && !EMAIL_RE.test(contactEmail2)) {
    return { error: "Email de contacto 2 inválido.", createdId: null };
  }

  const existing = await prisma.customer.findFirst({
    where: { displayName: { equals: data.displayName, mode: "insensitive" } },
  });
  if (existing) {
    return { error: "Ya existe un cliente con ese nombre.", createdId: null };
  }

  const account = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        displayName: data.displayName,
        isActive: true,
        address: emptyToNull(data.address),
        razonSocial: emptyToNull(data.razonSocial),
        cuit: emptyToNull(data.cuit),
        ivaCondition,
        contactName1: emptyToNull(data.contactName1),
        contactPhone1: emptyToNull(data.contactPhone1),
        contactEmail1,
        contactName2: emptyToNull(data.contactName2),
        contactPhone2: emptyToNull(data.contactPhone2),
        contactEmail2,
      },
    });

    return tx.cuentaCorrienteAccount.create({
      data: {
        customerId: customer.id,
        accountKind: data.accountKind,
        estimatedPaymentDate,
        planCode,
        billingCycle,
        coverageAmountCents,
        isActive: true,
      },
    });
  });

  return { error: null, createdId: account.id };
}
