import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ChequeService } from "@/modules/cheques/services/chequeService";

const schema = z.object({
  fechaDeposito: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export async function POST(
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
    const cheque = await ChequeService.setDeposito(id, new Date(parsed.data.fechaDeposito + "T12:00:00.000Z"));
    return NextResponse.json({ cheque });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al registrar el depósito." },
      { status: 400 }
    );
  }
}
