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
  "Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6",
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
      { name: "Ensalada",         priceDeltaCents: 0 },
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
    minSelect: 0, maxSelect: 4,
    options: [
      { name: "Papas rústicas",  priceDeltaCents: 220000 },
      { name: "Bacon y Cheddar", priceDeltaCents: 250000 },
      { name: "Bacon",           priceDeltaCents: 150000 },
      { name: "Cheddar",         priceDeltaCents: 150000 },
    ],
    appliedTo: [
      "Megacito",
      "Sandwiche Desmechado",
      "Sandwiche de Milanesa",
      "Sandwiche Burguer BCÑ",
      "Patinesa",
    ],
  },
  {
    name: "Salsa",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Teriyaki",  priceDeltaCents: 250000 },
      { name: "De soja",   priceDeltaCents: 200000 },
    ],
    appliedTo: ["Wok de ternera", "Huevos BCÑ", "Wraps de Pollo", "Huevos duros x2"],
  },
  {
    name: "Sopa",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Sopa c/ focaccia", priceDeltaCents: 250000 },
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
      "Corpo 2 - Appetite c/ bebida y postre",
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
      "Corpo 2 - Appetite c/ bebida y postre",
    ],
  },
  {
    name: "Plato - Snack C1",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Chip de Jamón y Queso x2",                     priceDeltaCents: 0 },
      { name: "Medialuna x2",                                  priceDeltaCents: 0 },
      { name: "Churro",                                        priceDeltaCents: 0 },
      { name: "Bollo casero x2 con queso crema y mermelada",  priceDeltaCents: 0 },
      { name: "Miguelitos x2",                                 priceDeltaCents: 0 },
      { name: "Sándwich de miga jamón y queso",               priceDeltaCents: 0 },
      { name: "Sándwich de miga huevo, jamón y queso",        priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Snack c/ bebida"],
  },
  {
    name: "Plato - Snack C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Chip de Jamón y Queso x2",                     priceDeltaCents: 0 },
      { name: "Medialuna x2",                                  priceDeltaCents: 0 },
      { name: "Churro",                                        priceDeltaCents: 0 },
      { name: "Bollo casero x2 con queso crema y mermelada",  priceDeltaCents: 0 },
      { name: "Miguelitos x2",                                 priceDeltaCents: 0 },
      { name: "Alfajor de algarroba BCÑ",                     priceDeltaCents: 0 },
      { name: "Sándwich de miga jamón y queso",               priceDeltaCents: 0 },
      { name: "Sándwich de miga huevo, jamón y queso",        priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Snack c/ bebida"],
  },
  {
    name: "Plato - Brunch C1",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Megacito",                                   priceDeltaCents: 0 },
      { name: "Patitas de pollo x4un con papas rústicas",  priceDeltaCents: 0 },
      { name: "Pizza individual",                           priceDeltaCents: 0 },
      { name: "Huevos BCÑ",                                 priceDeltaCents: 0 },
      { name: "Huevos duros x2 con salsa tereyaki",        priceDeltaCents: 0 },
      { name: "Sopa c/ focaccia",                           priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Brunch c/ bebida"],
  },
  {
    name: "Plato - Brunch C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Megacito",                                   priceDeltaCents: 0 },
      { name: "Patitas de pollo x6un con papas rústicas",  priceDeltaCents: 0 },
      { name: "Pizza individual",                           priceDeltaCents: 0 },
      { name: "Huevos BCÑ",                                 priceDeltaCents: 0 },
      { name: "Huevos duros x2 con salsa tereyaki",        priceDeltaCents: 0 },
      { name: "Sopa c/ focaccia",                           priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Brunch c/ bebida y postre"],
  },
  {
    name: "Plato - Almuerzo C1",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Sandwich de Milanesa",                    priceDeltaCents: 0 },
      { name: "Burguer BCÑ con papas rústicas",          priceDeltaCents: 0 },
      { name: "Patinesa",                                priceDeltaCents: 0 },
      { name: "Mix empanadas x8",                        priceDeltaCents: 0 },
      { name: "Guiso de lentejas",                       priceDeltaCents: 0 },
      { name: "Pollo a la crema c/ guarnición",          priceDeltaCents: 0 },
      { name: "Bondiola a la cerveza c/ guarnición",     priceDeltaCents: 0 },
      { name: "Milanesa c/ guarnición",                  priceDeltaCents: 0 },
      { name: "Wok de ternera",                          priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 1 - Almuerzo c/ bebida"],
  },
  {
    name: "Plato - Appetite C2",
    minSelect: 1, maxSelect: 1,
    options: [
      { name: "Sandwich Desmechado",                     priceDeltaCents: 0 },
      { name: "Sandwich de Milanesa",                    priceDeltaCents: 0 },
      { name: "Burguer BCÑ con papas rústicas",          priceDeltaCents: 0 },
      { name: "Patinesa",                                priceDeltaCents: 0 },
      { name: "Mix empanadas x8",                        priceDeltaCents: 0 },
      { name: "Guiso de lentejas",                       priceDeltaCents: 0 },
      { name: "Pollo a la crema c/ guarnición",          priceDeltaCents: 0 },
      { name: "Bondiola a la cerveza c/ guarnición",     priceDeltaCents: 0 },
      { name: "Milanesa c/ guarnición",                  priceDeltaCents: 0 },
      { name: "Wok de ternera",                          priceDeltaCents: 0 },
    ],
    appliedTo: ["Corpo 2 - Appetite c/ bebida y postre"],
  },
  {
    name: "¿Le sumamos Bollo o Medialuna por $1500? o Chips o Miguelitos por $2.500?",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Bollo casero c/ queso crema y mermelada", priceDeltaCents: 150000 },
      { name: "Medialuna",                               priceDeltaCents: 150000 },
      { name: "Chips de jamón y queso x2",              priceDeltaCents: 250000 },
      { name: "Miguelitos de dulce de leche x2",        priceDeltaCents: 250000 },
    ],
    appliedTo: [
      "Cafe con o sin leche de 80ml",
      "Cafe con o sin leche de 180ml",
      "Cafe con o sin leche de 350ml",
      "Te",
      "Mate cocido",
      "Chocolatada",
      "Submarino",
    ],
  },
  {
    name: "Toppings",
    minSelect: 0, maxSelect: 3,
    options: [
      { name: "Bacon y Cheddar", priceDeltaCents: 250000 },
      { name: "Bacon",           priceDeltaCents: 150000 },
      { name: "Cheddar",         priceDeltaCents: 150000 },
    ],
    appliedTo: ["Papas Rústicas"],
  },
  {
    name: "Extras",
    minSelect: 0, maxSelect: 3,
    options: [
      { name: "Yasgua",         priceDeltaCents: 100000 },
      { name: "Salsa de Soja",  priceDeltaCents: 0 },
      { name: "Teriyaki",       priceDeltaCents: 0 },
    ],
    appliedTo: ["Patitas de Pollo x6un con papas rusticas"],
  },
  {
    name: "Guarnición (Almuerzo)",
    minSelect: 0, maxSelect: 1,
    options: [
      { name: "Papas rústicas",  priceDeltaCents: 0 },
      { name: "Puré de zapallo", priceDeltaCents: 0 },
      { name: "Arroz",           priceDeltaCents: 0 },
      { name: "Ensalada",        priceDeltaCents: 0 },
    ],
    appliedTo: [
      "Corpo 1 - Almuerzo c/ bebida",
      "Corpo 2 - Appetite c/ bebida y postre",
    ],
  },
];

// ============================================================
// CATÁLOGO POS — 9 categorías, 80 productos
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
      { name: "Megacito",                              priceCents: 750000  },
      { name: "Sandwich Desmechado",                  priceCents: 1580000 },
      { name: "Sandwich de Milanesa",                 priceCents: 1420000 },
      { name: "Burguer BCÑ",                 priceCents: 1310000 },
      { name: "Patinesa",                              priceCents: 1420000 },
    ],
  },
  {
    categoria: "Al plato",
    sortOrder: 6,
    productos: [
      { name: "Patitas de Pollo x6un con papas rusticas",  priceCents: 780000  },
      { name: "Pizza Individual (4 porciones)",            priceCents: 820000  },
      { name: "Huevos BCÑ",                                priceCents: 620000  },
      { name: "Huevos duros x2",                           priceCents: 320000  },
      { name: "Wraps de Pollo",                            priceCents: 880000  },
      { name: "Sopa c/ focaccia",                          priceCents: 620000  },
      { name: "Mix empanadas x8",                          priceCents: 950000  },
      { name: "Guiso de lentejas",                         priceCents: 1490000 },
      { name: "Ramen",                                     priceCents: 700000  },
      { name: "Papas Rústicas",                            priceCents: 250000  },
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
      { name: "Papas fritas chicas",          priceCents: 290000 },
      { name: "Papas fritas grandes",         priceCents: 340000 },
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
      { name: "Corpo 2 - Brunch c/ bebida y postre",   priceCents: 920000  },
      { name: "Corpo 2 - Appetite c/ bebida y postre", priceCents: 1550000 },
    ],
  },
];

// ============================================================
// CLIENTES CON CUENTA CORRIENTE
// ============================================================

const CLIENTES_CC: Array<{ displayName: string; saldoInicialCents: number; planCode: string; billingCycle: "QUINCENAL" | "MENSUAL" }> = [
  { displayName: "Runa",             saldoInicialCents: 0, planCode: "CORPO1_SNACKS",       billingCycle: "MENSUAL" },
  { displayName: "Ecco SAU",         saldoInicialCents: 0, planCode: "CORPO2",              billingCycle: "MENSUAL" },
  { displayName: "MVA",              saldoInicialCents: 0, planCode: "CORPO1",              billingCycle: "MENSUAL" },
  { displayName: "DINATEC",          saldoInicialCents: 0, planCode: "CORPO1_SNACKS",       billingCycle: "QUINCENAL" },
  { displayName: "CyS",              saldoInicialCents: 0, planCode: "CORPO1_SNACKS",       billingCycle: "QUINCENAL" },
  { displayName: "Tmo del Norte",    saldoInicialCents: 0, planCode: "CORPO1",              billingCycle: "QUINCENAL" },
  { displayName: "Posco Enc",        saldoInicialCents: 0, planCode: "CORPO1",              billingCycle: "MENSUAL" },
  { displayName: "Posco SAU",        saldoInicialCents: 0, planCode: "CORPO2_CARTA_LIBRE",  billingCycle: "QUINCENAL" },
  { displayName: "Socompa",          saldoInicialCents: 0, planCode: "CORPO2_CARTA_LIBRE",  billingCycle: "QUINCENAL" },
  { displayName: "Fundación Condor", saldoInicialCents: 0, planCode: "CORPO2_SNACKS",       billingCycle: "QUINCENAL" },
  { displayName: "PECOM",            saldoInicialCents: 0, planCode: "CORPO2_SNACKS",       billingCycle: "QUINCENAL" },
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
  await prisma.cuentaCorrienteInvoice.deleteMany();
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

  console.log("Creando ubicaciones de stock...");
  await Promise.all([
    prisma.stockLocation.upsert({
      where: { code: "BACONA" },
      update: {},
      create: { code: "BACONA", label: "Bacoña (consumo/venta)" },
    }),
    prisma.stockLocation.upsert({
      where: { code: "SALTA" },
      update: {},
      create: { code: "SALTA", label: "Salta (origen)" },
    }),
    prisma.stockLocation.upsert({
      where: { code: "EN_TRANSITO" },
      update: {},
      create: { code: "EN_TRANSITO", label: "En tránsito" },
    }),
  ]);

  console.log("Creando categorías de inventario...");
  const materiaPrima = await prisma.inventoryCategory.findFirst({
    where: { name: "Materia Prima" },
  }).then((c) => c || prisma.inventoryCategory.create({ data: { name: "Materia Prima" } }));

  const bebidas = await prisma.inventoryCategory.findFirst({
    where: { name: "Bebidas" },
  }).then((c) => c || prisma.inventoryCategory.create({ data: { name: "Bebidas" } }));

  console.log("Creando items de inventario (ficticios para prueba)...");
  const panTostado = await prisma.inventoryItem.findFirst({
    where: { name: "Pan tostado" },
  }).then((i) => i || prisma.inventoryItem.create({
    data: {
      name: "Pan tostado",
      categoryId: materiaPrima.id,
      dimension: "COUNT",
      unit: "UN",
      displayUnit: "UN",
      targetDaysCover: 7,
    },
  }));

  const jamon = await prisma.inventoryItem.findFirst({
    where: { name: "Jamón cocido" },
  }).then((i) => i || prisma.inventoryItem.create({
    data: {
      name: "Jamón cocido",
      categoryId: materiaPrima.id,
      dimension: "MASS",
      unit: "G",
      displayUnit: "G",
      targetDaysCover: 7,
    },
  }));

  const tomate = await prisma.inventoryItem.findFirst({
    where: { name: "Tomate" },
  }).then((i) => i || prisma.inventoryItem.create({
    data: {
      name: "Tomate",
      categoryId: materiaPrima.id,
      dimension: "MASS",
      unit: "G",
      displayUnit: "G",
      targetDaysCover: 7,
    },
  }));

  const cocacola = await prisma.inventoryItem.findFirst({
    where: { name: "Coca-Cola 250ml" },
  }).then((i) => i || prisma.inventoryItem.create({
    data: {
      name: "Coca-Cola 250ml",
      categoryId: bebidas.id,
      dimension: "COUNT",
      unit: "UN",
      displayUnit: "UN",
      targetDaysCover: 7,
    },
  }));

  console.log("Creando receta (Sandwich)...");
  const recipe = await prisma.recipe.findFirst({
    where: { name: "Sandwich Jamón y Tomate" },
  }).then((r) => r || prisma.recipe.create({
    data: {
      name: "Sandwich Jamón y Tomate",
      kind: "CONSUMPTION",
    },
  }));

  await prisma.recipeVersion.upsert({
    where: { recipeId_version: { recipeId: recipe.id, version: 1 } },
    update: {},
    create: {
      recipeId: recipe.id,
      version: 1,
      isActive: true,
      lines: {
        create: [
          {
            inventoryItemId: panTostado.id,
            direction: "OUT",
            qty: new (require("@prisma/client").Prisma.Decimal)(2),
            sortOrder: 0,
          },
          {
            inventoryItemId: jamon.id,
            direction: "OUT",
            qty: new (require("@prisma/client").Prisma.Decimal)(50),
            sortOrder: 1,
          },
          {
            inventoryItemId: tomate.id,
            direction: "OUT",
            qty: new (require("@prisma/client").Prisma.Decimal)(50),
            sortOrder: 2,
          },
        ],
      },
    },
  });

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
      data: { customerId: customer.id, isActive: true, planCode: cliente.planCode, billingCycle: cliente.billingCycle },
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
