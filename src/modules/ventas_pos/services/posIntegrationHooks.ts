import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StockMovementService } from "@/modules/stock/services/stockMovementService";

type Db = PrismaClient | Prisma.TransactionClient;

export async function onSaleConfirmed(saleId: string, db: Db = prisma): Promise<void> {
  await StockMovementService.ensureSaleMovement(db, saleId);
}

export async function onSalePaid(_saleId: string, _db: Db = prisma): Promise<void> {
  // Placeholder: cierre_de_caja, etc.
}

