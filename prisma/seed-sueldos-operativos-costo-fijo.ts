import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const existing = await prisma.costoFijo.findFirst({ where: { linkedToHoras: true } });
  if (existing) {
    console.log("Ya existe un costo fijo linkedToHoras:", existing.id, existing.nombre);
    return;
  }

  const item = await prisma.costoFijo.create({
    data: {
      nombre: "Sueldos Operativos",
      categoria: "SALARIOS",
      amountCents: 0, // sin uso: el monto real se calcula en vivo desde Horas (linkedToHoras)
      isRecurring: true,
      linkedToHoras: true,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      notas: "Monto mensual calculado en vivo desde el módulo de Horas (suma de lo que se debe a empleados ASOCIADO/CAJA_LOCAL/ADMINISTRATIVO). No editar el monto acá.",
    },
  });
  console.log("Creado:", item.id, item.nombre);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
