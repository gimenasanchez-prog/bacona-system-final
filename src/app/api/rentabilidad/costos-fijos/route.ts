import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CostosFijosService } from "@/modules/rentabilidad/services/costosFijosService";

const CATEGORIAS = [
  "ALQUILER",
  "SALARIOS",
  "SERVICIOS_BASICOS",
  "SEGUROS",
  "IMPUESTOS_FIJOS",
  "SUSCRIPCIONES",
  "OTRO",
] as const;

const CreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  categoria: z.enum(CATEGORIAS),
  amountCents: z.number().int().positive(),
  validFrom: z.string().datetime(),
  notas: z.string().max(300).optional(),
  isRecurring: z.boolean().optional(),
});

const UpdateSchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["update", "deactivate"]),
  nombre: z.string().min(1).max(100).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  amountCents: z.number().int().positive().optional(),
  notas: z.string().max(300).optional(),
  isRecurring: z.boolean().optional(),
});

async function requireGerencia() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  return role === "GERENCIA";
}

export async function GET() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  try {
    const items = await CostosFijosService.list();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/rentabilidad/costos-fijos GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireGerencia())) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = await CostosFijosService.create({
    ...parsed.data,
    validFrom: new Date(parsed.data.validFrom),
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireGerencia())) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, action, ...fields } = parsed.data;
  if (action === "deactivate") {
    await CostosFijosService.deactivate(id);
  } else {
    await CostosFijosService.update(id, fields);
  }
  return NextResponse.json({ ok: true });
}
