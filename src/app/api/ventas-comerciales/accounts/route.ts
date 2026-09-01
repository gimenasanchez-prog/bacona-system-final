import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await prisma.cuentaCorrienteAccount.findMany({
      where: { isActive: true },
      include: {
        customer: {
          select: { displayName: true, razonSocial: true, cuit: true, ivaCondition: true, address: true },
        },
      },
      orderBy: { customer: { displayName: "asc" } },
    });

    return NextResponse.json(
      accounts.map((a) => ({
        id: a.id,
        customerName: a.customer.displayName,
        razonSocial: a.customer.razonSocial,
        cuit: a.customer.cuit,
        ivaCondition: a.customer.ivaCondition,
        address: a.customer.address,
      }))
    );
  } catch (err) {
    console.error("[GET /api/ventas-comerciales/accounts]", err);
    return NextResponse.json({ error: "Error al obtener cuentas corrientes." }, { status: 500 });
  }
}
