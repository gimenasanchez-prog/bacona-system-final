import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({ isActive: z.boolean() });

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

  try {
    const account = await prisma.cuentaCorrienteAccount.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
    });
    return NextResponse.json({ account });
  } catch {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }
}
