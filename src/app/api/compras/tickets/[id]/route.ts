import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { TicketImportService } from "@/modules/compras/services/ticketImportService";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.ticketImport.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      supplier: { select: { id: true, name: true } },
      reviewedByEmployee: { select: { displayName: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  // Pendiente: el proveedor se reconoce por la factura (CUIT / razón social), recalculado al abrir para
  // aprovechar proveedores creados o fusionados después de leerlo. No se guarda hasta confirmar.
  const pending = ticket.status === "PENDING_REVIEW";
  const supplierMatch = pending
    ? await TicketImportService.matchKnownSupplier({ cuit: ticket.supplierCuit, nameRaw: ticket.supplierNameRaw })
    : null;
  const supplierId = pending ? (supplierMatch?.supplierId ?? null) : ticket.supplierId;

  // Lo que Claude dedujo del nombre del archivo: solo como sugerencia para elegir con un toque
  const aiPick = (ticket.rawExtraction as { supplier_id?: string | null } | null)?.supplier_id ?? null;
  const fileSuggestion =
    pending && !supplierId && aiPick
      ? await prisma.supplier.findFirst({ where: { id: aiPick, active: true }, select: { id: true, name: true } })
      : null;

  const possibleDuplicates =
    ticket.status === "PENDING_REVIEW"
      ? await TicketImportService.findPossibleDuplicates({
          supplierId,
          invoiceNumber: ticket.invoiceNumber,
          totalCents: ticket.totalCents,
          purchasedAt: ticket.purchasedAt,
        })
      : [];

  return NextResponse.json({
    ticket: { ...ticket, supplierId },
    supplierMatchedBy: supplierMatch?.matchedBy ?? null,
    supplierCandidates: supplierMatch?.candidates ?? 0,
    fileSuggestion,
    possibleDuplicates,
  });
}
