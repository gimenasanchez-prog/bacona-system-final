import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_STOCK_LOCATION_CODES = {
  SALTA: "SALTA",
  EN_TRANSITO: "EN_TRANSITO",
  BACONA: "BACONA",
} as const;

export class StockDefaultsService {
  static async ensureDefaultLocations(db: Db) {
    const [salta, enTransito, bacona] = await Promise.all([
      db.stockLocation.upsert({
        where: { code: DEFAULT_STOCK_LOCATION_CODES.SALTA },
        update: { isActive: true, label: "Salta" },
        create: { code: DEFAULT_STOCK_LOCATION_CODES.SALTA, label: "Salta", isActive: true },
      }),
      db.stockLocation.upsert({
        where: { code: DEFAULT_STOCK_LOCATION_CODES.EN_TRANSITO },
        update: { isActive: true, label: "En tránsito" },
        create: {
          code: DEFAULT_STOCK_LOCATION_CODES.EN_TRANSITO,
          label: "En tránsito",
          isActive: true,
        },
      }),
      db.stockLocation.upsert({
        where: { code: DEFAULT_STOCK_LOCATION_CODES.BACONA },
        update: { isActive: true, label: "Bacoña" },
        create: { code: DEFAULT_STOCK_LOCATION_CODES.BACONA, label: "Bacoña", isActive: true },
      }),
    ]);

    return {
      salta,
      enTransito,
      bacona,
    };
  }
}

