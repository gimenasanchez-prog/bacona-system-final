import { formatArsFromCents } from "@/lib/money";
import { openPrintWindow } from "@/lib/printWindow";

const IVA_LABELS: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: "Responsable Inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
  CONSUMIDOR_FINAL: "Consumidor Final",
  OTRO: "Otro",
};

export type PreviewAccount = {
  customerName: string;
  razonSocial: string | null;
  cuit: string | null;
  ivaCondition: string | null;
  address: string | null;
};

export type PreviewLine = {
  deliveryDate: string;
  clienteLabel: string;
  tipoVianda: string;
  cant: number;
  horarioRetiro: string;
  unitPriceCents: number;
  formaDePagoPlanificada: string;
  viandasCobradasPlanned: number;
  detalleComanda: string;
};

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function printComercialBatchPreview(params: { account: PreviewAccount | null; lines: PreviewLine[] }) {
  const { account, lines } = params;

  const rows = lines
    .map(
      (l) =>
        `<tr>
          <td>${formatDate(l.deliveryDate)}</td>
          <td>${l.clienteLabel}</td>
          <td>${l.tipoVianda}</td>
          <td style="text-align:right">${l.cant}</td>
          <td>${l.horarioRetiro}</td>
          <td style="text-align:right">${formatArsFromCents(l.unitPriceCents)}</td>
          <td>${l.formaDePagoPlanificada || "—"}</td>
          <td style="text-align:right">${l.viandasCobradasPlanned}</td>
          <td style="text-align:right">${formatArsFromCents(l.unitPriceCents * l.viandasCobradasPlanned)}</td>
          <td>${l.detalleComanda || ""}</td>
        </tr>`
    )
    .join("");

  const total = lines.reduce((sum, l) => sum + l.unitPriceCents * l.viandasCobradasPlanned, 0);

  const fiscalLines = account
    ? [
        `<h2>${account.customerName}</h2>`,
        account.razonSocial ? `<p>Razón social: ${account.razonSocial}</p>` : "",
        account.cuit ? `<p>CUIT: ${account.cuit}</p>` : "",
        account.ivaCondition ? `<p>Condición IVA: ${IVA_LABELS[account.ivaCondition] ?? account.ivaCondition}</p>` : "",
        account.address ? `<p>Domicilio: ${account.address}</p>` : "",
      ].join("")
    : `<h2>Detalle de servicio</h2>`;

  const body = `
    ${fiscalLines}
    <table>
      <thead>
        <tr>
          <th>Día</th><th>Cliente</th><th>Tipo de vianda</th><th class="right">Cant.</th>
          <th>Horario</th><th class="right">Precio</th><th>Forma de pago</th>
          <th class="right">Cobradas</th><th class="right">Total</th><th>Detalle</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="8" class="bold right">Total</td><td class="bold right">${formatArsFromCents(total)}</td><td></td></tr></tfoot>
    </table>
    <p style="margin-top:16px">Detalle sujeto a confirmación. Se factura según el medio de pago acordado al momento de la entrega.</p>
  `;

  openPrintWindow(`Detalle de servicio${account ? ` — ${account.customerName}` : ""}`, body);
}
