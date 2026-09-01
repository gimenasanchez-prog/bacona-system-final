import { prisma } from "../src/lib/prisma";

async function main() {
  const category = await prisma.category.upsert({
    where: { id: "comercial-interno-placeholder-category" },
    update: {},
    create: {
      id: "comercial-interno-placeholder-category",
      name: "Interno (no usar en POS)",
      isActive: false,
      sortOrder: 9999,
    },
  });

  const product = await prisma.product.upsert({
    where: { id: "comercial-venta-placeholder-product" },
    update: {},
    create: {
      id: "comercial-venta-placeholder-product",
      categoryId: category.id,
      name: "Venta Comercial (no usar en POS)",
      priceCents: 0,
      isActive: false,
    },
  });

  console.log("Categoría placeholder:", category.id, category.name);
  console.log("Producto placeholder:", product.id, product.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
