import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ============================================================
// DATOS REALES DE BCN
// ============================================================

const EMPLEADOS: Array<{ displayName: string; role: "ASOCIADO" | "CAJA_LOCAL" | "GERENCIA" }> = [
  { displayName: "Gimena",           role: "GERENCIA" },
  { displayName: "Pio",              role: "GERENCIA" },
  { displayName: "Yanet Condori",    role: "CAJA_LOCAL" },
  { displayName: "Noelia Calpanchay", role: "ASOCIADO" },
  { displayName: "Magali Cordoba",   role: "ASOCIADO" },
  { displayName: "Cintia Soriano",   role: "ASOCIADO" },
  { displayName: "Alfredo Maidana",  role: "ASOCIADO" },
];

const MESAS: string[] = [
  // Salón
  "Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5",
  "Mesón 1", "Mesón 2",
  "Pufs",
  // Mostrador
  "Mostrador",
];

const PROVEEDORES: string[] = [
  "D'Taqui", "Arumi", "Citric", "Chango Mas", "La Rotonda",
  "Punto Vegano", "Universo Cafe", "Feria SM", "Caliva", "Master Clean",
  "Milenium", "El Palacio de las Golosinas", "CDz", "Carnicería KOKI",
  "Estrella de la Puna", "YPF", "Koreanos", "MELI", "Papel Market",
  "Pedrazzoli", "Easy", "GayGas", "Huevería", "Panificarte", "SAC",
  "Kimchy", "Bica", "Mercado", "Aboudi", "Desagote", "Umpapel",
  "Las Flores", "Isabel Humitas", "Todo Envases", "La Caserita",
  "M&A", "Distribuidora 11/09", "KIM MIN", "Tentados", "Remis Denis",
  "Casa Diaz", "Otro",
];

// ============================================================
// MODIFIER GROUPS
// Guarniciones y agregados son SOLO modificadores — no aparecen
// como productos en el catálogo.
// ============================================================

const MODIFIER_GROUPS: Array<{
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Array<{ name: string; priceDeltaCents: number }>;
  appliedTo: string[];
}> = [
  {
    name: "Guarnición",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Papas rústicas",   priceDeltaCents: 0 },
      { name: "Puré de zapallo",  priceDeltaCents: 0 },
      { name: "Arroz",            priceDeltaCents: 0 },
    ],
    appliedTo: [
      "Pollo a la crema c/ guarnicion",
      "Bondiola a la cerveza c/ guarnicion",
      "Milanesa al plato c/ guarnicion",
      "Wok de ternera",
    ],
  },
  {
    name: "Agregados",
    minSelect: 0, maxSelect: 3,
    options: [
      { name: "Papas rústicas",    priceDeltaCents: 220000 },
      { name: "Bacon y cheddar",   priceDeltaCents: 250000 },
      { name: "Sopa c/ focaccia",  priceDeltaCents: 210000 },
    ],
    appliedTo: [
      "Sandwich de miga jamón y queso",
      "Sandwich de miga huevo, jamon y queso",
      "Sandwiche Desmechado",
      "Sandwiche de Milanesa",
      "Sandwiche Burguer BCÑ",
      "Sandwiche Paty Veggie",
    ],
  },
  {
    name: "Salsa",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Teriyaki",  priceDeltaCents: 250000 },
      { name: "De soja",   priceDeltaCents: 200000 },
    ],
    appliedTo: ["Wok de ternera", "Huevos BCÑ", "Wraps de Pollo"],
  },
  {
    name: "Sopa",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Sopa c/ focaccia", priceDeltaCents: 210000 },
    ],
    appliedTo: [
      "Pollo a la crema c/ guarnicion",
      "Bondiola a la cerveza c/ guarnicion",
      "Milanesa al plato c/ guarnicion",
      "Guiso de lentejas",
    ],
  },
  // ── Modificadores para planes Corporativos ──
  {
    name: "Bebida",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Infusión M 180ml",     priceDeltaCents: 0 },
      { name: "Gaseosa 375ml",        priceDeltaCents: 0 },
      { name: "Agua con o sin gas",   priceDeltaCents: 0 },
    ],
    appliedTo: [
      "Corpo 1 - Snack c/ bebida",
      "Corpo 1 - Brunch c/ bebida",
      "Corpo 1 - Almuerzo c/ bebida",
      "Corpo 2 - Snack c/ bebida",
      "Corpo 2 - Brunch c/ bebida y postre",
      "Corpo 2 - Light c/ bebida y postre",
      "Corpo 2 - Appetite c/ bebida y postre",
      "Corpo 3 - Almuerzo c/ bebida",
    ],
  },
  {
    name: "Postre",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Tentación Bacoña", priceDeltaCents: 0 },
      { name: "Yogurtina",        priceDeltaCents: 0 },
      { name: "Frutos secos",     priceDeltaCents: 0 },
    ],
    appliedTo: [
      "Corpo 2 - Brunch c/ bebida y postre",
      "Corpo 2 - Light c/ bebida y postre",
      "Corpo 2 - Appetite c/ bebida y postre",
    ],
  },
  {
    name: "Plato - Snack",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Chip de Jamón y Queso x2",                    priceDeltaCents: 0 },
      { name: "Medialuna",                                    priceDeltaCents: 0 },
      { name: "Churro",                                       priceDeltaCents: 0 },
      { name: "Bollo casero c/ queso crema y mermelada",     priceDeltaCents: 0 },
      { name: "Miguelitos c/ dulce de leche x2",             priceDeltaCents: 0 },
      { name: "Alfajor de algarroba BCÑ",                    priceDeltaCents: 0 },
      { name: "Sandwich de miga jamón y queso",              priceDeltaCents: 0 },
      { name: "Sandwich de miga huevo, jamón y queso",       priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Snack c/ bebida", "Corpo 2 - Snack c/ bebida"],
  },
  {
    name: "Plato - Brunch C1",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Patitas de pollo x4un con papas rústicas",  priceDeltaCents: 0 },
      { name: "Megacito",                                   priceDeltaCents: 0 },
      { name: "Huevos BCÑ",                                 priceDeltaCents: 0 },
      { name: "Huevos duros x2",                            priceDeltaCents: 0 },
      { name: "Sopa c/ focaccia",                           priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Brunch c/ bebida"],
  },
  {
    name: "Plato - Brunch C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Patitas de pollo x6un con papas rústicas",  priceDeltaCents: 0 },
      { name: "Pizza Individual (4 porciones)",             priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Brunch c/ bebida y postre"],
  },
  {
    name: "Plato - Almuerzo C1",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Wrap de pollo",                           priceDeltaCents: 0 },
      { name: "Megacito",                                priceDeltaCents: 0 },
      { name: "Milanesa",                                priceDeltaCents: 0 },
      { name: "Paty Veggie",                             priceDeltaCents: 0 },
      { name: "Burger BCN",                              priceDeltaCents: 0 },
      { name: "Mix empanadas x8",                        priceDeltaCents: 0 },
      { name: "Guiso de lentejas",                       priceDeltaCents: 0 },
      { name: "Bondiola a la cerveza c/ guarnición",     priceDeltaCents: 0 },
      { name: "Pollo a la crema c/ guarnición",          priceDeltaCents: 0 },
      { name: "Milanesa c/ guarnición",                  priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Almuerzo c/ bebida"],
  },
  {
    name: "Plato - Light C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Huevos BCÑ",                   priceDeltaCents: 0 },
      { name: "Huevos duros x2 con salsa",    priceDeltaCents: 0 },
      { name: "Wraps de pollo",               priceDeltaCents: 0 },
      { name: "Sopa c/ focaccia",             priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Light c/ bebida y postre"],
  },
  {
    name: "Plato - Appetite C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Sandwich Desmechado",                     priceDeltaCents: 0 },
      { name: "Sandwich de Milanesa",                    priceDeltaCents: 0 },
      { name: "Burguer BCÑ",                             priceDeltaCents: 0 },
      { name: "Mix empanadas x8",                        priceDeltaCents: 0 },
      { name: "Guiso de lentejas",                       priceDeltaCents: 0 },
      { name: "Pollo a la crema c/ guarnición",          priceDeltaCents: 0 },
      { name: "Bondiola a la cerveza c/ guarnición",     priceDeltaCents: 0 },
      { name: "Milanesa c/ guarnición",                  priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Appetite c/ bebida y postre"],
  },
  {
    name: "Plato - Almuerzo C3",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Mix empanadas x8",   priceDeltaCents: 0 },
      { name: "Burger BCN",         priceDeltaCents: 0 },
      { name: "Pollo a la crema",   priceDeltaCents: 0 },
      { name: "Wrap de pollo",      priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 3 - Almuerzo c/ bebida"],
  },
];

// ============================================================
// CATÁLOGO POS — 9 categorías, 79 productos
// ============================================================

const CATALOGO: Array<{
  categoria: string;
  sortOrder: number;
  productos: Array<{ name: string; priceCents: number }>;
}> = [
  {
    categoria: "Cafetería",
    sortOrder: 1,
    productos: [
      { name: "Cafe con o sin leche de 80ml",  priceCents: 370000 },
      { name: "Cafe con o sin leche de 180ml", priceCents: 480000 },
      { name: "Cafe con o sin leche de 350ml", priceCents: 580000 },
      { name: "Te",                             priceCents: 250000 },
      { name: "Mate cocido",                    priceCents: 250000 },
      { name: "Chocolatada",                    priceCents: 400000 },
      { name: "Submarino",                      priceCents: 500000 },
    ],
  },
  {
    categoria: "Bebidas",
    sortOrder: 2,
    productos: [
      { name: "Agua con gas",                  priceCents: 240000 },
      { name: "Agua sin gas",                  priceCents: 240000 },
      { name: "Agua caliente",                 priceCents: 150000 },
      { name: "Gaseosa de 375ml",              priceCents: 220000 },
      { name: "Gaseosa de 500ml",              priceCents: 280000 },
      { name: "Limonada de 1L",                priceCents: 450000 },
      { name: "Jugo citric de 500ml",          priceCents: 350000 },
      { name: "Jugo citric de 1L",             priceCents: 520000 },
      { name: "Licuado de 600ml",              priceCents: 680000 },
      { name: "Licuado de 1L",                 priceCents: 780000 },
      { name: "Energizante Monster o Speed",   priceCents: 480000 },
      { name: "Cerveza rubia",                 priceCents: 520000 },
      { name: "Cerveza negra",                 priceCents: 520000 },
    ],
  },
  {
    categoria: "Panificados",
    sortOrder: 3,
    productos: [
      { name: "Chip de Jamon y Queso x2",                priceCents: 250000 },
      { name: "Medialuna x1",                             priceCents: 180000 },
      { name: "Churro x1",                                priceCents: 220000 },
      { name: "Bollo casero c/ queso crema y mermelada", priceCents: 150000 },
      { name: "Miguelitos c/ dulce de leche x2",         priceCents: 250000 },
      { name: "Alfajor de algarroba BCÑ",                priceCents: 280000 },
    ],
  },
  {
    categoria: "Empanadas",
    sortOrder: 4,
    productos: [
      { name: "Empanada de carne x unidad",   priceCents: 150000 },
      { name: "Empanada de queso x unidad",   priceCents: 150000 },
      { name: "Empanada de caprese x unidad", priceCents: 120000 },
      { name: "Empanada de quinoa x unidad",  priceCents: 120000 },
      { name: "Empanada de choclo x unidad",  priceCents: 120000 },
    ],
  },
  {
    categoria: "Sandwiches",
    sortOrder: 5,
    productos: [
      { name: "Sandwich de miga jamón y queso",        priceCents: 450000  },
      { name: "Sandwich de miga huevo, jamon y queso", priceCents: 470000  },
      { name: "Sandwiche Desmechado",                  priceCents: 1580000 },
      { name: "Sandwiche de Milanesa",                 priceCents: 1420000 },
      { name: "Sandwiche Burguer BCÑ",                 priceCents: 1310000 },
      { name: "Sandwiche Paty Veggie",                 priceCents: 1420000 },
    ],
  },
  {
    categoria: "Al plato",
    sortOrder: 6,
    productos: [
      { name: "Megacito",                                  priceCents: 750000  },
      { name: "Patitas de Pollo x6un con papas rusticas",  priceCents: 780000  },
      { name: "Pizza Individual (4 porciones)",            priceCents: 820000  },
      { name: "Huevos BCÑ",                                priceCents: 620000  },
      { name: "Huevos duros x2",                           priceCents: 320000  },
      { name: "Wraps de Pollo",                            priceCents: 880000  },
      { name: "Sopa c/ focaccia",                          priceCents: 620000  },
      { name: "Mix empanadas x8",                          priceCents: 950000  },
      { name: "Guiso de lentejas",                         priceCents: 1490000 },
      { name: "Ramen",                                     priceCents: 700000  },
      { name: "Papas fritas grandes",                      priceCents: 340000  },
      { name: "Papas fritas chicas",                       priceCents: 290000  },
      { name: "Pollo a la crema c/ guarnicion",            priceCents: 1350000 },
      { name: "Bondiola a la cerveza c/ guarnicion",       priceCents: 1420000 },
      { name: "Milanesa al plato c/ guarnicion",           priceCents: 1420000 },
      { name: "Wok de ternera",                            priceCents: 1420000 },
    ],
  },
  {
    categoria: "Postres",
    sortOrder: 7,
    productos: [
      { name: "Postre Tentacion Bacoña", priceCents: 250000 },
      { name: "Postre Yogurtina",        priceCents: 150000 },
      { name: "Postre frutos secos",     priceCents: 150000 },
    ],
  },
  {
    categoria: "Snacks y Kiosco",
    sortOrder: 8,
    productos: [
      { name: "Galletas Chocolinas de 170gr", priceCents: 280000 },
      { name: "Galletas Chocolinas de 250gr", priceCents: 340000 },
      { name: "Galletas Oreos de 118gr",      priceCents: 280000 },
      { name: "Galletas Pepitos de 118gr",    priceCents: 280000 },
      { name: "Galletas coquitas de 117gr",   priceCents: 280000 },
      { name: "Galletas Mini oreos",          priceCents: 180000 },
      { name: "Galletas Mini pepitos",        priceCents: 180000 },
      { name: "Galletas Hogareñas saladas",   priceCents: 280000 },
      { name: "Galletas Don Santur saladas",  priceCents: 190000 },
      { name: "Alfajor rasta",                priceCents: 290000 },
      { name: "Caramelos Halls",              priceCents: 170000 },
      { name: "Gomitas Mogul",                priceCents: 140000 },
      { name: "Chicles Topline",              priceCents: 170000 },
      { name: "Cigarrillos",                  priceCents: 280000 },
      { name: "Encendedor",                   priceCents: 170000 },
    ],
  },
  {
    categoria: "Corporativo",
    sortOrder: 9,
    productos: [
      { name: "Corpo 1 - Snack c/ bebida",             priceCents: 630000  },
      { name: "Corpo 1 - Brunch c/ bebida",            priceCents: 780000  },
      { name: "Corpo 1 - Almuerzo c/ bebida",          priceCents: 1350000 },
      { name: "Corpo 2 - Snack c/ bebida",             priceCents: 690000  },
      { name: "Corpo 2 - Brunch c/ bebida y postre",   priceCents: 820000  },
      { name: "Corpo 2 - Light c/ bebida y postre",    priceCents: 1200000 },
      { name: "Corpo 2 - Appetite c/ bebida y postre", priceCents: 1550000 },
      { name: "Corpo 3 - Almuerzo c/ bebida",          priceCents: 1100000 },
    ],
  },
];

// ============================================================
// CLIENTES CON CUENTA CORRIENTE
// saldoInicialCents = deuda pendiente actual (facturas sin cobrar)
// ============================================================

const CLIENTES_CC: Array<{ displayName: string; saldoInicialCents: number; planCode: string }> = [
  { displayName: "Runa",             saldoInicialCents: 0,            planCode: "FULL" },
  { displayName: "Ecco SAU",         saldoInicialCents: 143_180_000,  planCode: "FULL" },
  { displayName: "MVA",              saldoInicialCents: 37_840_000,   planCode: "FULL" },
  { displayName: "DINATEC",          saldoInicialCents: 21_540_000,   planCode: "FULL_SNACKS_CAPPED" },
  { displayName: "CyS",              saldoInicialCents: 92_970_000,   planCode: "FULL_SNACKS_CAPPED" },
  { displayName: "Tmo del Norte",    saldoInicialCents: 41_930_000,   planCode: "FULL" },
  { displayName: "Posco Enc",        saldoInicialCents: 0,            planCode: "FULL" },
  { displayName: "Posco SAU",        saldoInicialCents: 163_720_000,  planCode: "CORPO2_SNACKS" },
  { displayName: "Socompa",          saldoInicialCents: 23_590_000,   planCode: "CORPO2_SNACKS" },
  { displayName: "Fundación Condor", saldoInicialCents: 0,            planCode: "CORPO2_SNACKS" },
  { displayName: "PECOM",            saldoInicialCents: 50_800_000,   planCode: "CORPO2_SNACKS" },
  { displayName: "Minería",          saldoInicialCents: 0,            planCode: "CORPO2_BASIC" },
];

// ============================================================
// FIN DE CONFIGURACIÓN
// ============================================================

async function main() {
  console.log("Limpiando datos existentes...");

  await prisma.localCashMovement.deleteMany();
  await prisma.envelope.deleteMany();
  await prisma.localExpense.deleteMany();
  await prisma.cashSessionPaymentBreakdownDetail.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.localCashBox.deleteMany();

  await prisma.posSaleItemModifier.deleteMany();
  await prisma.posSaleItem.deleteMany();
  await prisma.posPayment.deleteMany();
  await prisma.posSale.deleteMany();
  await prisma.productModifierGroup.deleteMany();
  await prisma.modifierOption.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.posTable.deleteMany();
  await prisma.cuentaCorrienteAccount.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employee.deleteMany();

  console.log("Creando empleados...");
  await prisma.employee.createMany({
    data: EMPLEADOS.map((e) => ({ ...e, isActive: true })),
  });

  console.log("Creando mesas...");
  await prisma.posTable.createMany({
    data: MESAS.map((label) => ({ label, isActive: true })),
  });

  console.log("Creando proveedores...");
  await prisma.supplier.createMany({
    data: PROVEEDORES.map((name) => ({ name, active: true })),
  });

  console.log("Creando catálogo POS...");
  for (const cat of CATALOGO) {
    const category = await prisma.category.create({
      data: { name: cat.categoria, sortOrder: cat.sortOrder, isActive: true },
    });
    await prisma.product.createMany({
      data: cat.productos.map((p) => ({
        categoryId: category.id,
        name: p.name,
        priceCents: p.priceCents,
        isActive: true,
      })),
    });
  }

  console.log("Creando modifier groups...");
  const groupIdByName: Record<string, string> = {};
  for (const mg of MODIFIER_GROUPS) {
    const created = await prisma.modifierGroup.create({
      data: {
        name: mg.name,
        minSelect: mg.minSelect,
        maxSelect: mg.maxSelect,
        isActive: true,
        options: {
          create: mg.options.map((o) => ({
            name: o.name,
            priceDeltaCents: o.priceDeltaCents,
            isActive: true,
          })),
        },
      },
    });
    groupIdByName[mg.name] = created.id;
  }

  console.log("Vinculando modificadores a productos...");
  for (const mg of MODIFIER_GROUPS) {
    const groupId = groupIdByName[mg.name];
    for (const productName of mg.appliedTo) {
      const product = await prisma.product.findFirst({ where: { name: productName } });
      if (product) {
        await prisma.productModifierGroup.create({
          data: { productId: product.id, groupId, sortOrder: 0 },
        });
      } else {
        console.warn(`  ⚠️  Producto no encontrado para modifier: "${productName}"`);
      }
    }
  }

  console.log("Creando Caja BCN...");
  await prisma.localCashBox.create({
    data: { name: "Caja BCN", active: true },
  });

  console.log("Creando clientes con cuenta corriente...");
  for (const cliente of CLIENTES_CC) {
    const customer = await prisma.customer.create({
      data: { displayName: cliente.displayName, isActive: true },
    });
    await prisma.cuentaCorrienteAccount.create({
      data: { customerId: customer.id, isActive: true, planCode: cliente.planCode },
    });
    if (cliente.saldoInicialCents > 0) {
      const account = await prisma.cuentaCorrienteAccount.findFirst({
        where: { customerId: customer.id },
      });
      if (account) {
        const saleInit = await prisma.posSale.create({
          data: {
            saleType: "MOSTRADOR",
            status: "CONFIRMED",
            customerId: customer.id,
            cuentaCorrienteAccountId: account.id,
            subtotalCents: cliente.saldoInicialCents,
            totalCents: cliente.saldoInicialCents,
          },
        });
        await prisma.posPayment.create({
          data: {
            saleId: saleInit.id,
            method: "CUENTA_CORRIENTE",
            amountCents: cliente.saldoInicialCents,
            cuentaCorrienteAccountId: account.id,
          },
        });
      }
    }
  }

  const totalProductos = CATALOGO.reduce((s, c) => s + c.productos.length, 0);
  console.log("\n✅ Seed completado:");
  console.log(`  Empleados:      ${EMPLEADOS.length}`);
  console.log(`  Mesas:          ${MESAS.length}`);
  console.log(`  Proveedores:    ${PROVEEDORES.length}`);
  console.log(`  Productos POS:  ${totalProductos} en ${CATALOGO.length} categorías`);
  console.log(`  Modifier groups: ${MODIFIER_GROUPS.length}`);
  console.log(`  Clientes CC:    ${CLIENTES_CC.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
