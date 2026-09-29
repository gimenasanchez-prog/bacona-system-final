import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { CashSessionService } from "@/modules/caja/services/cashSessionService";
import { EnvelopeCustodyService } from "@/modules/sobres/services/envelopeCustodyService";
import { CloseShiftWizard } from "./CloseShiftWizard";

export default async function CerrarTurnoPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error, ok } = await props.searchParams;
  const cashSessionId = (await cookies()).get("bcn_cashSessionId")?.value ?? null;
  if (!cashSessionId) redirect("/caja/abrir");

  const summary = await CashSessionService.getCashSessionSummary(cashSessionId);
  if (summary.cashSession.status !== "OPEN") redirect("/caja/turno");

  const [openTables, expenses, suppliers, inventoryItems, envelope, custodian] = await Promise.all([
    CashSessionService.listOpenTableSales(cashSessionId),
    prisma.localExpense.findMany({
      where: { cashSessionId, paymentSource: "SHIFT_CASH" },
      select: { id: true, supplierNameSnapshot: true, description: true, amountCents: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.envelope.findUnique({
      where: { cashSessionId },
      select: { envelopeCode: true, declaredAmountCents: true, expectedAmountCents: true },
    }),
    EnvelopeCustodyService.getActiveCustodian(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Cerrar turno</div>
        <Link className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50" href="/caja/turno">
          Volver a mi turno
        </Link>
      </div>
      {typeof ok === "string" ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">✓ {ok}</div>
      ) : null}
      {typeof error === "string" ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="mt-4">
        <CloseShiftWizard
          cashSessionId={cashSessionId}
          openTables={openTables.map((t) => ({
            id: t.id,
            label: t.table?.label ?? "—",
            totalCents: t.totalCents,
            hasPayments: t.payments.length > 0,
          }))}
          expenses={expenses}
          suppliers={suppliers}
          inventoryItems={inventoryItems}
          cashCents={summary.totals.EFECTIVO}
          shiftCashExpensesCents={summary.totals.totalShiftCashExpensesCents}
          expectedEnvelopeCents={summary.totals.expectedEnvelopeAmountCents}
          sealedEnvelope={envelope}
          custodianName={custodian?.displayName ?? null}
          isCustodian={custodian?.id === summary.cashSession.employee.id}
        />
      </div>
    </div>
  );
}
