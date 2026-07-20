/**
 * set-cc-coverage-amounts.ts — BCN julio 2026
 *
 * Carga el monto de cobertura corporativa por transacción para cada cuenta CC.
 * El campo coverageAmountCents controla:
 *   - El cap del carrito en el POS (planCapReached)
 *   - El auto-fill del monto en el modal de pago CC
 *   - La validación al registrar un pago CC
 *
 * Montos en CENTAVOS (multiplicar por 100). Ejemplos:
 *   $13.500 → 1350000
 *   $6.300  → 630000
 *   null    → sin límite (carta libre, sin cap automático)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DRY RUN (solo muestra qué haría, no escribe nada):
 *   npx tsx prisma/set-cc-coverage-amounts.ts
 *
 * EJECUTAR:
 *   npx tsx prisma/set-cc-coverage-amounts.ts --execute
 * ──────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL requerida");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = !process.argv.includes("--execute");

// ─── MONTOS POR CUENTA ────────────────────────────────────────────────────────
// Regla: coverageAmountCents = precio del producto corpo más caro habilitado para el plan.
// Los precios salen de los productos en la categoría "Corporativo":
//   Corpo 1 - Almuerzo c/ bebida            $13.500 → 1_350_000
//   Corpo 1 - Brunch c/ bebida              $ 7.800 →   780_000
//   Corpo 1 - Snack c/ bebida               $ 6.300 →   630_000
//   Corpo 2 - Appetite c/ bebida y postre   $15.500 → 1_550_000
//   Corpo 2 - Brunch c/ bebida y postre     $ 9.200 →   920_000
//   Corpo 2 - Snack c/ bebida               $ 6.900 →   690_000
//   Corpo 3 - Brunch c/ bebida              $ 8.200 →   820_000
//
// null = sin tope automático (el cajero maneja el pago manualmente)
const COVERAGE: Record<string, number | null> = {
  "Runa":                  1_350_000, // CORPO1_SNACKS  → max corpo 1 = $13.500
  "Ecco SAU":              1_550_000, // CORPO2         → max corpo 2 = $15.500
  "MVA":                   1_350_000, // CORPO1_BEBIDAS → max corpo 1 = $13.500
  "DINATEC":               1_350_000, // CORPO1_SNACKS  → max corpo 1 = $13.500
  "CyS":                   1_350_000, // CORPO1_SNACKS  → max corpo 1 = $13.500
  "Tmo del Norte":         1_350_000, // CORPO1         → max corpo 1 = $13.500
  "Posco Enc Arg":         1_350_000, // CORPO1_BEBIDAS → max corpo 1 = $13.500
  "Posco Enc Kor":           630_000, // CORPO1_SNACK_BEBIDA → Corpo 1 Snack c/bebida = $6.300
  "Posco SAU":             null,      // CORPO2_CARTA_LIBRE → confirmar con Gimena
  "Socompa":               null,      // CORPO2_CARTA_LIBRE → confirmar con Gimena
  "Fundación Condor":      1_550_000, // CORPO2_SNACKS  → max corpo 2 = $15.500
  "PECOM":                 1_550_000, // CORPO2_SNACKS  → max corpo 2 = $15.500
  "Grupo SierraDelta SRL": null,      // CARTA_LIBRE    → sin tope
  "HY Ingenieria SAU":       820_000, // CORPO_BRUNCH   → max corpo 3 = $8.200
};
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const accounts = await prisma.cuentaCorrienteAccount.findMany({
    include: { customer: { select: { displayName: true } } },
  });

  console.log(DRY_RUN ? "\n[DRY RUN] Cambios que se aplicarían:\n" : "\nAplicando cambios:\n");

  for (const acc of accounts) {
    const name = acc.customer.displayName;
    if (!(name in COVERAGE)) {
      console.log(`  SKIP  ${name} — no está en el mapa`);
      continue;
    }
    const newValue = COVERAGE[name];
    const oldValue = acc.coverageAmountCents;
    if (newValue === oldValue) {
      console.log(`  =     ${name.padEnd(30)} ya tiene ${newValue == null ? "null" : `$${(newValue / 100).toLocaleString("es-AR")}`}`);
      continue;
    }
    const from = oldValue == null ? "null" : `$${(oldValue / 100).toLocaleString("es-AR")}`;
    const to   = newValue == null ? "null" : `$${(newValue / 100).toLocaleString("es-AR")}`;
    console.log(`  SET   ${name.padEnd(30)} ${from} → ${to}`);
    if (!DRY_RUN) {
      await prisma.cuentaCorrienteAccount.update({
        where: { id: acc.id },
        data: { coverageAmountCents: newValue },
      });
    }
  }

  console.log(DRY_RUN ? "\nDry run completo. Corré con --execute para aplicar." : "\nListo.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
