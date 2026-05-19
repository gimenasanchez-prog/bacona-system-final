const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const latestPurchase = await prisma.purchase.findFirst({
      orderBy: { purchasedAt: "desc" },
      include: {
        location: true,
        lines: {
          include: { inventoryItem: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          latestPurchase: latestPurchase
            ? {
                id: latestPurchase.id,
                type: latestPurchase.type,
                status: latestPurchase.status,
                purchasedAt: latestPurchase.purchasedAt,
                location: {
                  id: latestPurchase.location.id,
                  code: latestPurchase.location.code,
                  label: latestPurchase.location.label,
                },
                lines: latestPurchase.lines.map((l) => ({
                  inventoryItemId: l.inventoryItemId,
                  item: l.inventoryItem.name,
                  unit: l.inventoryItem.unit,
                  qty: l.qty.toString(),
                })),
              }
            : null,
        },
        null,
        2
      )
    );

    const purchaseMovement = latestPurchase
      ? await prisma.stockMovement.findFirst({
          where: { purchaseId: latestPurchase.id },
          include: {
            lines: {
              include: { inventoryItem: true, location: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        })
      : null;

    console.log(
      JSON.stringify(
        {
          purchaseMovement: purchaseMovement
            ? {
                id: purchaseMovement.id,
                type: purchaseMovement.type,
                occurredAt: purchaseMovement.occurredAt,
                lines: purchaseMovement.lines.map((l) => ({
                  dir: l.direction,
                  qty: l.qty.toString(),
                  item: l.inventoryItem.name,
                  loc: l.location.code,
                })),
              }
            : null,
        },
        null,
        2
      )
    );

    const bacona = await prisma.stockLocation.findUnique({ where: { code: "BACONA" } });
    console.log(JSON.stringify({ bacona }, null, 2));

    if (latestPurchase && bacona && latestPurchase.lines[0]) {
      const itemId = latestPurchase.lines[0].inventoryItemId;
      const current = await prisma.stockMovementLine.aggregate({
        where: { locationId: bacona.id, inventoryItemId: itemId },
        _sum: { qty: true },
      });
      console.log(JSON.stringify({ sumInBaconaForFirstPurchaseItem: current._sum.qty?.toString() ?? "0" }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

