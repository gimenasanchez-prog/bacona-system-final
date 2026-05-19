"use client";

import { useEffect, useMemo, useState } from "react";

import { formatArsFromCents } from "@/lib/money";

type Category = { id: string; name: string };
type ProductListItem = { id: string; name: string; priceCents: number };
type ModifierOption = { id: string; name: string; priceDeltaCents: number };
type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};
type ProductDetails = { id: string; name: string; priceCents: number; modifierGroups: ModifierGroup[] };

type Customer = { id: string; displayName: string };
type CuentaCorrienteAccount = { id: string; customer: Customer; planCode: string | null };
type ReservationSummary = { id: string; reservationAt: string; status: SaleStatus; customerName: string; totalCents: number; itemCount: number; coverCount: number | null };
type Employee = { id: string; displayName: string };
type PosTable = { id: string; label: string };
type InventoryItemPicker = { id: string; name: string; unit: "UN" | "KG" | "G" | "L" | "ML" };
type OpenTableSale = { id: string; tableId: string | null; tableLabel: string | null; status: SaleStatus; totalCents: number; itemCount: number };

type SaleType = "MOSTRADOR" | "MESA" | "RESERVA";
type SaleStatus = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";
type PaymentMethod =
  | "EFECTIVO"
  | "CREDITO"
  | "DEBITO"
  | "TRANSFERENCIA"
  | "QR"
  | "CUENTA_CORRIENTE"
  | "CUENTAS_INTERNAS";

type SaleItemModifier = {
  id: string;
  priceDeltaCents: number;
  modifierOption: { id: string; name: string; group: { id: string; name: string } };
};
type SaleItem = {
  id: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  product: { id: string; name: string };
  modifiers: SaleItemModifier[];
};
type SalePayment = {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  cuentaCorrienteAccount?: { id: string; customer: Customer } | null;
  employee?: { id: string; displayName: string } | null;
};
type Sale = {
  id: string;
  saleType: SaleType;
  status: SaleStatus;
  customerId: string | null;
  cuentaCorrienteAccountId: string | null;
  customerNameFreeText: string | null;
  tableId: string | null;
  reservationAt: string | null;
  subtotalCents: number;
  totalCents: number;
  externalRefs: Record<string, any> | null;
  items: SaleItem[];
  payments: SalePayment[];
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error ?? res.statusText;
    throw new Error(msg);
  }
  return json as T;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function PosPage() {
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);

  const [accounts, setAccounts] = useState<CuentaCorrienteAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemPicker[]>([]);

  const [saleTypeDraft, setSaleTypeDraft] = useState<SaleType>("MOSTRADOR");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const paidTotalCents = useMemo(() => {
    if (!sale) return 0;
    return sale.payments.reduce((s, p) => s + p.amountCents, 0);
  }, [sale]);

  const [modals, setModals] = useState<{
    product: ProductDetails | null;
    selectedOptionIds: string[];
  }>({ product: null, selectedOptionIds: [] });

  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("DEBITO");
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [paymentEmployeeId, setPaymentEmployeeId] = useState<string>("");

  const [openTableSales, setOpenTableSales] = useState<OpenTableSale[]>([]);
  const [saleSuccess, setSaleSuccess] = useState<number | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [upcomingReservations, setUpcomingReservations] = useState<ReservationSummary[]>([]);
  const [reservationsCollapsed, setReservationsCollapsed] = useState(false);

  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossForm, setLossForm] = useState<{
    inventoryItemId: string;
    qty: string;
    notes: string;
  }>({
    inventoryItemId: "",
    qty: "1",
    notes: "",
  });

  async function refreshSale(id: string) {
    const details = await apiGet<{ sale: Sale; paidTotalCents: number }>(`/api/pos/sales/${id}`);
    setSale(details.sale);
  }

  async function ensureSale(): Promise<string> {
    if (saleId) return saleId;
    const created = await apiJson<{ sale: { id: string } }>("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify({ saleType: saleTypeDraft }),
    });
    setSaleId(created.sale.id);
    await refreshSale(created.sale.id);
    return created.sale.id;
  }

  async function patchSale(patch: Record<string, any>) {
    if (!saleId) return;
    await apiJson(`/api/pos/sales/${saleId}`, { method: "PATCH", body: JSON.stringify(patch) });
    await refreshSale(saleId);
  }

  async function loadProducts(categoryId: string) {
    const data = await apiGet<{ products: ProductListItem[] }>(`/api/pos/products?categoryId=${categoryId}`);
    setProducts(data.products);
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ categories: Category[] }>("/api/pos/categories");
        setCategories(data.categories);
        if (data.categories[0]) {
          setSelectedCategoryId(data.categories[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) return;
    (async () => {
      try {
        setError(null);
        await loadProducts(selectedCategoryId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [selectedCategoryId]);

  useEffect(() => {
    // Load pickers data (simple MVP approach: small dataset)
    (async () => {
      try {
        const [a, e, t] = await Promise.all([
          apiGet<{ accounts: CuentaCorrienteAccount[] }>("/api/pos/cuentas-corrientes"),
          apiGet<{ employees: Employee[] }>("/api/pos/employees"),
          apiGet<{ tables: PosTable[] }>("/api/pos/tables"),
        ]);
        setAccounts(a.accounts);
        setEmployees(e.employees);
        setTables(t.tables);
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : "Error");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{
          items: Array<{ id: string; name: string; unit: InventoryItemPicker["unit"] }>;
        }>("/api/stock/items");
        setInventoryItems(data.items);
        setLossForm((prev) => ({ ...prev, inventoryItemId: prev.inventoryItemId || data.items[0]?.id || "" }));
      } catch (e) {
        // Stock module may not be set up yet; keep POS usable.
        setInventoryItems([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sale) return;
    const remaining = Math.max(0, sale.totalCents - paidTotalCents);
    setPaymentAmount(remaining);
  }, [sale?.totalCents, paidTotalCents]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ sales: OpenTableSale[] }>("/api/pos/sales/open");
        setOpenTableSales(data.sales);
      } catch { /* ignore */ }
    })();
  }, [saleId]);

  useEffect(() => {
    if (!sale?.cuentaCorrienteAccountId) {
      setSelectedPlanCode(null);
      return;
    }
    const acc = accounts.find((a) => a.id === sale.cuentaCorrienteAccountId);
    setSelectedPlanCode(acc?.planCode ?? null);
    const corporativo = categories.find((c) => c.name.toLowerCase().includes("corporat"));
    if (corporativo) setSelectedCategoryId(corporativo.id);
  }, [sale?.cuentaCorrienteAccountId, categories, accounts]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ reservations: ReservationSummary[] }>("/api/pos/sales/reservations");
        setUpcomingReservations(data.reservations);
      } catch { /* ignore */ }
    })();
  }, [saleId]);

  const hasCustomer = useMemo(
    () => !!sale?.cuentaCorrienteAccountId || !!sale?.customerNameFreeText?.trim(),
    [sale]
  );

  const hasCoverCount = useMemo(() => {
    if (!saleId) return false;
    const count = sale?.externalRefs?.coverCount;
    if (count === undefined || count === null) return true; // default: 1 persona
    return typeof count === "number" && (count as number) >= 1;
  }, [saleId, sale]);

  const allowedPlanConfig = useMemo(() => {
    if (!selectedPlanCode) return null;
    const configs: Record<string, { showSnacks: boolean; corpoFilter: "all" | "corpo2" | "corpo2_basic"; capCentsPerPerson: number | null }> = {
      FULL:                 { showSnacks: false, corpoFilter: "all",         capCentsPerPerson: null },
      FULL_SNACKS_CAPPED:   { showSnacks: true,  corpoFilter: "all",         capCentsPerPerson: 1_350_000 },
      CORPO2_SNACKS:        { showSnacks: true,  corpoFilter: "corpo2",      capCentsPerPerson: null },
      CORPO2_BASIC:         { showSnacks: false, corpoFilter: "corpo2_basic", capCentsPerPerson: null },
    };
    return configs[selectedPlanCode] ?? null;
  }, [selectedPlanCode]);

  const planCapReached = useMemo(() => {
    if (!allowedPlanConfig?.capCentsPerPerson || !sale) return false;
    const coverCount = (sale.externalRefs?.coverCount as number | undefined) ?? 1;
    return sale.totalCents >= allowedPlanConfig.capCentsPerPerson * coverCount;
  }, [allowedPlanConfig, sale]);

  const canFinalizeMostrador = useMemo(() => {
    if (!sale || sale.saleType !== "MOSTRADOR") return false;
    if (sale.items.length === 0) return false;
    if (!hasCustomer) return false;
    if (!hasCoverCount) return false;
    return paidTotalCents >= sale.totalCents && sale.totalCents > 0;
  }, [sale, paidTotalCents, hasCustomer, hasCoverCount]);

  const canConfirm = useMemo(() => {
    if (!sale) return false;
    if (sale.saleType === "MOSTRADOR") return false;
    if (sale.items.length === 0) return false;
    if (!hasCustomer) return false;
    if (sale.saleType === "MESA" && !sale.tableId) return false;
    if (sale.saleType === "RESERVA" && !sale.reservationAt) return false;
    return true;
  }, [sale, hasCustomer]);

  const canMarkPaid = useMemo(() => {
    if (!sale) return false;
    if (sale.saleType === "MOSTRADOR") return false; // uses canFinalizeMostrador
    if (sale.status === "PAID" || sale.status === "CANCELLED") return false;
    return paidTotalCents >= sale.totalCents && sale.totalCents > 0;
  }, [sale, paidTotalCents]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_360px]">
      <div className="rounded-lg border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Categorías</div>
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs"
            onClick={() => {
              setSaleId(null);
              setSale(null);
              setPaymentsOpen(false);
              setSaleSuccess(null);
              setError(null);
            }}
          >
            Nuevo
          </button>
        </div>
        <div className="space-y-1">
          {categories
            .filter((c) => {
              if (!allowedPlanConfig) return true;
              const name = c.name.toLowerCase();
              if (name.includes("corporat")) return true;
              if (name.includes("snack") && allowedPlanConfig.showSnacks) return true;
              return false;
            })
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(c.id)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm",
                  selectedCategoryId === c.id
                    ? "bg-neutral-900 text-white"
                    : "hover:bg-neutral-100"
                )}
              >
                {c.name}
              </button>
            ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">Venta</div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <SaleTypeTabs
                value={sale?.saleType ?? saleTypeDraft}
                onChange={async (next) => {
                  setSaleTypeDraft(next);

                  if (saleId) await patchSale({ saleType: next });
                }}
              />
            </div>
          </div>

          {saleTypeDraft === "MESA" && !saleId ? (
            <div className="mt-3 rounded-md border bg-neutral-50 p-3">
              <div className="mb-2 text-xs font-semibold text-neutral-700">Seleccioná una mesa</div>
              <div className="flex flex-wrap gap-2">
                {tables.map((t) => {
                  const open = openTableSales.find((s) => s.tableId === t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm",
                        open ? "border-amber-400 bg-amber-50 text-amber-800" : "hover:bg-neutral-100"
                      )}
                      onClick={async () => {
                        try {
                          setError(null);
                          if (open) {
                            setSaleId(open.id);
                            await refreshSale(open.id);
                          } else {
                            const created = await apiJson<{ sale: { id: string } }>("/api/pos/sales", {
                              method: "POST",
                              body: JSON.stringify({ saleType: "MESA", tableId: t.id }),
                            });
                            setSaleId(created.sale.id);
                            await refreshSale(created.sale.id);
                          }
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error");
                        }
                      }}
                    >
                      {t.label}
                      {open ? <span className="ml-1 text-xs">({open.itemCount} ítems)</span> : null}
                    </button>
                  );
                })}
              </div>
              {openTableSales.length > 0 ? (
                <div className="mt-2 text-xs text-amber-700">Las mesas en naranja tienen pedido abierto — tocalas para continuarlo.</div>
              ) : null}
            </div>
          ) : null}

          {sale && openTableSales.length > 0 && sale.saleType === "MESA" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {openTableSales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    s.id === saleId ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  )}
                  onClick={async () => {
                    setSaleId(s.id);
                    await refreshSale(s.id);
                  }}
                >
                  {s.tableLabel ?? "Mesa"} · {formatArsFromCents(s.totalCents)}
                </button>
              ))}
              <button
                type="button"
                className="rounded-full border px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
                onClick={() => { setSaleId(null); setSale(null); }}
              >
                + Otra mesa
              </button>
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-medium">Cuenta corriente</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={sale?.cuentaCorrienteAccountId ?? ""}
                onChange={async (ev) => {
                  const id = ev.target.value || null;
                  try {
                    const sid = await ensureSale();
                    await apiJson(`/api/pos/sales/${sid}`, {
                      method: "PATCH",
                      body: JSON.stringify({ cuentaCorrienteAccountId: id, customerNameFreeText: null }),
                    });
                    await refreshSale(sid);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                <option value="">— Mostrador / sin cuenta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.customer.displayName}
                  </option>
                ))}
              </select>
              {sale?.cuentaCorrienteAccountId ? (
                <div className="rounded-md bg-blue-50 px-3 py-1 text-xs text-blue-700">
                  Mostrando productos corporativos para esta cuenta
                </div>
              ) : null}
            </div>

            {!sale?.cuentaCorrienteAccountId ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium">
                  ¿Cómo se llama?{" "}
                  <span className="text-neutral-400 font-normal">(obligatorio)</span>
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Gimena"
                  value={sale?.customerNameFreeText ?? ""}
                  onChange={(e) => setSale((prev) => (prev ? { ...prev, customerNameFreeText: e.target.value } : prev))}
                  onBlur={async () => {
                    if (!saleId) return;
                    await patchSale({ customerNameFreeText: sale?.customerNameFreeText ?? null });
                  }}
                  disabled={!saleId}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium">
              Comensales{" "}
              <span className="text-neutral-400 font-normal">(requerido)</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50 disabled:opacity-40"
                disabled={(sale?.externalRefs?.coverCount ?? 1) <= 1}
                onClick={async () => {
                  const sid = saleId ?? await ensureSale().catch(() => null);
                  if (!sid) return;
                  const current = (sale?.externalRefs?.coverCount as number | undefined) ?? 1;
                  const next = Math.max(1, current - 1);
                  await apiJson(`/api/pos/sales/${sid}`, { method: "PATCH", body: JSON.stringify({ externalRefs: { ...(sale?.externalRefs ?? {}), coverCount: next } }) });
                  await refreshSale(sid);
                }}
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-sm font-semibold">
                {(sale?.externalRefs?.coverCount as number | undefined) ?? 1}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50"
                onClick={async () => {
                  try {
                    const sid = saleId ?? await ensureSale();
                    const current = (sale?.externalRefs?.coverCount as number | undefined) ?? 1;
                    await apiJson(`/api/pos/sales/${sid}`, { method: "PATCH", body: JSON.stringify({ externalRefs: { ...(sale?.externalRefs ?? {}), coverCount: current + 1 } }) });
                    await refreshSale(sid);
                  } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
                }}
              >
                +
              </button>
              <span className="text-xs text-neutral-500">
                {((sale?.externalRefs?.coverCount as number | undefined) ?? 1) === 1 ? "persona" : "personas"}
              </span>
            </div>
          </div>

          {sale?.saleType === "MESA" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-medium">Mesa (obligatorio)</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={sale.tableId ?? ""}
                  onChange={async (ev) => {
                    const id = ev.target.value || null;
                    await patchSale({ tableId: id });
                  }}
                >
                  <option value="">—</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {sale?.saleType === "RESERVA" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-medium">Fecha y hora (obligatorio)</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={sale.reservationAt ? toDatetimeLocal(sale.reservationAt) : ""}
                  onChange={async (ev) => {
                    const v = ev.target.value;
                    await patchSale({ reservationAt: v ? new Date(v).toISOString() : null });
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {upcomingReservations.length > 0 ? (
          <div className="rounded-lg border bg-amber-50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-amber-800">
                Reservas próximas ({upcomingReservations.length})
              </div>
              <button
                type="button"
                className="text-xs text-amber-600 hover:underline"
                onClick={() => setReservationsCollapsed((v) => !v)}
              >
                {reservationsCollapsed ? "Ver" : "Ocultar"}
              </button>
            </div>
            {!reservationsCollapsed && (
              <div className="mt-2 space-y-1">
                {upcomingReservations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{r.customerName}</span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {new Date(r.reservationAt!).toLocaleString("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {r.coverCount ? <span className="ml-2 text-xs text-neutral-400">· {r.coverCount} pers.</span> : null}
                    </div>
                    <button
                      type="button"
                      className="ml-3 rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                      onClick={async () => {
                        setSaleId(r.id);
                        await refreshSale(r.id);
                      }}
                    >
                      Cargar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {planCapReached ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este cliente llegó al tope de su tarifa. Para agregar otro producto, retirá uno del carrito.
          </div>
        ) : null}

        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2 text-sm font-semibold">Productos</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {products
              .filter((p) => {
                if (!allowedPlanConfig) return true;
                const selectedCat = categories.find((c) => c.id === selectedCategoryId);
                if (!selectedCat?.name.toLowerCase().includes("corporat")) return true;
                const name = p.name.toLowerCase();
                if (allowedPlanConfig.corpoFilter === "all") return true;
                if (allowedPlanConfig.corpoFilter === "corpo2") return name.includes("corpo 2");
                if (allowedPlanConfig.corpoFilter === "corpo2_basic")
                  return name.includes("corpo 2") && (name.includes("snack") || name.includes("brunch"));
                return true;
              })
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={planCapReached}
                  className={cn(
                    "rounded-lg border p-3 text-left",
                    planCapReached ? "cursor-not-allowed opacity-40" : "hover:bg-neutral-50"
                  )}
                  onClick={async () => {
                    if (planCapReached) return;
                    try {
                      setError(null);
                      const sid = await ensureSale();
                      const details = await apiGet<{ product: ProductDetails }>(`/api/pos/products/${p.id}`);
                      if (details.product.modifierGroups.length === 0) {
                        await apiJson(`/api/pos/sales/${sid}/items`, {
                          method: "POST",
                          body: JSON.stringify({ productId: p.id, qty: 1, selectedOptionIds: [] }),
                        });
                        await refreshSale(sid);
                        return;
                      }
                      setModals({ product: details.product, selectedOptionIds: [] });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="mt-1 text-xs text-neutral-600">{formatArsFromCents(p.priceCents)}</div>
                </button>
              ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Carrito</div>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => setPaymentsOpen(true)}
            disabled={!saleId}
          >
            Cobrar
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {!sale ? (
            <div className="text-sm text-neutral-600">Creá una venta para empezar.</div>
          ) : sale.items.length === 0 ? (
            <div className="text-sm text-neutral-600">Agregá productos.</div>
          ) : (
            sale.items.map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{item.product.name}</div>
                    {item.modifiers.length ? (
                      <div className="mt-1 text-xs text-neutral-600">
                        {groupModifiers(item.modifiers).map((g) => (
                          <div key={g.groupId}>
                            <b>{g.groupName}:</b> {g.options.join(", ")}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1 text-xs text-neutral-600">
                      {formatArsFromCents(item.unitPriceCents)} c/u
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{formatArsFromCents(item.lineTotalCents)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded-md border text-sm"
                      onClick={async () => {
                        if (!saleId) return;
                        try {
                          setError(null);
                          await apiJson(`/api/pos/sales/${saleId}/items/${item.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ qty: Math.max(0, item.qty - 1) }),
                          });
                          await refreshSale(saleId);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error");
                        }
                      }}
                    >
                      −
                    </button>
                    <div className="w-6 text-center text-sm">{item.qty}</div>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-md border text-sm"
                      onClick={async () => {
                        if (!saleId) return;
                        try {
                          setError(null);
                          await apiJson(`/api/pos/sales/${saleId}/items/${item.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ qty: item.qty + 1 }),
                          });
                          await refreshSale(saleId);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Error");
                        }
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      if (!saleId) return;
                      try {
                        setError(null);
                        await apiJson(`/api/pos/sales/${saleId}/items/${item.id}`, { method: "DELETE" });
                        await refreshSale(saleId);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error");
                      }
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 border-t pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-semibold">{formatArsFromCents(sale?.subtotalCents ?? 0)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-neutral-600">Total</span>
            <span className="text-base font-semibold">{formatArsFromCents(sale?.totalCents ?? 0)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-neutral-600">Pagado</span>
            <span className="font-semibold">{formatArsFromCents(paidTotalCents)}</span>
          </div>
        </div>

        {saleSuccess !== null ? (
          <div className="mt-3 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-center">
            <div className="text-lg font-bold text-green-700">Venta completada</div>
            <div className="mt-1 text-sm text-green-600">{formatArsFromCents(saleSuccess)}</div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {sale?.saleType === "MOSTRADOR" ? (
              <button
                type="button"
                className={cn(
                  "col-span-2 rounded-md px-3 py-2 text-sm font-medium",
                  canFinalizeMostrador ? "bg-green-700 text-white" : "bg-neutral-200 text-neutral-500"
                )}
                disabled={!canFinalizeMostrador || !saleId}
                onClick={async () => {
                  if (!saleId || !sale) return;
                  try {
                    setError(null);
                    await apiJson(`/api/pos/sales/${saleId}/confirm`, { method: "POST" });
                    await apiJson(`/api/pos/sales/${saleId}/mark-paid`, { method: "POST" });
                    setSaleSuccess(sale.totalCents);
                    setPaymentsOpen(false);
                    setTimeout(() => {
                      setSaleSuccess(null);
                      setSaleId(null);
                      setSale(null);
                      setError(null);
                    }, 2000);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                {canFinalizeMostrador
                  ? "Finalizar venta"
                  : !sale.items.length
                    ? "Agregá productos primero"
                    : !hasCustomer
                      ? "Falta el nombre del cliente"
                      : !hasCoverCount
                        ? "Indicá cuántas personas son"
                        : paidTotalCents < sale.totalCents
                          ? "Falta registrar el pago"
                          : "Finalizar venta"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium",
                    canConfirm ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"
                  )}
                  disabled={!canConfirm || !saleId}
                  onClick={async () => {
                    if (!saleId) return;
                    try {
                      setError(null);
                      await apiJson(`/api/pos/sales/${saleId}/confirm`, { method: "POST" });
                      await refreshSale(saleId);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Confirmar pedido
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium",
                    canMarkPaid ? "hover:bg-neutral-50" : "text-neutral-400"
                  )}
                  disabled={!saleId || !canMarkPaid}
                  onClick={async () => {
                    if (!saleId) return;
                    try {
                      setError(null);
                      await apiJson(`/api/pos/sales/${saleId}/mark-paid`, { method: "POST" });
                      await refreshSale(saleId);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Marcar pagado
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {modals.product ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">{modals.product.name}</div>
                <div className="mt-1 text-sm text-neutral-600">
                  {formatArsFromCents(
                    modals.product.priceCents +
                    modals.selectedOptionIds.reduce((sum, id) => {
                      const opt = modals.product!.modifierGroups
                        .flatMap((g) => g.options)
                        .find((o) => o.id === id);
                      return sum + (opt?.priceDeltaCents ?? 0);
                    }, 0)
                  )}
                  {modals.selectedOptionIds.length > 0 ? " (con agregados)" : ""}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setModals({ product: null, selectedOptionIds: [] })}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-3 space-y-5">
              {modals.product.modifierGroups.map((g) => {
                const selected = new Set(modals.selectedOptionIds);
                const isSingle = g.maxSelect === 1;
                const groupSelectedCount = g.options.filter((o) => selected.has(o.id)).length;

                const optionNames = g.options.map((o) => o.name);
                let groupQuestion: string;
                if (g.minSelect > 0) {
                  groupQuestion = `Elegí una opción:`;
                } else if (optionNames.length === 1) {
                  groupQuestion = `¿Le ponemos ${optionNames[0]}?`;
                } else {
                  groupQuestion = `¿Le sumamos ${optionNames.slice(0, -1).join(", ")} o ${optionNames[optionNames.length - 1]}?`;
                }

                return (
                  <div key={g.id}>
                    <div className="mb-3 text-base font-semibold">
                      {groupQuestion}
                      {g.minSelect > 0 && groupSelectedCount < g.minSelect ? (
                        <span className="ml-2 text-sm font-normal text-red-600">Elegí al menos {g.minSelect}</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {g.options.map((o) => {
                        const checked = selected.has(o.id);
                        const priceLabel = o.priceDeltaCents === 0
                          ? "incluido"
                          : `${o.priceDeltaCents > 0 ? "+" : ""}${formatArsFromCents(o.priceDeltaCents)}`;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className={cn(
                              "flex items-center justify-between rounded-xl border-2 px-5 py-4 text-left transition-colors",
                              checked
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : "border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
                            )}
                            onClick={() => {
                              setModals((prev) => {
                                const next = new Set(prev.selectedOptionIds);
                                if (isSingle) {
                                  for (const opt of g.options) next.delete(opt.id);
                                  if (!checked) next.add(o.id);
                                } else {
                                  if (checked) next.delete(o.id);
                                  else next.add(o.id);
                                }
                                return { ...prev, selectedOptionIds: [...next] };
                              });
                            }}
                          >
                            <span className="text-base font-semibold">{o.name}</span>
                            <span className={cn(
                              "ml-4 text-lg font-bold",
                              checked ? "text-white" : o.priceDeltaCents > 0 ? "text-green-600" : "text-neutral-500"
                            )}>
                              {priceLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setModals({ product: null, selectedOptionIds: [] })}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                onClick={async () => {
                  if (!modals.product) return;
                  try {
                    setError(null);
                    const sid = await ensureSale();
                    await apiJson(`/api/pos/sales/${sid}/items`, {
                      method: "POST",
                      body: JSON.stringify({
                        productId: modals.product.id,
                        qty: 1,
                        selectedOptionIds: modals.selectedOptionIds,
                      }),
                    });
                    await refreshSale(sid);
                    setModals({ product: null, selectedOptionIds: [] });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentsOpen && saleId && sale ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Cobro</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Total: {formatArsFromCents(sale.totalCents)} · Restante:{" "}
                  {formatArsFromCents(Math.max(0, sale.totalCents - paidTotalCents))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50"
                  onClick={() => {
                    setError(null);
                    setLossModalOpen(true);
                  }}
                >
                  Registrar merma
                </button>
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-sm"
                  onClick={() => setPaymentsOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {paidTotalCents >= sale.totalCents ? (
              <div className="mt-3 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-center">
                <div className="text-sm font-semibold text-green-700">Pago completo</div>
                <div className="mt-1 text-xs text-green-600">
                  Ya registraste {formatArsFromCents(paidTotalCents)} — cerrá el cobro y finalizá la venta.
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Método</label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="CREDITO">Crédito</option>
                      <option value="DEBITO">Débito</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="QR">QR</option>
                      <option value="CUENTA_CORRIENTE">Cuenta corriente</option>
                      <option value="CUENTAS_INTERNAS">Cuentas internas</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="w-full rounded-md border py-2 pl-7 pr-3 text-sm"
                        value={paymentAmount / 100}
                        onChange={(e) => setPaymentAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
                      />
                    </div>
                  </div>
                </div>

                {paymentMethod === "CUENTA_CORRIENTE" ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium">Cuenta corriente (obligatorio)</label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value)}
                    >
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.customer.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {paymentMethod === "CUENTAS_INTERNAS" ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium">Asociada/o (obligatorio)</label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={paymentEmployeeId}
                      onChange={(e) => setPaymentEmployeeId(e.target.value)}
                    >
                      <option value="">—</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm">
                    Pagos:{" "}
                    <b>
                      {sale.payments.length} · {formatArsFromCents(paidTotalCents)}
                    </b>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                    onClick={async () => {
                      try {
                        setError(null);
                        await apiJson(`/api/pos/sales/${saleId}/payments`, {
                          method: "POST",
                          body: JSON.stringify({
                            method: paymentMethod,
                            amountCents: paymentAmount,
                            cuentaCorrienteAccountId:
                              paymentMethod === "CUENTA_CORRIENTE" ? paymentAccountId || null : null,
                            employeeId:
                              paymentMethod === "CUENTAS_INTERNAS" ? paymentEmployeeId || null : null,
                          }),
                        });
                        await refreshSale(saleId);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error");
                      }
                    }}
                  >
                    Agregar pago
                  </button>
                </div>
              </>
            )}

            {sale.payments.length ? (
              <div className="mt-3 max-h-40 space-y-2 overflow-auto rounded-md border p-2 text-sm">
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="text-neutral-700">
                      <b>{p.method}</b>
                      {p.cuentaCorrienteAccount?.customer ? (
                        <span className="text-neutral-500"> · {p.cuentaCorrienteAccount.customer.displayName}</span>
                      ) : null}
                      {p.employee?.displayName ? (
                        <span className="text-neutral-500"> · {p.employee.displayName}</span>
                      ) : null}
                    </div>
                    <div className="font-semibold">{formatArsFromCents(p.amountCents)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {lossModalOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Registrar merma</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Motivo: <b>DURING_SALE_PREP</b> · Ubicación: <b>BACOÑA</b>
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setLossModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {!inventoryItems.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No hay ítems de stock cargados. Crealos en <b>Stock</b> para poder registrar mermas desde el POS.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-700 sm:col-span-2">
                  Ítem
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={lossForm.inventoryItemId}
                    onChange={(e) => setLossForm((p) => ({ ...p, inventoryItemId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.unit})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-neutral-700">
                  Cantidad
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={lossForm.qty}
                    min={0}
                    step="0.001"
                    onChange={(e) => setLossForm((p) => ({ ...p, qty: e.target.value }))}
                  />
                </label>

                <label className="text-xs text-neutral-700">
                  Notas (opcional)
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Ej: se cayó al piso"
                    value={lossForm.notes}
                    onChange={(e) => setLossForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                  onClick={() => setLossModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-500"
                  disabled={!lossForm.inventoryItemId || Number(lossForm.qty) <= 0}
                  onClick={async () => {
                    try {
                      setError(null);
                      await apiJson("/api/mermas/loss-events", {
                        method: "POST",
                        body: JSON.stringify({
                          reasonType: "DURING_SALE_PREP",
                          locationCode: "BACONA",
                          notes: lossForm.notes.trim() ? lossForm.notes.trim() : null,
                          lines: [
                            {
                              inventoryItemId: lossForm.inventoryItemId,
                              qty: Number(lossForm.qty),
                            },
                          ],
                        }),
                      });
                      setLossForm((p) => ({ ...p, qty: "1", notes: "" }));
                      setLossModalOpen(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Registrar merma
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function groupModifiers(mods: SaleItemModifier[]) {
  const map = new Map<string, { groupId: string; groupName: string; options: string[] }>();
  for (const m of mods) {
    const gid = m.modifierOption.group.id;
    const entry =
      map.get(gid) ?? { groupId: gid, groupName: m.modifierOption.group.name, options: [] };
    entry.options.push(m.modifierOption.name);
    map.set(gid, entry);
  }
  return [...map.values()];
}

function SaleTypeTabs(props: { value: SaleType; onChange: (v: SaleType) => void }) {
  const options: Array<{ id: SaleType; label: string }> = [
    { id: "MOSTRADOR", label: "Mostrador" },
    { id: "MESA", label: "Mesas" },
    { id: "RESERVA", label: "Reservas" },
  ];
  return (
    <div className="inline-flex rounded-md border p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium",
            props.value === o.id ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
          )}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

