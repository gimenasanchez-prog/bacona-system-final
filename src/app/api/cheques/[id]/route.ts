import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ChequeService } from "@/modules/cheques/services/chequeService";

const schema = z
  .object({
    numeroCheque: z.string().optional(),
    banco: z.string().optional(),
    librador: z.string().optional(),
  })
  .refine((d) => d.numeroCheque !== undefined || d.banco !== undefined || d.librador !== undefined, {
    message: "Se requiere al menos un campo para actualizar",
  });

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
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { numeroCheque, banco, librador } = parsed.data;
  const data: { numeroCheque?: string | null; banco?: string | null; librador?: string | null } = {};
  if (numeroCheque !== undefined) data.numeroCheque = numeroCheque.trim() || null;
  if (banco !== undefined) data.banco = banco.trim() || null;
  if (librador !== undefined) data.librador = librador.trim() || null;

  try {
    const cheque = await ChequeService.updateDetails(id, data);
    return NextResponse.json({ cheque });
  } catch {
    return NextResponse.json({ error: "Cheque no encontrado." }, { status: 404 });
  }
}
