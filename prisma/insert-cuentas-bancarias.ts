/**
 * insert-cuentas-bancarias.ts
 *
 * Crea las cuentas bancarias (Brubank, Galicia, BBVA) como LocalCashBox{kind: CUENTA_BANCARIA}
 * y una tarjeta de crédito inicial. Idempotente: no duplica si ya existen.
 *
 * LOCAL:
 *   npx tsx prisma/insert-cuentas-bancarias.ts
 *
 * PROD:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/insert-cuentas-bancarias.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL requerida");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const CUENTAS = ["Brubank", "Galicia", "BBVA"];

async function main() {
  for (const name of CUENTAS) {
    const existing = await prisma.localCashBox.findFirst({ where: { name } });
    if (existing) {
      console.log(`${name} ya existe — ID:`, existing.id);
      continue;
    }
    const box = await prisma.localCashBox.create({
      data: { name, active: true, kind: "CUENTA_BANCARIA" },
    });
    console.log(`${name} creada — ID:`, box.id);
  }

  const cardName = "BBVA Crédito";
  const existingCard = await prisma.creditCard.findFirst({ where: { name: cardName } });
  if (existingCard) {
    console.log(`${cardName} ya existe — ID:`, existingCard.id);
  } else {
    const bbva = await prisma.localCashBox.findFirst({ where: { name: "BBVA" } });
    const card = await prisma.creditCard.create({
      data: {
        name: cardName,
        closingDay: 10,
        dueDay: 20,
        payFromCashBoxId: bbva?.id ?? null,
        active: true,
      },
    });
    console.log(`${cardName} creada — ID:`, card.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
