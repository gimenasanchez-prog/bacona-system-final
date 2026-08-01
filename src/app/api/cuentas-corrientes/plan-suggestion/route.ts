import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { PLAN_TARIFF_CONFIG, isUncappedPlan, matchesCorpoFilter } from "@/modules/cuentas_corrientes/lib/planTariffs";

/**
 * Sugerencia de tope de cobertura (coverageAmountCents) para el alta de una
 * cuenta corriente, según la tarifa elegida: el precio del producto
 * "Corporativo" más caro habilitado para esa tarifa (misma regla que
 * prisma/set-cc-coverage-amounts.ts, calculada en vivo contra los precios
 * actuales en vez de un valor hardcodeado).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const planCode = searchParams.get("planCode")?.trim() || null;

  if (isUncappedPlan(planCode)) {
    return NextResponse.json({ suggestedCoverageAmountCents: null });
  }

  const config = PLAN_TARIFF_CONFIG[planCode as string];
  if (!config) {
    return NextResponse.json({ suggestedCoverageAmountCents: null });
  }

  const corporateProducts = await prisma.product.findMany({
    where: { category: { name: "Corporativo" } },
    select: { name: true, priceCents: true },
  });

  const matching = corporateProducts.filter((p) => matchesCorpoFilter(p.name.toLowerCase(), config.corpoFilter));
  const suggestedCoverageAmountCents = matching.length > 0 ? Math.max(...matching.map((p) => p.priceCents)) : null;

  return NextResponse.json({ suggestedCoverageAmountCents });
}
