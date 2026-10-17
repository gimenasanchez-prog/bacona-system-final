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

  // Pendiente sin proveedor: proponer uno ya conocido (no se guarda hasta confirmar)
  const supplierMatch =
    ticket.status === "PENDING_REVIEW" && !ticket.supplierId
      ? await TicketImportService.matchKnownSupplier({ cuit: ticket.supplierCuit, nameRaw: ticket.supplierNameRaw })
      : null;
  const supplierId = ticket.supplierId ?? supplierMatch?.supplierId ?? null;

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
    possibleDuplicates,
  });
}
