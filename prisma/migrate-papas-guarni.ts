/**
 * Script de migración puntual — mayo 2026
 * Aplica cambios al catálogo POS sin borrar datos existentes:
 *   1. Agrega Papas fritas chicas y grandes a Snacks y Kiosco + vincula grupo Toppings
 *   2. Renombra "Burguer BCÑ" → "Burguer BCÑ con papas rústicas" en planes corporativos
 *   3. Crea grupo "Guarnición (Almuerzo)" y lo vincula a Corpo Almuerzo y Appetite
 *   4. Agrega opción "Ensalada" al grupo "Guarnición" existente
 *
 * Ejecutar: npx tsx prisma/migrate-papas-guarni.ts
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
  // ── 1. Papas fritas: agregar productos a Snacks y Kiosco ──────────────────
  console.log("1. Agregando Papas fritas a Snacks y Kiosco...");
  const snacksCategory = await prisma.category.findFirst({
    where: { name: "Snacks y Kiosco" },
  });
  if (!snacksCategory) throw new Error("Categoría 'Snacks y Kiosco' no encontrada");

  let papasChicasExist = await prisma.product.findFirst({ where: { name: "Papas fritas chicas" } });
  if (!papasChicasExist) {
    papasChicasExist = await prisma.product.create({
      data: { categoryId: snacksCategory.id, name: "Papas fritas chicas", priceCents: 290000, isActive: true },
    });
    console.log(`   Creado: Papas fritas chicas`);
  } else {
    console.log(`   Ya existe: Papas fritas chicas`);
  }

  let papasGrandesExist = await prisma.product.findFirst({ where: { name: "Papas fritas grandes" } });
  if (!papasGrandesExist) {
    papasGrandesExist = await prisma.product.create({
      data: { categoryId: snacksCategory.id, name: "Papas fritas grandes", priceCents: 340000, isActive: true },
    });
    console.log(`   Creado: Papas fritas grandes`);
  } else {
    console.log(`   Ya existe: Papas fritas grandes`);
  }

  // Vincular grupo Toppings a los dos productos nuevos
  const toppingsGroup = await prisma.modifierGroup.findFirst({ where: { name: "Toppings" } });
  if (!toppingsGroup) {
    console.warn("   ⚠️  Grupo 'Toppings' no encontrado, se omite vinculación");
  } else {
    for (const product of [papasChicasExist!, papasGrandesExist!]) {
      const exists = await prisma.productModifierGroup.findFirst({
        where: { productId: product.id, groupId: toppingsGroup.id },
      });
      if (!exists) {
        await prisma.productModifierGroup.create({
          data: { productId: product.id, groupId: toppingsGroup.id, sortOrder: 0 },
        });
        console.log(`   Vinculado Toppings → ${product.name}`);
      } else {
        console.log(`   Ya vinculado: Toppings → ${product.name}`);
      }
    }
  }

  // ── 2. Renombrar "Burguer BCÑ" en grupos corporativos ────────────────────
  console.log("2. Renombrando 'Burguer BCÑ' en planes corporativos...");
  for (const groupName of ["Plato - Almuerzo C1", "Plato - Appetite C2"]) {
    const group = await prisma.modifierGroup.findFirst({ where: { name: groupName } });
    if (!group) { console.warn(`   ⚠️  Grupo '${groupName}' no encontrado`); continue; }

    const option = await prisma.modifierOption.findFirst({
      where: { groupId: group.id, name: "Burguer BCÑ" },
    });
    if (!option) {
      console.log(`   Ya renombrado o no existe en '${groupName}'`);
      continue;
    }
    await prisma.modifierOption.update({
      where: { id: option.id },
      data: { name: "Burguer BCÑ con papas rústicas" },
    });
    console.log(`   Renombrado en '${groupName}'`);
  }

  // ── 3. Crear grupo "Guarnición (Almuerzo)" y vincular a productos corpo ──
  console.log("3. Creando grupo 'Guarnición (Almuerzo)'...");
  let guarniAlmuerzo = await prisma.modifierGroup.findFirst({
    where: { name: "Guarnición (Almuerzo)" },
  });
  if (!guarniAlmuerzo) {
    guarniAlmuerzo = await prisma.modifierGroup.create({
      data: {
        name: "Guarnición (Almuerzo)",
        minSelect: 0,
        maxSelect: 1,
        isActive: true,
        options: {
          create: [
            { name: "Papas rústicas",  priceDeltaCents: 0, isActive: true },
            { name: "Puré de zapallo", priceDeltaCents: 0, isActive: true },
            { name: "Arroz",           priceDeltaCents: 0, isActive: true },
            { name: "Ensalada",        priceDeltaCents: 0, isActive: true },
          ],
        },
      },
    });
    console.log(`   Creado: ${guarniAlmuerzo.id}`);
  } else {
    console.log("   Ya existe, se omite creación");
  }

  for (const productName of ["Corpo 1 - Almuerzo c/ bebida", "Corpo 2 - Appetite c/ bebida y postre"]) {
    const product = await prisma.product.findFirst({ where: { name: productName } });
    if (!product) { console.warn(`   ⚠️  Producto '${productName}' no encontrado`); continue; }

    const exists = await prisma.productModifierGroup.findFirst({
      where: { productId: product.id, groupId: guarniAlmuerzo.id },
    });
    if (!exists) {
      await prisma.productModifierGroup.create({
        data: { productId: product.id, groupId: guarniAlmuerzo.id, sortOrder: 10 },
      });
      console.log(`   Vinculado → '${productName}'`);
    } else {
      console.log(`   Ya vinculado → '${productName}'`);
    }
  }

  // ── 4. Agregar "Ensalada" al grupo "Guarnición" existente ─────────────────
  console.log("4. Agregando 'Ensalada' al grupo 'Guarnición'...");
  const guarniGroup = await prisma.modifierGroup.findFirst({ where: { name: "Guarnición" } });
  if (!guarniGroup) {
    console.warn("   ⚠️  Grupo 'Guarnición' no encontrado");
  } else {
    const ensaladaExists = await prisma.modifierOption.findFirst({
      where: { groupId: guarniGroup.id, name: "Ensalada" },
    });
    if (!ensaladaExists) {
      await prisma.modifierOption.create({
        data: { groupId: guarniGroup.id, name: "Ensalada", priceDeltaCents: 0, isActive: true },
      });
      console.log("   Opción 'Ensalada' agregada");
    } else {
      console.log("   'Ensalada' ya existe en el grupo");
    }
  }

  console.log("\n✅ Migración completada");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
