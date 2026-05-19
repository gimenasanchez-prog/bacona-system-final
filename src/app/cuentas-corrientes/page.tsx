import { prisma } from "@/lib/prisma";
import { formatArsFromCents } from "@/lib/money";

async function getAccounts() {
  const accounts = await prisma.cuentaCorrienteAccount.findMany({
    where: { isActive: true },
    include: {
      customer: { select: { displayName: true } },
      payments: {
        select: { method: true, amountCents: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      sales: {
        where: { status: { in: ["CONFIRMED", "PAID"] } },
        select: {
          id: true,
          totalCents: true,
          createdAt: true,
          items: { select: { qty: true, product: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
    orderBy: { customer: { displayName: "asc" } },
  });

  return accounts.map((acc) => {
    const totalCharged = acc.payments
      .filter((p) => p.method === "CUENTA_CORRIENTE")
      .reduce((sum, p) => sum + p.amountCents, 0);
    const totalPaid = acc.payments
      .filter((p) => p.method !== "CUENTA_CORRIENTE")
      .reduce((sum, p) => sum + p.amountCents, 0);
    const balance = totalCharged - totalPaid;
    return { ...acc, balance, totalCharged, totalPaid };
  });
}

export default async function CuentasCorrientesPage() {
  const accounts = await getAccounts();

  const totalPendiente = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas Corrientes</h1>
        <div className="text-sm text-neutral-500">
          Total pendiente:{" "}
          <span className={`font-semibold ${totalPendiente > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatArsFromCents(totalPendiente)}
          </span>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-neutral-500">No hay cuentas corrientes activas.</p>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="rounded-lg border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="font-medium">{acc.customer.displayName}</div>
                  <div className="text-xs text-neutral-400">
                    Facturado: {formatArsFromCents(acc.totalCharged)} · Cobrado: {formatArsFromCents(acc.totalPaid)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${acc.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatArsFromCents(acc.balance)}
                  </div>
                  <div className="text-xs text-neutral-400">{acc.balance > 0 ? "Saldo pendiente" : "Al día"}</div>
                </div>
              </div>

              {acc.sales.length > 0 && (
                <div className="divide-y">
                  {acc.sales.map((sale) => {
                    const productNames = sale.items.map((i) => `${i.qty}× ${i.product.name}`).join(", ");
                    return (
                      <div key={sale.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div>
                          <div className="text-neutral-700">{productNames || "Venta"}</div>
                          <div className="text-xs text-neutral-400">
                            {new Date(sale.createdAt).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </div>
                        </div>
                        <div className="font-medium">{formatArsFromCents(sale.totalCents)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
