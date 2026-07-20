/**
 * split-posco-enc.ts — BCN julio 2026
 *
 * Divide el cliente CC "Posco Enc" en dos cuentas separadas por tarifa:
 *   - "Posco Enc Arg" (reusa la cuenta existente, conserva el historial):
 *       planCode CORPO1_BEBIDAS, coverageAmountCents 1_350_000
 *       → habilita los 3 combos Corpo 1 (Snack/Brunch/Almuerzo) + bebida
 *   - "Posco Enc Kor" (cuenta nueva):
 *       planCode CORPO1_SNACK_BEBIDA, coverageAmountCents 630_000
 *       → habilita solo el combo Corpo 1 - Snack + bebida
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DRY RUN (solo muestra qué haría, no escribe nada):
 *   npx tsx prisma/split-posco-enc.ts
 *
 * EJECUTAR:
 *   npx tsx prisma/split-posco-enc.ts --execute
 * ──────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL requerida");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = !process.argv.includes("--execute");

const ARG_PLAN_CODE = "CORPO1_BEBIDAS";
const ARG_COVERAGE_CENTS = 1_350_000;
const KOR_PLAN_CODE = "CORPO1_SNACK_BEBIDA";
const KOR_COVERAGE_CENTS = 630_000;

async function main() {
  console.log(DRY_RUN ? "\n[DRY RUN] Cambios que se aplicarían:\n" : "\nAplicando cambios:\n");

  const existing = await prisma.customer.findFirst({
    where: { displayName: "Posco Enc" },
    include: { accounts: true },
  });

  if (!existing) {
    console.log('  SKIP  no se encontró un cliente "Posco Enc" (¿ya migrado?)');
  } else {
    const account = existing.accounts[0];
    if (!account) {
      console.log(`  WARN  "Posco Enc" (${existing.id}) no tiene CuentaCorrienteAccount — no se puede migrar automáticamente`);
    } else {
      console.log(`  SET   "Posco Enc" → "Posco Enc Arg" (customer ${existing.id})`);
      console.log(`  SET   cuenta ${account.id}: planCode ${account.planCode} → ${ARG_PLAN_CODE}, coverageAmountCents ${account.coverageAmountCents} → ${ARG_COVERAGE_CENTS}`);
      if (!DRY_RUN) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { displayName: "Posco Enc Arg" },
        });
        await prisma.cuentaCorrienteAccount.update({
          where: { id: account.id },
          data: { planCode: ARG_PLAN_CODE, coverageAmountCents: ARG_COVERAGE_CENTS },
        });
      }
    }
  }

  const kor = await prisma.customer.findFirst({ where: { displayName: "Posco Enc Kor" } });
  if (kor) {
    console.log('  SKIP  "Posco Enc Kor" ya existe');
  } else {
    console.log(`  NEW   "Posco Enc Kor" — cuenta CC planCode ${KOR_PLAN_CODE}, coverageAmountCents ${KOR_COVERAGE_CENTS}`);
    if (!DRY_RUN) {
      await prisma.customer.create({
        data: {
          displayName: "Posco Enc Kor",
          accounts: {
            create: {
              planCode: KOR_PLAN_CODE,
              coverageAmountCents: KOR_COVERAGE_CENTS,
              billingCycle: "MENSUAL",
            },
          },
        },
      });
    }
  }

  console.log(DRY_RUN ? "\nDry run completo. Corré con --execute para aplicar." : "\nListo.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
