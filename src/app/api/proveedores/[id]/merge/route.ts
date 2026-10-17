import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SupplierMergeService } from "@/modules/egresos_proveedores/services/supplierMergeService";

const MergeSchema = z.object({ intoId: z.string().min(1) });

/** Unifica este proveedor dentro de `intoId` (solo Gerencia). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Solo Gerencia puede unificar proveedores" }, { status: 403 });
  }

  const parsed = MergeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta elegir el proveedor destino" }, { status: 400 });

  try {
    const { id } = await params;
    const moved = await SupplierMergeService.merge({ sourceId: id, targetId: parsed.data.intoId });
    console.info("[proveedores] unificado", id, "→", parsed.data.intoId, moved);
    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo unificar" }, { status: 400 });
  }
}
