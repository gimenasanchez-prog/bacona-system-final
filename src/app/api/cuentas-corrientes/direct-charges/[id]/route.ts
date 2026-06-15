import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const PatchSchema = z.object({
  comandaNumber: z.string().min(1),
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
  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const updated = await prisma.ccDirectCharge.update({
      where: { id },
      data: { comandaNumber: parsed.data.comandaNumber.trim() },
    });
    return NextResponse.json({ charge: updated });
  } catch {
    return NextResponse.json({ error: "Cargo no encontrado." }, { status: 404 });
  }
}
