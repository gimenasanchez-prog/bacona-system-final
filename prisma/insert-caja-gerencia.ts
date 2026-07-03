/**
 * insert-caja-gerencia.ts
 *
 * Crea el registro "Caja Gerencia" en la tabla LocalCashBox si no existe.
 * Idempotente: no hace nada si ya existe.
 *
 * LOCAL:
 *   npx tsx prisma/insert-caja-gerencia.ts
 *
 * PROD:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/insert-caja-gerencia.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL requerida");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const existing = await prisma.localCashBox.findFirst({
    where: { name: "Caja Gerencia" },
  });

  if (existing) {
    console.log("Caja Gerencia ya existe — ID:", existing.id);
    return;
  }

  const box = await prisma.localCashBox.create({
    data: { name: "Caja Gerencia", active: true },
  });

  console.log("Caja Gerencia creada — ID:", box.id);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
