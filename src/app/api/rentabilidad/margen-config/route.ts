import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MargenConfigService } from "@/modules/rentabilidad/services/margenConfigService";

const UpsertSchema = z.object({
  categoryId: z.string().cuid(),
  cogsPercent: z.number().min(0).max(100),
});

export async function GET() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  try {
    const items = await MargenConfigService.list();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/rentabilidad/margen-config GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  const employeeId = jar.get("bcn_employeeId")?.value;
  if (!employeeId) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await MargenConfigService.upsert(
    parsed.data.categoryId,
    parsed.data.cogsPercent,
    employeeId
  );
  return NextResponse.json({ item });
}
