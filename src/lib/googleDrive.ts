import { auth, drive, type drive_v3 } from "@googleapis/drive";

// Acceso a la carpeta de tickets de compra en el Drive de la empresa, con una cuenta de servicio.
// La carpeta (y su subcarpeta "Procesados") tiene que estar compartida con el email de la cuenta como Editor.

let client: drive_v3.Drive | null = null;

function getDrive(): drive_v3.Drive {
  if (client) return client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta configurar GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  const googleAuth = new auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  client = drive({ version: "v3", auth: googleAuth });
  return client;
}

function requireEnv(name: "DRIVE_TICKETS_FOLDER_ID" | "DRIVE_PROCESSED_FOLDER_ID"): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta configurar ${name}`);
  return v;
}

export type DriveTicketFile = { id: string; name: string; mimeType: string };

export const GoogleDrive = {
  /** Imágenes y PDFs que están en la carpeta de tickets (los procesados ya se movieron a otra carpeta). */
  async listTicketFiles(): Promise<DriveTicketFile[]> {
    const folderId = requireEnv("DRIVE_TICKETS_FOLDER_ID");
    const files: DriveTicketFile[] = [];
    let pageToken: string | undefined;
    do {
      const res = await getDrive().files.list({
        q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/pdf')`,
        fields: "nextPageToken, files(id, name, mimeType)",
        orderBy: "createdTime",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        if (f.id && f.name && f.mimeType) files.push({ id: f.id, name: f.name, mimeType: f.mimeType });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return files;
  },

  async downloadFile(fileId: string): Promise<Buffer> {
    const res = await getDrive().files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  },

  async moveToProcessed(fileId: string): Promise<void> {
    // En local se pone DRIVE_MOVE_PROCESSED=false para probar con la carpeta real sin sacarle archivos a producción
    if (process.env.DRIVE_MOVE_PROCESSED === "false") return;
    const ticketsFolderId = requireEnv("DRIVE_TICKETS_FOLDER_ID");
    const processedFolderId = requireEnv("DRIVE_PROCESSED_FOLDER_ID");
    await getDrive().files.update({
      fileId,
      addParents: processedFolderId,
      removeParents: ticketsFolderId,
      supportsAllDrives: true,
    });
  },
};
