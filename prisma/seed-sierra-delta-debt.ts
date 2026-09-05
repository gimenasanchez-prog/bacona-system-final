import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const roi = await prisma.sierraDeltaDebt.create({
    data: {
      concepto: "Retorno de inversión",
      currency: "USD",
      totalAmountCents: 22000 * 100,
    },
  });
  console.log("Creada deuda:", roi.concepto, roi.id);

  const sueldos = await prisma.sierraDeltaDebt.create({
    data: {
      concepto: "Sueldos gerenciales adeudados",
      currency: "ARS",
      totalAmountCents: 6_000_000 * 100,
      notas: "Arrastre de deuda de sueldos gerenciales (Gimena y Pio, socios fundadores de Grupo SierraDelta SRL).",
    },
  });
  console.log("Creada deuda:", sueldos.concepto, sueldos.id);

  const lines = [
    { periodLabel: "Octubre", paymentMonthLabel: "Noviembre", amountPerPartnerCents: 500_000 * 100 },
    { periodLabel: "Noviembre", paymentMonthLabel: "Diciembre", amountPerPartnerCents: 1_000_000 * 100 },
    { periodLabel: "Diciembre", paymentMonthLabel: "Enero", amountPerPartnerCents: 500_000 * 100 },
    { periodLabel: "Enero", paymentMonthLabel: "Febrero", amountPerPartnerCents: 1_000_000 * 100 },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = await prisma.sierraDeltaDebtBreakdownLine.create({
      data: {
        debtId: sueldos.id,
        periodLabel: lines[i].periodLabel,
        paymentMonthLabel: lines[i].paymentMonthLabel,
        amountPerPartnerCents: lines[i].amountPerPartnerCents,
        partnersCount: 2,
        sortOrder: i,
      },
    });
    console.log("  Línea:", line.periodLabel, "->", line.paymentMonthLabel);
  }

  const totalCheck = lines.reduce((sum, l) => sum + l.amountPerPartnerCents * 2, 0);
  console.log("Total desglosado:", totalCheck / 100, "vs total deuda:", sueldos.totalAmountCents / 100);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
