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

type SessionSale = {
  id: string;
  saleType: SaleType;
  status: SaleStatus;
  totalCents: number;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  customerNameFreeText: string | null;
  customer: { displayName: string } | null;
  cuentaCorrienteAccount: { customer: { displayName: string } } | null;
  table: { label: string } | null;
  items: Array<{ qty: number; product: { name: string } }>;
  payments: Array<{
    method: PaymentMethod;
    amountCents: number;
    cuentaCorrienteAccount?: { customer: { displayName: string } } | null;
    employee?: { displayName: string } | null;
  }>;
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

const MODE_CONFIG: Record<SaleType, { label: string; activeBg: string; badgeBg: string; borderL: string; btnActive: string }> = {
  MOSTRADOR: { label: "Mostrador", activeBg: "bg-green-600 text-white",  badgeBg: "bg-green-600",  borderL: "border-l-green-500",  btnActive: "bg-green-600 text-white" },
  MESA:      { label: "Mesas",     activeBg: "bg-amber-500 text-white",  badgeBg: "bg-amber-500",  borderL: "border-l-amber-400",  btnActive: "bg-amber-500 text-white" },
  RESERVA:   { label: "Reservas",  activeBg: "bg-violet-600 text-white", badgeBg: "bg-violet-600", borderL: "border-l-violet-500", btnActive: "bg-violet-600 text-white" },
};

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

  const [pendingCustomerName, setPendingCustomerName] = useState("");

  const [cancelDraftOpen, setCancelDraftOpen] = useState(false);
  const [cancelDraftLoading, setCancelDraftLoading] = useState(false);
  const [cancelDraftError, setCancelDraftError] = useState<string | null>(null);

  const [sessionSalesOpen, setSessionSalesOpen] = useState(false);
  const [sessionSales, setSessionSales] = useState<SessionSale[]>([]);
  const [sessionSalesLoading, setSessionSalesLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState<SessionSale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

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

  async function loadSessionSales() {
    setSessionSalesLoading(true);
    try {
      const data = await apiGet<{ sales: SessionSale[] }>("/api/pos/sales/session-sales");
      setSessionSales(data.sales);
    } catch {
      // ignore
    } finally {
      setSessionSalesLoading(false);
    }
  }

  async function ensureSale(): Promise<string> {
    if (saleId) return saleId;
    const created = await apiJson<{ sale: { id: string } }>("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify({ saleType: saleTypeDraft }),
    });
    const sid = created.sale.id;
    setSaleId(sid);
    if (pendingCustomerName.trim()) {
      await apiJson(`/api/pos/sales/${sid}`, {
        method: "PATCH",
        body: JSON.stringify({ customerNameFreeText: pendingCustomerName }),
      });
      setPendingCustomerName("");
    }
    await refreshSale(sid);
    return sid;
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

  const hasCustomer = useMemo(() => true, []);

  const hasCoverCount = useMemo(() => {
    if (!saleId || !sale) return false;
    const count = sale.externalRefs?.coverCount;
    return typeof count === "number" && count >= 1;
  }, [saleId, sale]);

  const allowedPlanConfig = useMemo(() => {
    if (!selectedPlanCode) return null;
    const configs: Record<string, {
      showSnacks: boolean;
      showBebidas: boolean;
      corpoFilter: "all" | "corpo1" | "corpo2" | "corpo2_basic";
      cartaLibre: boolean;
      capCentsPerPerson: number | null;
    }> = {
      CORPO1:             { showSnacks: false, showBebidas: false, corpoFilter: "corpo1", cartaLibre: false, capCentsPerPerson: null },
      CORPO1_SNACKS:      { showSnacks: true,  showBebidas: true,  corpoFilter: "corpo1", cartaLibre: false, capCentsPerPerson: null },
      CORPO2:             { showSnacks: false, showBebidas: false, corpoFilter: "corpo2", cartaLibre: false, capCentsPerPerson: null },
      CORPO2_SNACKS:      { showSnacks: true,  showBebidas: true,  corpoFilter: "corpo2", cartaLibre: false, capCentsPerPerson: null },
      CORPO2_CARTA_LIBRE: { showSnacks: true,  showBebidas: true,  corpoFilter: "corpo2", cartaLibre: true,  capCentsPerPerson: null },
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
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2">
            <div className="text-sm font-semibold">Categorías</div>
          </div>
          <div className="space-y-1">
            {categories
              .filter((c) => {
                if (!allowedPlanConfig) return true;
                if (allowedPlanConfig.cartaLibre) return true;
                const name = c.name.toLowerCase();
                if (name.includes("corporat")) return true;
                if (allowedPlanConfig.showSnacks && name.includes("snack")) return true;
                if (allowedPlanConfig.showBebidas && name.includes("bebida")) return true;
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

        {upcomingReservations.length > 0 ? (
          <div className="rounded-lg border bg-amber-50 p-2">
            <div className="mb-1.5 text-xs font-semibold text-amber-800">
              Reservas próximas ({upcomingReservations.length})
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {upcomingReservations.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.customerName}</span>
                    <span className="ml-1.5 text-neutral-500">
                      {new Date(r.reservationAt!).toLocaleString("es-AR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {r.coverCount ? <span className="ml-1 text-neutral-400">· {r.coverCount}p</span> : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded border px-2 py-0.5 hover:bg-neutral-50"
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
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className={cn("rounded-lg border bg-white p-3 border-l-4", MODE_CONFIG[sale?.saleType ?? saleTypeDraft].borderL)}>
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
                  <span className="font-normal text-neutral-400">(opcional)</span>
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Ej: Gimena"
                  value={sale?.customerNameFreeText ?? pendingCustomerName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (sale) {
                      setSale((prev) => (prev ? { ...prev, customerNameFreeText: val } : prev));
                    } else {
                      setPendingCustomerName(val);
                    }
                  }}
                  onBlur={async () => {
                    if (!saleId) return;
                    await patchSale({ customerNameFreeText: sale?.customerNameFreeText ?? null });
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium">
              Comensales{" "}
              <span className={cn("font-normal", saleId && !hasCoverCount ? "text-red-500" : "text-neutral-400")}>
                (requerido)
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50 disabled:opacity-40"
                disabled={(sale?.externalRefs?.coverCount ?? 0) <= 0}
                onClick={async () => {
                  const sid = saleId ?? await ensureSale().catch(() => null);
                  if (!sid) return;
                  const current = (sale?.externalRefs?.coverCount as number | undefined) ?? 0;
                  const next = Math.max(0, current - 1);
                  await apiJson(`/api/pos/sales/${sid}`, { method: "PATCH", body: JSON.stringify({ externalRefs: { ...(sale?.externalRefs ?? {}), coverCount: next } }) });
                  await refreshSale(sid);
                }}
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-sm font-semibold">
                {(sale?.externalRefs?.coverCount as number | undefined) ?? 0}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50"
                onClick={async () => {
                  try {
                    const sid = saleId ?? await ensureSale();
                    const current = (sale?.externalRefs?.coverCount as number | undefined) ?? 0;
                    await apiJson(`/api/pos/sales/${sid}`, { method: "PATCH", body: JSON.stringify({ externalRefs: { ...(sale?.externalRefs ?? {}), coverCount: current + 1 } }) });
                    await refreshSale(sid);
                  } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
                }}
              >
                +
              </button>
              <span className="text-xs text-neutral-500">
                {((sale?.externalRefs?.coverCount as number | undefined) ?? 0) === 1 ? "persona" : "personas"}
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
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-medium">
                Fecha y hora{" "}
                <span className={cn("font-normal", saleId && !sale.reservationAt ? "text-red-500" : "text-neutral-400")}>
                  (obligatorio)
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3].map((offset) => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const resDate = sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(0, 10) : "";
                  const resTime = sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(11, 16) : "";
                  const label = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        resDate === iso ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"
                      )}
                      onClick={async () => {
                        const time = resTime || "12:00";
                        await patchSale({ reservationAt: new Date(`${iso}T${time}:00`).toISOString() });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
                <input
                  type="date"
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(0, 10) : ""}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    const time = sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(11, 16) : "12:00";
                    await patchSale({ reservationAt: new Date(`${e.target.value}T${time}:00`).toISOString() });
                  }}
                />
              </div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(11, 16) : ""}
                onChange={async (e) => {
                  const date = sale.reservationAt ? toDatetimeLocal(sale.reservationAt).slice(0, 10) : "";
                  if (!e.target.value || !date) return;
                  await patchSale({ reservationAt: new Date(`${date}T${e.target.value}:00`).toISOString() });
                }}
              >
                <option value="">— Hora —</option>
                {Array.from({ length: 28 }, (_, i) => {
                  const totalMin = 600 + i * 30;
                  const h = Math.floor(totalMin / 60);
                  const m = totalMin % 60;
                  const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  return <option key={t} value={t}>{t}</option>;
                })}
              </select>
            </div>
          ) : null}
        </div>


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
                if (!selectedCat) return true;
                const catName = selectedCat.name.toLowerCase();
                if (catName.includes("bebida")) {
                  const pname = p.name.toLowerCase();
                  return !pname.includes("cerveza") && !pname.includes("energizante");
                }
                if (!catName.includes("corporat")) return true;
                const pname = p.name.toLowerCase();
                const { corpoFilter } = allowedPlanConfig;
                if (corpoFilter === "all") return true;
                if (corpoFilter === "corpo1") return pname.includes("corpo 1");
                if (corpoFilter === "corpo2") return pname.includes("corpo 2");
                if (corpoFilter === "corpo2_basic")
                  return pname.includes("corpo 2") && (pname.includes("snack") || pname.includes("brunch"));
                return true;
              })
              .sort((a, b) => {
                const selectedCat = categories.find((c) => c.id === selectedCategoryId);
                if (!selectedCat?.name.toLowerCase().includes("corporat")) return 0;
                const key = (name: string) => {
                  const n = name.toLowerCase();
                  const tier = n.includes("corpo 1") ? 0 : 10;
                  const type = n.includes("snack") ? 1 : n.includes("brunch") ? 2 : 3;
                  return tier + type;
                };
                return key(a.name) - key(b.name);
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
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Carrito</div>
            <span className={cn("rounded px-2 py-0.5 text-xs font-semibold text-white", MODE_CONFIG[sale?.saleType ?? saleTypeDraft].badgeBg)}>
              {MODE_CONFIG[sale?.saleType ?? saleTypeDraft].label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border px-2 py-1.5 text-xs hover:bg-neutral-50"
              onClick={() => { loadSessionSales(); setSessionSalesOpen(true); }}
            >
              Ventas del turno
            </button>
            {saleId && sale && (sale.status === "DRAFT" || sale.status === "CONFIRMED") ? (
              <button
                type="button"
                className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
                onClick={() => { setCancelDraftError(null); setCancelDraftOpen(true); }}
              >
                Cancelar venta
              </button>
            ) : saleId && sale && (sale.status === "PAID" || sale.status === "CANCELLED") ? (
              <button
                type="button"
                className="rounded-md border px-2 py-1.5 text-xs hover:bg-neutral-50"
                onClick={() => {
                  setSaleId(null); setSale(null); setPaymentsOpen(false);
                  setSaleSuccess(null); setError(null); setPendingCustomerName("");
                }}
              >
                Nueva venta
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => setPaymentsOpen(true)}
              disabled={!saleId}
            >
              Cobrar
            </button>
          </div>
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
                  canFinalizeMostrador ? MODE_CONFIG.MOSTRADOR.btnActive : "bg-neutral-200 text-neutral-500"
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
                    canConfirm ? MODE_CONFIG[sale?.saleType === "MESA" ? "MESA" : "RESERVA"].btnActive : "bg-neutral-200 text-neutral-500"
                  )}
                  disabled={!canConfirm || !saleId}
                  onClick={async () => {
                    if (!saleId) return;
                    try {
                      setError(null);
                      await apiJson(`/api/pos/sales/${saleId}/confirm`, { method: "POST" });
                      if (sale?.saleType === "RESERVA") {
                        setSaleId(null);
                        setSale(null);
                        setPendingCustomerName("");
                        setPaymentsOpen(false);
                      } else {
                        await refreshSale(saleId);
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  {sale?.saleType === "RESERVA" ? "Guardar reserva" : "Confirmar pedido"}
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
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
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
                if (g.name.startsWith("¿")) {
                  groupQuestion = g.name;
                } else if (g.minSelect > 0) {
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
                    <label className="block text-xs font-medium">Cuenta corriente</label>
                    {sale.cuentaCorrienteAccountId ? (
                      <div className="rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        {accounts.find((a) => a.id === sale.cuentaCorrienteAccountId)?.customer.displayName ?? "—"}
                      </div>
                    ) : (
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
                    )}
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
                              paymentMethod === "CUENTA_CORRIENTE"
                                ? (sale.cuentaCorrienteAccountId || paymentAccountId || null)
                                : null,
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

      {cancelDraftOpen && sale && saleId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
            <div className="text-base font-semibold">¿Cancelar la venta en curso?</div>

            <div className="mt-2 text-sm text-neutral-600">
              {sale.items.length === 0
                ? "La venta está vacía."
                : `${sale.items.length} ítem${sale.items.length > 1 ? "s" : ""} · ${formatArsFromCents(sale.totalCents)}`}
            </div>

            {sale.status === "CONFIRMED" ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El pedido está confirmado — se revertirá el descuento de stock.
              </div>
            ) : null}

            {cancelDraftError ? (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {cancelDraftError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                disabled={cancelDraftLoading}
                onClick={() => setCancelDraftOpen(false)}
              >
                No, seguir
              </button>
              <button
                type="button"
                className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-500"
                disabled={cancelDraftLoading}
                onClick={async () => {
                  setCancelDraftLoading(true);
                  setCancelDraftError(null);
                  try {
                    await apiJson(`/api/pos/sales/${saleId}/cancel`, { method: "POST" });
                    setCancelDraftOpen(false);
                    setSaleId(null);
                    setSale(null);
                    setPaymentsOpen(false);
                    setSaleSuccess(null);
                    setError(null);
                    setPendingCustomerName("");
                  } catch (e) {
                    setCancelDraftError(e instanceof Error ? e.message : "Error al cancelar");
                  } finally {
                    setCancelDraftLoading(false);
                  }
                }}
              >
                {cancelDraftLoading ? "Cancelando..." : "Sí, cancelar venta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sessionSalesOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 p-4 border-b">
              <div className="text-base font-semibold">Ventas del turno</div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setSessionSalesOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {sessionSalesLoading ? (
                <div className="py-8 text-center text-sm text-neutral-500">Cargando...</div>
              ) : sessionSales.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-500">
                  No hay ventas finalizadas en este turno.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionSales.map((s) => {
                    const isCancelled = s.status === "CANCELLED";
                    const customerLabel =
                      s.cuentaCorrienteAccount?.customer.displayName ??
                      s.customer?.displayName ??
                      s.customerNameFreeText ??
                      "Mostrador";
                    const itemsLabel = s.items
                      .map((it) => `${it.qty}× ${it.product.name}`)
                      .join(", ");
                    const payLabel = s.payments
                      .map((p) => {
                        const methodNames: Record<string, string> = {
                          EFECTIVO: "Efectivo",
                          CREDITO: "Crédito",
                          DEBITO: "Débito",
                          TRANSFERENCIA: "Transf.",
                          QR: "QR",
                          CUENTA_CORRIENTE: "CC",
                          CUENTAS_INTERNAS: "Interno",
                        };
                        const name = methodNames[p.method] ?? p.method;
                        const who =
                          p.cuentaCorrienteAccount?.customer.displayName ??
                          p.employee?.displayName ??
                          null;
                        return who ? `${name} (${who})` : name;
                      })
                      .join(" + ");

                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "rounded-lg border p-3",
                          isCancelled ? "opacity-50" : ""
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{customerLabel}</span>
                              <span className="text-xs text-neutral-500">
                                {new Date(s.createdAt).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {isCancelled ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 line-through">
                                  Anulada
                                </span>
                              ) : s.status === "DRAFT" ? (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                                  Sin confirmar
                                </span>
                              ) : s.status === "CONFIRMED" ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                  Confirmada
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                  Pagada
                                </span>
                              )}
                              {s.table ? (
                                <span className="text-xs text-neutral-500">{s.table.label}</span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-neutral-600 truncate">{itemsLabel}</div>
                            <div className="mt-0.5 text-xs text-neutral-500">{payLabel}</div>
                            {isCancelled && s.cancellationReason ? (
                              <div className="mt-1 text-xs text-red-600">
                                Motivo: {s.cancellationReason}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-sm font-semibold">
                              {formatArsFromCents(s.totalCents)}
                            </span>
                            {!isCancelled && s.status !== "DRAFT" ? (
                              <button
                                type="button"
                                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setVoidTarget(s);
                                  setVoidReason("");
                                  setVoidError(null);
                                }}
                              >
                                Anular
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {voidTarget ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="text-base font-semibold">Anular venta</div>
            <div className="mt-1 text-sm text-neutral-600">
              {(
                voidTarget.cuentaCorrienteAccount?.customer.displayName ??
                voidTarget.customer?.displayName ??
                voidTarget.customerNameFreeText ??
                "Mostrador"
              )} · {formatArsFromCents(voidTarget.totalCents)}
            </div>

            <div className="mt-3 rounded-md border bg-neutral-50 p-2 text-xs text-neutral-700 max-h-24 overflow-y-auto">
              {voidTarget.items.map((it, i) => (
                <div key={i}>{it.qty}× {it.product.name}</div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-medium">Motivo (obligatorio)</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              >
                <option value="">— Seleccioná un motivo —</option>
                <option value="Error en método de pago">Error en método de pago</option>
                <option value="Cuenta corriente incorrecta">Cuenta corriente incorrecta</option>
                <option value="Productos o cantidades incorrectas">Productos o cantidades incorrectas</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {voidError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {voidError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                disabled={voidLoading}
                onClick={() => { setVoidTarget(null); setVoidError(null); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-500"
                disabled={!voidReason || voidLoading}
                onClick={async () => {
                  if (!voidTarget || !voidReason) return;
                  setVoidLoading(true);
                  setVoidError(null);
                  try {
                    await apiJson(`/api/pos/sales/${voidTarget.id}/cancel`, {
                      method: "POST",
                      body: JSON.stringify({ reason: voidReason }),
                    });
                    setVoidTarget(null);
                    setVoidReason("");
                    await loadSessionSales();
                  } catch (e) {
                    setVoidError(e instanceof Error ? e.message : "Error al anular la venta");
                  } finally {
                    setVoidLoading(false);
                  }
                }}
              >
                {voidLoading ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
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
            props.value === o.id ? MODE_CONFIG[o.id].activeBg : "text-neutral-700 hover:bg-neutral-100"
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

