import { formatArsFromCents } from "@/lib/money";
import {
  ENVELOPE_STATUS_BADGE_CLASS,
  ENVELOPE_STATUS_LABEL,
  envelopeDifferenceCents,
  type EnvelopeStatus,
} from "@/modules/sobres/lib/envelopeStatus";

export function EnvelopeStatusBadge(props: {
  envelope: { status: EnvelopeStatus; expectedAmountCents: number; actualAmountCents: number | null } | null;
}) {
  if (!props.envelope) {
    return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">—</span>;
  }
  const { status } = props.envelope;
  const diff = status === "NOT_CONTROLLED" ? envelopeDifferenceCents(props.envelope) : null;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENVELOPE_STATUS_BADGE_CLASS[status]}`}>
        {ENVELOPE_STATUS_LABEL[status]}
      </span>
      {diff != null && diff !== 0 ? (
        <span className={`text-xs font-medium ${diff < 0 ? "text-red-700" : "text-blue-700"}`}>
          {diff < 0 ? `Faltan ${formatArsFromCents(-diff)}` : `Sobran ${formatArsFromCents(diff)}`}
        </span>
      ) : null}
    </span>
  );
}
