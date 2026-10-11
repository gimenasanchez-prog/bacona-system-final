import { NextResponse } from "next/server";

import { GoogleDrive } from "@/lib/googleDrive";
import { prisma } from "@/lib/prisma";
import { prepareTicketImage } from "@/modules/compras/services/ticketExtractionService";

// Sirve la foto del ticket desde Drive, así quien revisa no necesita acceso a la carpeta.
// Las fotos HEIC (iPhone) se convierten a JPEG porque los navegadores no las muestran.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.ticketImport.findUnique({
    where: { id },
    select: { driveFileId: true, mimeType: true },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  try {
    const file = await GoogleDrive.downloadFile(ticket.driveFileId);
    const isPdf = ticket.mimeType === "application/pdf";
    const body = isPdf ? file : await prepareTicketImage(file, ticket.mimeType);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": isPdf ? "application/pdf" : "image/jpeg",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
