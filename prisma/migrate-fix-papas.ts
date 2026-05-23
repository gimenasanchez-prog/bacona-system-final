/**
 * Script de migración puntual — mayo 2026
 * Corrige ubicación y modificadores de Papas fritas:
 *   1. Mueve "Papas fritas chicas" y "Papas fritas grandes" de Al Plato → Snacks y Kiosco
 *   2. Desvincula el grupo "Toppings" de las papas fritas
 *   3. Crea "Papas Rústicas" en Al Plato ($2.500) y la vincula a Toppings
 *
 * Ejecutar: npx tsx prisma/migrate-fix-papas.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const snacks = await prisma.category.findFirst({ where: { name: "Snacks y Kiosco" } });
  if (!snacks) throw new Error("Categoría 'Snacks y Kiosco' no encontrada");

  const alPlato = await prisma.category.findFirst({ where: { name: { contains: "plato", mode: "insensitive" } } });
  if (!alPlato) throw new Error("Categoría 'Al plato' no encontrada");

  const toppings = await prisma.modifierGroup.findFirst({ where: { name: "Toppings" } });
  if (!toppings) throw new Error("Grupo 'Toppings' no encontrado");

  // ── 1. Mover Papas fritas a Snacks y desvincular Toppings ─────────────────
  console.log("1. Moviendo Papas fritas a Snacks y Kiosco...");
  for (const nombre of ["Papas fritas chicas", "Papas fritas grandes"]) {
    const prod = await prisma.product.findFirst({ where: { name: nombre } });
    if (!prod) { console.warn(`   ⚠️  '${nombre}' no encontrado`); continue; }

    await prisma.product.update({
      where: { id: prod.id },
      data: { categoryId: snacks.id },
    });
    console.log(`   Movido: ${nombre} → Snacks y Kiosco`);

    const link = await prisma.productModifierGroup.findFirst({
      where: { productId: prod.id, groupId: toppings.id },
    });
    if (link) {
      await prisma.productModifierGroup.delete({ where: { productId_groupId: { productId: prod.id, groupId: toppings.id } } });
      console.log(`   Desvinculado Toppings de ${nombre}`);
    }
  }

  // ── 2. Crear "Papas Rústicas" en Al Plato y vincular Toppings ─────────────
  console.log("2. Creando Papas Rústicas en Al Plato...");
  let papasRusticas = await prisma.product.findFirst({ where: { name: "Papas Rústicas" } });
  if (!papasRusticas) {
    papasRusticas = await prisma.product.create({
      data: { categoryId: alPlato.id, name: "Papas Rústicas", priceCents: 250000, isActive: true },
    });
    console.log(`   Creado: Papas Rústicas ($2.500) en Al Plato`);
  } else {
    console.log(`   Ya existe: Papas Rústicas`);
  }

  const toppingLink = await prisma.productModifierGroup.findFirst({
    where: { productId: papasRusticas.id, groupId: toppings.id },
  });
  if (!toppingLink) {
    await prisma.productModifierGroup.create({
      data: { productId: papasRusticas.id, groupId: toppings.id, sortOrder: 0 },
    });
    console.log(`   Vinculado Toppings → Papas Rústicas`);
  } else {
    console.log(`   Toppings ya vinculado a Papas Rústicas`);
  }

  console.log("\n✅ Migración completada");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
