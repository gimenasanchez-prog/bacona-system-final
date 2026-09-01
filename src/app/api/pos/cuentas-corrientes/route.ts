import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim();

  const accounts = await prisma.cuentaCorrienteAccount.findMany({
    where: {
      isActive: true,
      accountKind: "CORPORATIVA",
      // Las cuentas "padre" de facturación (con satélites) no se venden
      // directamente en el POS — solo sus cuentas satélite.
      satelliteAccounts: { none: {} },
      ...(query
        ? {
            customer: {
              displayName: {
                contains: query,
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    include: { customer: { select: { id: true, displayName: true } } },
    orderBy: { customer: { displayName: "asc" } },
    take: 50,
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      customer: a.customer,
      planCode: a.planCode ?? null,
      coverageAmountCents: a.coverageAmountCents ?? null,
    })),
  });
}

