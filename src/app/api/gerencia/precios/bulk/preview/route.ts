import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { PreciosService } from "@/modules/precios/services/preciosService";

const previewSchema = z.object({
  categoryIds: z.array(z.string().cuid()).min(1, "Elegí al menos una categoría"),
  percent: z.number().min(-90).max(500),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const preview = await PreciosService.previewBulkIncrease(parsed.data);
  return NextResponse.json({ preview });
}
