import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_PUBLIC_URL! }) });
const $ = (c: number) => (c / 100).toLocaleString("es-AR");
async function main() {
  const sessions = await prisma.cashSession.findMany({
    include: { employee: true, envelope: true, localExpenses: true,
      sales: { where: { status: { not: "CANCELLED" } }, include: { payments: true } } },
    orderBy: { businessDate: "asc" },
  });
  let n = { envMismatch: 0, envAfterExp: 0, envAfterSale: 0, snapMismatch: 0, closedNoEnv: 0, openOld: 0 };
  let sumEnvDiff = 0;
  const rows: string[] = [];
  for (const s of sessions) {
    const cashPays = s.sales.flatMap(x => x.payments).filter(p => p.method === "EFECTIVO");
    const cash = cashPays.reduce((a, p) => a + p.amountCents, 0);
    const income = s.sales.flatMap(x => x.payments).reduce((a, p) => a + p.amountCents, 0);
    const shiftExp = s.localExpenses.filter(e => e.paymentSource === "SHIFT_CASH").reduce((a, e) => a + e.amountCents, 0);
    const allExp = s.localExpenses.reduce((a, e) => a + e.amountCents, 0);
    const liveExpected = cash - shiftExp;
    const tag = `${s.businessDate.toISOString().slice(0,10)} ${s.shift.padEnd(7)} ${s.employee.displayName.padEnd(20)}`;
    const e = s.envelope;
    if (e) {
      const issues: string[] = [];
      if (e.expectedAmountCents !== liveExpected) { n.envMismatch++; sumEnvDiff += e.expectedAmountCents - liveExpected; issues.push(`sobre esperado ${$(e.expectedAmountCents)} vs real ${$(liveExpected)} (efvo ${$(cash)} - gastos turno ${$(shiftExp)})`); }
      const lateExp = s.localExpenses.filter(x => x.paymentSource === "SHIFT_CASH" && x.createdAt > e.createdAt);
      if (lateExp.length) { n.envAfterExp++; issues.push(`${lateExp.length} egreso(s) turno cargados DESPUÉS del sobre: ${$(lateExp.reduce((a,x)=>a+x.amountCents,0))}`); }
      const lateCash = cashPays.filter(p => p.createdAt > e.createdAt);
      if (lateCash.length) { n.envAfterSale++; issues.push(`${lateCash.length} cobro(s) efectivo DESPUÉS del sobre: ${$(lateCash.reduce((a,x)=>a+x.amountCents,0))}`); }
      if (issues.length) rows.push(`${tag} [${e.envelopeCode} ${e.status}] ` + issues.join(" | "));
    } else if (s.status === "CLOSED" && liveExpected > 0) { n.closedNoEnv++; rows.push(`${tag} CERRADO SIN SOBRE con efectivo esperado ${$(liveExpected)}`); }
    if (s.status === "CLOSED" && (s.totalCashCents !== cash || s.totalIncomeCents !== income || s.totalExpensesCents !== allExp)) {
      n.snapMismatch++; rows.push(`${tag} SNAPSHOT consolidado desactualizado: efvo ${$(s.totalCashCents)}→${$(cash)} ingresos ${$(s.totalIncomeCents)}→${$(income)} egresos ${$(s.totalExpensesCents)}→${$(allExp)}`);
    }
    if (s.status === "OPEN" && Date.now() - s.openedAt.getTime() > 2 * 86400e3) { n.openOld++; rows.push(`${tag} TURNO ABIERTO hace >2 días`); }
  }
  console.log(`Sesiones: ${sessions.length}`); console.log(JSON.stringify(n), "suma dif sobres:", $(sumEnvDiff));
  rows.forEach(r => console.log(r));

  // Envelopes opened: movement IN amount vs actual
  const envs = await prisma.envelope.findMany({ where: { status: { not: "CLOSED" } }, include: { localCashMovements: true } as any });
  let envMov = 0;
  for (const e of envs as any[]) {
    const ins = (e.localCashMovements ?? []).filter((m: any) => m.sourceType === "ENVELOPE_OPENING");
    const amt = ins.reduce((a: number, m: any) => a + m.amountCents, 0);
    if (ins.length !== 1 || (e.actualAmountCents != null && amt !== e.actualAmountCents)) { envMov++; console.log("SOBRE/MOV", e.envelopeCode, e.status, "movs", ins.length, $(amt), "actual", e.actualAmountCents == null ? "-" : $(e.actualAmountCents)); }
  }
  console.log("sobres abiertos con movimiento inconsistente:", envMov);
  // LOCAL_CASH expenses without movement
  const lc = await prisma.localExpense.findMany({ where: { paymentSource: "LOCAL_CASH" }, include: { localCashMovements: true } });
  console.log("egresos LOCAL_CASH sin movimiento de caja:", lc.filter(x => x.localCashMovements.length !== 1).length, "/", lc.length);
  // Cash sales without session
  const orphan = await prisma.posPayment.aggregate({ where: { method: "EFECTIVO", sale: { cashSessionId: null, status: { not: "CANCELLED" } } }, _sum: { amountCents: true }, _count: true });
  console.log("cobros efectivo sin turno:", orphan._count, $(orphan._sum.amountCents ?? 0));
  // Manual adjustments summary
  const man = await prisma.localCashMovement.groupBy({ by: ["localCashBoxId", "type", "sourceType"], _sum: { amountCents: true }, _count: true });
  const boxes = await prisma.localCashBox.findMany({ select: { id: true, name: true, kind: true } });
  for (const g of man.sort((a,b)=>a.localCashBoxId.localeCompare(b.localCashBoxId))) console.log("MOV", boxes.find(b=>b.id===g.localCashBoxId)?.name, g.type, g.sourceType, g._count, $(g._sum.amountCents ?? 0));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
