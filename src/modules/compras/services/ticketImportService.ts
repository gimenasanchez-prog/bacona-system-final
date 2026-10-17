import { Prisma, PurchaseType, TicketImportStatus, TicketLineMatchSource } from "@prisma/client";

import { cuitDigits, formatCuit } from "@/lib/cuit";
import { GoogleDrive } from "@/lib/googleDrive";
import { prisma } from "@/lib/prisma";
import { PurchaseService, type PurchasePaymentInput } from "@/modules/compras/services/purchaseService";
import {
  extractTicket,
  type ExtractionCatalog,
  type TicketExtraction,
} from "@/modules/compras/services/ticketExtractionService";

const MAX_FILES_PER_RUN = 10;
const STOCK_UNITS = new Set(["UN", "KG", "G", "L", "ML"]);

/** Texto normalizado para comparar descripciones de tickets: minúsculas, sin acentos ni signos. */
export function normalizeTicketText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pesosToCents(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

function parseTicketDate(v: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadCatalog(): Promise<ExtractionCatalog> {
  const [suppliers, items] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        uoms: { select: { id: true, label: true, unit: true, multiplierToBase: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    suppliers,
    items: items.map((it) => ({
      ...it,
      uoms: it.uoms.map((u) => ({ ...u, multiplierToBase: u.multiplierToBase.toString() })),
    })),
  };
}

/** Arma las líneas a guardar: primero lo aprendido (alias), después la sugerencia de Claude validada contra el catálogo. */
async function resolveLines(extraction: TicketExtraction, supplierId: string | null, catalog: ExtractionCatalog) {
  const itemsById = new Map(catalog.items.map((it) => [it.id, it]));
  const aliases = supplierId
    ? await prisma.supplierProductAlias.findMany({ where: { supplierId } })
    : [];
  const aliasByText = new Map(aliases.map((a) => [a.normalizedText, a]));

  return extraction.lines.map((l, idx) => {
    const alias = aliasByText.get(normalizeTicketText(l.description));
    const aiItem = l.inventory_item_id ? itemsById.get(l.inventory_item_id) : undefined;

    let inventoryItemId: string | null = null;
    let uomId: string | null = null;
    let matchSource: TicketLineMatchSource = TicketLineMatchSource.NONE;
    if (alias && itemsById.has(alias.inventoryItemId)) {
      inventoryItemId = alias.inventoryItemId;
      const aliasItem = itemsById.get(alias.inventoryItemId)!;
      uomId = alias.uomId && aliasItem.uoms.some((u) => u.id === alias.uomId) ? alias.uomId : null;
      matchSource = TicketLineMatchSource.ALIAS;
    } else if (aiItem) {
      inventoryItemId = aiItem.id;
      uomId = l.uom_id && aiItem.uoms.some((u) => u.id === l.uom_id) ? l.uom_id : null;
      matchSource = TicketLineMatchSource.AI;
    }

    // Descuentos y bonificaciones vienen con importe negativo: no son mercadería
    const isDiscount = (l.line_total ?? 0) < 0 || (l.unit_price ?? 0) < 0;

    return {
      rawDescription: l.description,
      ignored: isDiscount,
      qty: new Prisma.Decimal(Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1),
      unitRaw: l.quantity_unit && STOCK_UNITS.has(l.quantity_unit) ? l.quantity_unit : null,
      unitPriceCents: pesosToCents(l.unit_price),
      lineTotalCents: pesosToCents(l.line_total),
      inventoryItemId,
      uomId,
      matchSource,
      sortOrder: idx,
    };
  });
}

export type SupplierMatch = { supplierId: string; matchedBy: "CUIT" | "NOMBRE" };

/**
 * Proveedor ya conocido para un ticket, sin depender de la lectura de Claude:
 * 1) el CUIT coincide con el de la ficha de un proveedor, o con el de un ticket ya confirmado;
 * 2) la razón social coincide exactamente (sin acentos ni signos) con el nombre o la razón social de un proveedor activo.
 */
async function matchKnownSupplier(params: { cuit: string | null; nameRaw: string | null }): Promise<SupplierMatch | null> {
  const cuit = cuitDigits(params.cuit);
  const suppliers = await prisma.supplier.findMany({
    where: { active: true },
    select: { id: true, name: true, razonSocial: true, cuit: true },
  });
  if (cuit) {
    const byCuit = suppliers.filter((s) => cuitDigits(s.cuit) === cuit);
    if (byCuit.length === 1) return { supplierId: byCuit[0]!.id, matchedBy: "CUIT" };
    const confirmed = await prisma.ticketImport.findMany({
      where: { status: TicketImportStatus.CONFIRMED, supplierCuit: { not: null }, supplierId: { not: null }, supplier: { active: true } },
      select: { supplierCuit: true, supplierId: true },
      orderBy: { reviewedAt: "desc" },
    });
    const hit = confirmed.find((t) => cuitDigits(t.supplierCuit) === cuit);
    if (hit?.supplierId) return { supplierId: hit.supplierId, matchedBy: "CUIT" };
  }
  // Sin espacios ni signos: "S.R.L." y "SRL" cuentan como lo mismo
  const compact = (s: string) => normalizeTicketText(s).replace(/ /g, "");
  const name = params.nameRaw ? compact(params.nameRaw) : "";
  if (name) {
    const same = suppliers.filter(
      (s) => compact(s.name) === name || (s.razonSocial != null && compact(s.razonSocial) === name),
    );
    if (same.length === 1) return { supplierId: same[0]!.id, matchedBy: "NOMBRE" };
  }
  return null;
}

async function buildTicketData(extraction: TicketExtraction, catalog: ExtractionCatalog) {
  const aiSupplierId =
    extraction.supplier_id && catalog.suppliers.some((s) => s.id === extraction.supplier_id)
      ? extraction.supplier_id
      : null;
  // Lo aprendido por CUIT manda sobre la sugerencia de Claude; el nombre exacto solo si Claude no eligió
  const known = await matchKnownSupplier({ cuit: extraction.supplier_cuit, nameRaw: extraction.supplier_name_on_ticket });
  const supplierId = known?.matchedBy === "CUIT" ? known.supplierId : (aiSupplierId ?? known?.supplierId ?? null);
  const lines = await resolveLines(extraction, supplierId, catalog);
  return {
    status: TicketImportStatus.PENDING_REVIEW,
    errorMessage: extraction.reading_notes,
    supplierNameRaw: extraction.supplier_name_on_ticket,
    supplierId,
    supplierCuit: extraction.supplier_cuit,
    invoiceType: extraction.invoice_type,
    invoiceNumber: extraction.invoice_number,
    purchasedAt: parseTicketDate(extraction.date),
    totalCents: pesosToCents(extraction.total),
    ivaCents: pesosToCents(extraction.iva),
    rawExtraction: extraction as unknown as Prisma.InputJsonValue,
    lines,
  };
}

let running = false;

export class TicketImportService {
  /**
   * Busca tickets nuevos en la carpeta de Drive, los lee con Claude y crea las cargas pendientes de revisión.
   * Cada archivo procesado (bien o con error) se mueve a "Procesados". Un error en un archivo no frena al resto.
   */
  static async runImport(): Promise<{ found: number; created: number; errors: number; skipped: boolean }> {
    if (running) return { found: 0, created: 0, errors: 0, skipped: true };
    running = true;
    try {
      const files = await GoogleDrive.listTicketFiles();
      const existing = await prisma.ticketImport.findMany({
        where: { driveFileId: { in: files.map((f) => f.id) } },
        select: { driveFileId: true },
      });
      const existingIds = new Set(existing.map((e) => e.driveFileId));

      // Ya importados pero que quedaron en la carpeta (falló el movimiento la vez anterior)
      for (const f of files.filter((f) => existingIds.has(f.id))) {
        await GoogleDrive.moveToProcessed(f.id).catch((e) => console.error("[tickets] mover", f.name, e));
      }

      const pending = files.filter((f) => !existingIds.has(f.id)).slice(0, MAX_FILES_PER_RUN);
      const catalog = pending.length ? await loadCatalog() : null;
      let created = 0;
      let errors = 0;

      for (const f of pending) {
        const base = { driveFileId: f.id, driveFileName: f.name, mimeType: f.mimeType };
        try {
          const file = await GoogleDrive.downloadFile(f.id);
          const extraction = await extractTicket({ file, fileName: f.name, mimeType: f.mimeType, catalog: catalog! });
          const { lines, ...data } = await buildTicketData(extraction, catalog!);
          await prisma.ticketImport.create({ data: { ...base, ...data, lines: { create: lines } } });
          created++;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // otra corrida lo tomó
          console.error("[tickets] error leyendo", f.name, e);
          errors++;
          await prisma.ticketImport
            .create({
              data: {
                ...base,
                status: TicketImportStatus.ERROR,
                errorMessage: e instanceof Error ? e.message : "Error al leer el ticket",
              },
            })
            .catch(() => undefined);
        }
        await GoogleDrive.moveToProcessed(f.id).catch((e) => console.error("[tickets] mover", f.name, e));
      }

      return { found: pending.length, created, errors, skipped: false };
    } finally {
      running = false;
    }
  }

  /** Vuelve a leer un ticket (por ejemplo, uno que quedó con error). Reemplaza lo leído antes. */
  static async reprocess(id: string) {
    const ticket = await prisma.ticketImport.findUnique({ where: { id } });
    if (!ticket) throw new Error("Ticket no encontrado");
    if (ticket.status === TicketImportStatus.CONFIRMED) throw new Error("El ticket ya fue confirmado");

    const [file, catalog] = await Promise.all([GoogleDrive.downloadFile(ticket.driveFileId), loadCatalog()]);
    const extraction = await extractTicket({ file, fileName: ticket.driveFileName, mimeType: ticket.mimeType, catalog });
    const { lines, ...data } = await buildTicketData(extraction, catalog);
    return prisma.ticketImport.update({
      where: { id },
      data: { ...data, lines: { deleteMany: {}, create: lines } },
    });
  }

  /** Para tickets pendientes sin proveedor (leídos antes de que se conociera): busca uno por CUIT o razón social. */
  static matchKnownSupplier(params: { cuit: string | null; nameRaw: string | null }) {
    return matchKnownSupplier(params);
  }

  static async discard(id: string, employeeId: string) {
    const res = await prisma.ticketImport.updateMany({
      where: { id, status: { in: [TicketImportStatus.PENDING_REVIEW, TicketImportStatus.ERROR] } },
      data: { status: TicketImportStatus.DISCARDED, reviewedByEmployeeId: employeeId, reviewedAt: new Date() },
    });
    if (res.count === 0) throw new Error("El ticket ya no está pendiente");
  }

  /** Compras ya cargadas que podrían ser el mismo comprobante. */
  static async findPossibleDuplicates(params: {
    supplierId: string | null;
    invoiceNumber: string | null;
    totalCents: number | null;
    purchasedAt: Date | null;
  }) {
    if (!params.supplierId) return [];
    const or: Prisma.PurchaseWhereInput[] = [];
    if (params.invoiceNumber) or.push({ invoiceNumber: params.invoiceNumber });
    if (params.totalCents && params.purchasedAt) {
      const start = new Date(params.purchasedAt);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      or.push({ invoiceTotalCents: params.totalCents, purchasedAt: { gte: start, lt: end } });
    }
    if (!or.length) return [];
    return prisma.purchase.findMany({
      where: { supplierId: params.supplierId, OR: or },
      select: { id: true, purchasedAt: true, invoiceNumber: true, invoiceTotalCents: true },
      take: 5,
    });
  }

  /**
   * Confirma la revisión: crea la compra (que impacta stock y la deuda/pago al proveedor)
   * y guarda lo aprendido para los próximos tickets de ese proveedor.
   */
  static async confirm(params: {
    id: string;
    employeeId: string;
    supplierId: string;
    invoiceNumber: string | null;
    invoiceTotalCents: number;
    purchasedAt: Date;
    type: PurchaseType;
    locationCode: "BACONA" | "SALTA" | "EN_TRANSITO";
    payment: PurchasePaymentInput;
    lines: Array<{
      id?: string | null;
      rawDescription: string;
      qty: number;
      unit: string | null;
      uomId: string | null;
      inventoryItemId: string | null;
      unitPriceCents: number | null;
      ignored: boolean;
    }>;
  }) {
    const ticket = await prisma.ticketImport.findUnique({ where: { id: params.id }, include: { lines: true } });
    if (!ticket) throw new Error("Ticket no encontrado");
    if (ticket.status !== TicketImportStatus.PENDING_REVIEW) throw new Error("El ticket ya no está pendiente");

    // Sin líneas activas es válido: se registra solo la compra y el pago/deuda (ej. un servicio), sin mover stock.
    const activeLines = params.lines.filter((l) => !l.ignored);
    const negative = activeLines.find((l) => l.unitPriceCents != null && l.unitPriceCents < 0);
    if (negative)
      throw new Error(`"${negative.rawDescription}" tiene precio negativo (parece un descuento): marcalo como "No va al stock"`);
    const unmatched = activeLines.find((l) => !l.inventoryItemId);
    if (unmatched) throw new Error(`Falta elegir el insumo para "${unmatched.rawDescription}"`);
    const badQty = activeLines.find((l) => !(l.qty > 0));
    if (badQty) throw new Error(`La cantidad de "${badQty.rawDescription}" tiene que ser mayor a 0`);

    const supplier = await prisma.supplier.findUnique({ where: { id: params.supplierId } });
    if (!supplier) throw new Error("Proveedor no encontrado");

    // Reservar el ticket para que dos personas no lo confirmen a la vez
    const claim = await prisma.ticketImport.updateMany({
      where: { id: params.id, status: TicketImportStatus.PENDING_REVIEW },
      data: { status: TicketImportStatus.CONFIRMED, reviewedByEmployeeId: params.employeeId, reviewedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("El ticket ya no está pendiente");

    let purchase;
    try {
      purchase = await PurchaseService.createAndPost({
        type: params.type,
        locationCode: params.locationCode,
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceNumber: params.invoiceNumber,
        invoiceTotalCents: params.invoiceTotalCents,
        purchasedAt: params.purchasedAt,
        notes: `Cargada desde ticket: ${ticket.driveFileName}`,
        createdByEmployeeId: params.employeeId,
        payment: params.payment,
        lines: activeLines.map((l) => ({
          inventoryItemId: l.inventoryItemId!,
          qty: l.qty,
          unit: l.uomId ? null : l.unit,
          uomId: l.uomId,
          unitCostCents: l.unitPriceCents,
        })),
      });
    } catch (e) {
      await prisma.ticketImport.update({
        where: { id: params.id },
        data: { status: TicketImportStatus.PENDING_REVIEW, reviewedByEmployeeId: null, reviewedAt: null },
      });
      throw e;
    }

    // Completar la ficha del proveedor con lo que dice la factura (solo campos vacíos: no pisa lo cargado a mano)
    const supplierFill: Prisma.SupplierUpdateInput = {};
    if (!supplier.razonSocial && ticket.supplierNameRaw?.trim()) supplierFill.razonSocial = ticket.supplierNameRaw.trim();
    if (!supplier.cuit && formatCuit(ticket.supplierCuit)) supplierFill.cuit = formatCuit(ticket.supplierCuit);

    // Guardar la versión revisada de las líneas y lo aprendido
    const previous = new Map(ticket.lines.map((l) => [l.id, l]));
    await prisma.$transaction([
      prisma.ticketImport.update({
        where: { id: params.id },
        data: {
          purchaseId: purchase.id,
          supplierId: supplier.id,
          invoiceNumber: params.invoiceNumber,
          totalCents: params.invoiceTotalCents,
          purchasedAt: params.purchasedAt,
          type: params.type,
          locationCode: params.locationCode,
          lines: {
            deleteMany: {},
            create: params.lines.map((l, idx) => {
              const prev = l.id ? previous.get(l.id) : undefined;
              const unchanged = prev && prev.inventoryItemId === l.inventoryItemId && prev.uomId === l.uomId;
              return {
                rawDescription: l.rawDescription,
                qty: new Prisma.Decimal(l.qty > 0 ? l.qty : 0),
                unitRaw: l.unit,
                unitPriceCents: l.unitPriceCents,
                lineTotalCents: prev?.lineTotalCents ?? null,
                inventoryItemId: l.inventoryItemId,
                uomId: l.uomId,
                matchSource: unchanged ? prev.matchSource : TicketLineMatchSource.MANUAL,
                ignored: l.ignored,
                sortOrder: idx,
              };
            }),
          },
        },
      }),
      ...activeLines
        .filter((l) => normalizeTicketText(l.rawDescription))
        .map((l) =>
          prisma.supplierProductAlias.upsert({
            where: {
              supplierId_normalizedText: {
                supplierId: supplier.id,
                normalizedText: normalizeTicketText(l.rawDescription),
              },
            },
            create: {
              supplierId: supplier.id,
              normalizedText: normalizeTicketText(l.rawDescription),
              inventoryItemId: l.inventoryItemId!,
              uomId: l.uomId,
            },
            update: { inventoryItemId: l.inventoryItemId!, uomId: l.uomId, timesUsed: { increment: 1 } },
          }),
        ),
    ]);

    // Aparte y sin frenar nada: la compra ya quedó confirmada aunque esto falle
    if (Object.keys(supplierFill).length) {
      await prisma.supplier
        .update({ where: { id: supplier.id }, data: supplierFill })
        .catch((e) => console.error("[tickets] completar ficha del proveedor", supplier.id, e));
    }

    return purchase;
  }
}
