import { prisma } from "@/lib/prisma";

export class PosPricingService {
  static async recomputeSaleTotals(saleId: string): Promise<{
    subtotalCents: number;
    totalCents: number;
  }> {
    const items = await prisma.posSaleItem.findMany({
      where: { saleId },
      select: { lineTotalCents: true },
    });
    const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const totalCents = subtotalCents;

    await prisma.posSale.update({
      where: { id: saleId },
      data: { subtotalCents, totalCents },
    });

    return { subtotalCents, totalCents };
  }

  static async getPaidTotalCents(saleId: string): Promise<number> {
    const payments = await prisma.posPayment.findMany({
      where: { saleId },
      select: { amountCents: true },
    });
    return payments.reduce((sum, p) => sum + p.amountCents, 0);
  }
}

