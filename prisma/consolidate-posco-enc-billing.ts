/**
 * consolidate-posco-enc-billing.ts — BCN julio 2026
 *
 * Crea la cuenta de facturación raíz "Posco Enc" y la enlaza como padre
 * (billsToAccountId) de las cuentas satélite "Posco Enc Arg" y "Posco Enc Kor",
 * que siguen usándose en el POS para elegir tarifa pero dejan de facturar por
 * separado: sus ventas se consolidan en la cuenta padre (una sola factura,
 * un solo pago).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DRY RUN (solo muestra qué haría, no escribe nada):
 *   npx tsx prisma/consolidate-posco-enc-billing.ts
 *
 * EJECUTAR:
 *   npx tsx prisma/consolidate-posco-enc-billing.ts --execute
 * ──────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL requerida");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  console.log(DRY_RUN ? "\n[DRY RUN] Cambios que se aplicarían:\n" : "\nAplicando cambios:\n");

  const existingRoot = await prisma.customer.findFirst({ where: { displayName: "Posco Enc" } });
  if (existingRoot) {
    console.log('  SKIP  ya existe un cliente "Posco Enc" (¿ya migrado?)');
    await prisma.$disconnect();
    return;
  }

  const satellites = await prisma.customer.findMany({
    where: { displayName: { in: ["Posco Enc Arg", "Posco Enc Kor"] } },
    include: { accounts: true },
  });

  for (const name of ["Posco Enc Arg", "Posco Enc Kor"]) {
    if (!satellites.find((c) => c.displayName === name)) {
      console.log(`  WARN  no se encontró el cliente "${name}"`);
    }
  }

  const satelliteAccounts = satellites.flatMap((c) => c.accounts.map((a) => ({ customerName: c.displayName, account: a })));
  if (satelliteAccounts.length === 0) {
    console.log("  SKIP  no hay cuentas satélite para enlazar — nada que hacer");
    await prisma.$disconnect();
    return;
  }

  console.log('  NEW   "Posco Enc" — cuenta de facturación raíz (sin planCode, no se usa en el POS)');
  for (const { customerName, account } of satelliteAccounts) {
    console.log(`  SET   "${customerName}" (cuenta ${account.id}): billsToAccountId → "Posco Enc"`);
  }

  if (!DRY_RUN) {
    const rootCustomer = await prisma.customer.create({
      data: {
        displayName: "Posco Enc",
        accounts: {
          create: {
            planCode: null,
            coverageAmountCents: null,
            billingCycle: "MENSUAL",
          },
        },
      },
      include: { accounts: true },
    });
    const rootAccountId = rootCustomer.accounts[0].id;

    for (const { account } of satelliteAccounts) {
      await prisma.cuentaCorrienteAccount.update({
        where: { id: account.id },
        data: { billsToAccountId: rootAccountId },
      });
    }
  }

  console.log(DRY_RUN ? "\nDry run completo. Corré con --execute para aplicar." : "\nListo.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
