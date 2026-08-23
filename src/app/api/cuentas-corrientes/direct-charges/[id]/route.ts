import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { CcDirectChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PatchSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().min(1).optional(),
    motive: z.string().min(1).optional(),
    category: z.nativeEnum(CcDirectChargeCategory).optional(),
    amountCents: z.coerce.number().min(0.01).optional(),
    comandaNumber: z.string().optional(),
  })
  .refine(
    (d) =>
      d.date !== undefined ||
      d.description !== undefined ||
      d.motive !== undefined ||
      d.category !== undefined ||
      d.amountCents !== undefined ||
      d.comandaNumber !== undefined,
    { message: "Se requiere al menos un campo para actualizar" }
  );

async function assertEditable(id: string) {
  const charge = await prisma.ccDirectCharge.findUnique({ where: { id } });
  if (!charge) return { error: "Cargo no encontrado.", status: 404 } as const;
  if (charge.cuentaCorrienteInvoiceId) {
    return { error: "No se puede modificar un cargo que ya fue facturado.", status: 400 } as const;
  }
  return { charge };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // El PATCH de comandaNumber-only (usado por ComandaInlineEdit) se permite
  // incluso sobre cargos ya facturados, igual que para ventas.
  const onlyComanda =
    parsed.data.comandaNumber !== undefined &&
    parsed.data.date === undefined &&
    parsed.data.description === undefined &&
    parsed.data.motive === undefined &&
    parsed.data.category === undefined &&
    parsed.data.amountCents === undefined;

  if (!onlyComanda) {
    const check = await assertEditable(id);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
  }

  const { date, description, motive, category, amountCents, comandaNumber } = parsed.data;
  const data: Record<string, unknown> = {};
  if (date !== undefined) data.date = new Date(date + "T12:00:00.000Z");
  if (description !== undefined) data.description = description;
  if (motive !== undefined) data.motive = motive;
  if (category !== undefined) data.category = category;
  if (amountCents !== undefined) data.amountCents = Math.round(amountCents * 100);
  if (comandaNumber !== undefined) data.comandaNumber = comandaNumber.trim() || null;

  try {
    const updated = await prisma.ccDirectCharge.update({ where: { id }, data });
    return NextResponse.json({ charge: updated });
  } catch {
    return NextResponse.json({ error: "Cargo no encontrado." }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const { id } = await params;
  const check = await assertEditable(id);
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  await prisma.ccDirectCharge.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
