import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ChequeService } from "@/modules/cheques/services/chequeService";

const schema = z.object({ bankAccountId: z.string().min(1, "Elegí una cuenta bancaria") });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sesión no encontrada." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { id } = await params;
  try {
    const cheque = await ChequeService.markAcreditado(id, parsed.data.bankAccountId, employeeId);
    return NextResponse.json({ cheque });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al marcar el cheque como acreditado." },
      { status: 400 }
    );
  }
}
