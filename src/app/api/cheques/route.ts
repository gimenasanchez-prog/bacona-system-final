import { NextResponse } from "next/server";
import { ChequeService } from "@/modules/cheques/services/chequeService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cheques = await ChequeService.listCheques();
    return NextResponse.json(cheques);
  } catch (err) {
    console.error("[GET /api/cheques]", err);
    return NextResponse.json({ error: "Error al obtener cheques." }, { status: 500 });
  }
}
