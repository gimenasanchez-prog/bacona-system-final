/**
 * Corrige datos históricos afectados por el bug de sobres congelados:
 *  1. Sobres cuyo "esperado" no coincide con (efectivo del turno − egresos en efectivo del turno)
 *     porque hubo egresos / cobros / anulaciones después de generar el sobre.
 *  2. Snapshots de turnos cerrados (lo que muestra el Consolidado) que quedaron
 *     desactualizados por anulaciones posteriores al cierre.
 *
 * Por defecto corre en simulación. Para aplicar:  npx tsx scripts/resync-sobres-y-snapshots.ts --apply
 * Usa DATABASE_PUBLIC_URL (o DATABASE_URL).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const APPLY = process.argv.includes("--apply");
const ars = (c: number) => "$" + (c / 100).toLocaleString("es-AR");

async function main() {
  const sessions = await prisma.cashSession.findMany({
    include: {
      employee: { select: { displayName: true } },
      envelope: true,
      localExpenses: { select: { amountCents: true, paymentSource: true } },
      sales: { where: { status: { not: "CANCELLED" } }, select: { payments: true } },
    },
    orderBy: { businessDate: "asc" },
  });

  let envFixes = 0;
  let snapFixes = 0;

  for (const s of sessions) {
    const payments = s.sales.flatMap((x) => x.payments);
    const byMethod = (m: string) => payments.filter((p) => p.method === m).reduce((a, p) => a + p.amountCents, 0);
    const cash = byMethod("EFECTIVO");
    const income = payments.reduce((a, p) => a + p.amountCents, 0);
    const shiftExp = s.localExpenses.filter((e) => e.paymentSource === "SHIFT_CASH").reduce((a, e) => a + e.amountCents, 0);
    const allExp = s.localExpenses.reduce((a, e) => a + e.amountCents, 0);
    const expected = cash - shiftExp;
    const tag = `${s.businessDate.toISOString().slice(0, 10)} ${s.shift} ${s.employee.displayName}`;

    const env = s.envelope;
    if (env && env.expectedAmountCents !== expected) {
      envFixes++;
      const counted = env.actualAmountCents != null && (env.status === "CONTROLLED" || env.status === "NOT_CONTROLLED");
      const newStatus = counted ? (env.actualAmountCents === expected ? "CONTROLLED" : "NOT_CONTROLLED") : env.status;
      console.log(
        `SOBRE ${env.envelopeCode} (${tag}): esperado ${ars(env.expectedAmountCents)} → ${ars(expected)}` +
          (counted ? ` | contado ${ars(env.actualAmountCents!)} | estado ${env.status} → ${newStatus}` : "")
      );
      if (APPLY) {
        await prisma.envelope.update({ where: { id: env.id }, data: { expectedAmountCents: expected, status: newStatus } });
      }
    }

    if (s.status === "CLOSED" && (s.totalIncomeCents !== income || s.totalCashCents !== cash || s.totalExpensesCents !== allExp)) {
      snapFixes++;
      console.log(`CONSOLIDADO ${tag}: ingresos ${ars(s.totalIncomeCents)} → ${ars(income)}, efectivo ${ars(s.totalCashCents)} → ${ars(cash)}, egresos ${ars(s.totalExpensesCents)} → ${ars(allExp)}`);
      if (APPLY) {
        await prisma.cashSession.update({
          where: { id: s.id },
          data: {
            totalCashCents: cash,
            totalDebitCents: byMethod("DEBITO"),
            totalCreditCents: byMethod("CREDITO"),
            totalTransferCents: byMethod("TRANSFERENCIA"),
            totalQrCents: byMethod("QR"),
            totalChequeCents: byMethod("CHEQUE"),
            totalCuentaCorrienteCents: byMethod("CUENTA_CORRIENTE"),
            totalCuentasInternasCents: byMethod("CUENTAS_INTERNAS"),
            totalIncomeCents: income,
            totalExpensesCents: allExp,
            totalNetCents: income - allExp,
          },
        });
      }
    }
  }

  console.log(`\n${APPLY ? "APLICADO" : "SIMULACIÓN (usar --apply para guardar)"}: ${envFixes} sobres, ${snapFixes} cierres del consolidado.`);
  if (snapFixes && APPLY) {
    console.log("Nota: el detalle por cuenta corriente / cuenta interna de esos cierres se recalcula al anular desde 'Ver cierre'.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
