import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import heicConvert from "heic-convert";
import sharp from "sharp";
import { z } from "zod";

// Lee una foto de ticket/factura de compra con Claude y devuelve los datos estructurados,
// sugiriendo proveedor e insumos a partir del catálogo que le pasamos.

const MODEL = "claude-opus-5-5";
const MAX_IMAGE_SIDE = 1600;

const TicketLineSchema = z.object({
  description: z.string().describe("Texto del producto tal como figura en el ticket"),
  quantity: z.number().describe("Cantidad comprada, en la unidad indicada por uom_id o quantity_unit"),
  quantity_unit: z
    .enum(["UN", "KG", "G", "L", "ML"])
    .nullable()
    .describe("Unidad de la cantidad cuando no se usa una presentación (uom_id)"),
  unit_price: z.number().nullable().describe("Precio unitario en pesos, si figura"),
  line_total: z.number().nullable().describe("Importe total de la línea en pesos, si figura"),
  inventory_item_id: z.string().nullable().describe("id del insumo del catálogo, o null si no hay uno claro"),
  uom_id: z.string().nullable().describe("id de la presentación del insumo (ej. caja x12), o null"),
});

const TicketExtractionSchema = z.object({
  supplier_name_on_ticket: z.string().nullable(),
  supplier_id: z.string().nullable().describe("id del proveedor del catálogo, o null si no hay uno claro"),
  supplier_cuit: z.string().nullable(),
  invoice_type: z.enum(["A", "B", "C", "TICKET", "REMITO", "OTRO"]).nullable(),
  invoice_number: z.string().nullable(),
  date: z.string().nullable().describe("Fecha de compra en formato YYYY-MM-DD"),
  total: z.number().nullable().describe("Total del comprobante en pesos"),
  iva: z.number().nullable().describe("IVA discriminado en pesos, si figura"),
  lines: z.array(TicketLineSchema),
  reading_notes: z
    .string()
    .nullable()
    .describe("Problemas de lectura para quien revisa (foto borrosa, cortada, etc.), en español"),
});

export type TicketExtraction = z.infer<typeof TicketExtractionSchema>;

export type ExtractionCatalog = {
  suppliers: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    name: string;
    unit: string;
    uoms: Array<{ id: string; label: string; unit: string; multiplierToBase: string }>;
  }>;
};

const SYSTEM_PROMPT = `Sos el asistente de carga de compras del restaurante BCN (Argentina).
Recibís la foto (o PDF) de un ticket, factura o remito de compra a un proveedor y extraés sus datos para cargarlos al stock.

Reglas:
- Los montos van en pesos argentinos como número (ej. "$ 12.345,50" es 12345.5). El punto es separador de miles y la coma es decimal.
- La fecha va en formato YYYY-MM-DD. Si el año no se lee, asumí el año en curso.
- Una línea por producto del ticket. No incluyas subtotales, totales, impuestos, descuentos generales ni bolsas como líneas.
- Para cada línea, si un insumo del catálogo corresponde claramente al producto, devolvé su id en inventory_item_id. Si el producto viene en una presentación del catálogo (ej. "Caja x12"), devolvé uom_id y la cantidad en esa presentación. Si no, devolvé la cantidad en quantity_unit (UN, KG, G, L, ML) compatible con la unidad del insumo.
- Si no estás seguro de qué insumo es, devolvé null: una persona lo va a revisar. Es mejor null que un insumo equivocado.
- Usá solo ids que aparecen en el catálogo. Lo mismo para el proveedor.
- En el catálogo los proveedores suelen estar con su nombre de fantasía (ej. "La Rotonda") y en la factura figura la razón social (ej. "Distribuidora X S.R.L."). Quien sube el archivo suele ponerle el nombre del proveedor: usá el nombre del archivo como pista para elegir supplier_id.
- Si algo no se puede leer, dejalo en null y explicalo brevemente en reading_notes.`;

function catalogText(catalog: ExtractionCatalog): string {
  const suppliers = catalog.suppliers.map((s) => `${s.id} | ${s.name}`).join("\n");
  const items = catalog.items
    .map((it) => {
      const uoms = it.uoms.length
        ? ` | presentaciones: ${it.uoms.map((u) => `${u.id} = ${u.label} (${u.multiplierToBase} ${it.unit})`).join("; ")}`
        : "";
      return `${it.id} | ${it.name} | unidad ${it.unit}${uoms}`;
    })
    .join("\n");
  return `PROVEEDORES (id | nombre):\n${suppliers}\n\nINSUMOS (id | nombre | unidad | presentaciones):\n${items}`;
}

/** Convierte HEIC a JPEG, corrige la rotación y achica la imagen. Devuelve JPEG listo para Claude o el navegador. */
export async function prepareTicketImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  let input = buffer;
  if (/heic|heif/i.test(mimeType)) {
    input = Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 0.9 }));
  }
  return sharp(input)
    .rotate()
    .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

let anthropic: Anthropic | null = null;

export async function extractTicket(params: {
  file: Buffer;
  fileName: string;
  mimeType: string;
  catalog: ExtractionCatalog;
}): Promise<TicketExtraction> {
  anthropic ??= new Anthropic();

  const fileBlock: Anthropic.Beta.BetaContentBlockParam =
    params.mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: params.file.toString("base64") },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: (await prepareTicketImage(params.file, params.mimeType)).toString("base64"),
          },
        };

  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(TicketExtractionSchema) },
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      // El catálogo cambia poco: va cacheado para que los tickets de una misma corrida salgan más baratos.
      { type: "text", text: catalogText(params.catalog), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: `Nombre del archivo: "${params.fileName}"\n\nExtraé los datos de este comprobante de compra.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("No se pudo leer el ticket (el modelo rechazó el pedido).");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("El ticket es demasiado largo para leerlo de una vez.");
  }
  if (!response.parsed_output) {
    throw new Error("No se pudo interpretar la respuesta del modelo.");
  }
  return response.parsed_output;
}
