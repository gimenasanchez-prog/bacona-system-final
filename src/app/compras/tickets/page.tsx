"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatArsFromCents } from "@/lib/money";

type TicketStatus = "PENDING_REVIEW" | "CONFIRMED" | "DISCARDED" | "ERROR";
type TicketRow = {
  id: string;
  driveFileName: string;
  status: TicketStatus;
  errorMessage: string | null;
  supplierNameRaw: string | null;
  purchasedAt: string | null;
  totalCents: number | null;
  createdAt: string;
  reviewedAt: string | null;
  supplier: { name: string } | null;
  reviewedByEmployee: { displayName: string } | null;
  _count: { lines: number };
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  PENDING_REVIEW: "Por revisar",
  CONFIRMED: "Cargado",
  DISCARDED: "Descartado",
  ERROR: "No se pudo leer",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  DISCARDED: "bg-neutral-100 text-neutral-600",
  ERROR: "bg-red-100 text-red-800",
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    const res = await fetch("/api/compras/tickets", { cache: "no-store" });
    if (!res.ok) throw new Error((await res.text()) || `No se pudieron cargar los tickets (error ${res.status})`);
    const json = (await res.json()) as { tickets: TicketRow[] };
    setTickets(json.tickets);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  async function runImport() {
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/compras/tickets/run", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? res.statusText);
      if (json.skipped) setInfo("Ya hay una búsqueda en curso. Probá de nuevo en un minuto.");
      else if (!json.found) setInfo("No hay tickets nuevos en la carpeta.");
      else
        setInfo(
          `Se leyeron ${json.created} ticket${json.created === 1 ? "" : "s"}` +
            (json.errors ? ` (${json.errors} no se pudieron leer)` : "") +
            ".",
        );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRunning(false);
    }
  }

  const pendingCount = tickets.filter((t) => t.status === "PENDING_REVIEW" || t.status === "ERROR").length;
  const visible = showAll ? tickets : tickets.filter((t) => t.status === "PENDING_REVIEW" || t.status === "ERROR");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Tickets de compra</div>
          <div className="text-sm text-neutral-600">
            Comprobantes subidos a la carpeta de Drive. Revisá cada uno y confirmalo para cargarlo al stock.
          </div>
        </div>
        <div className="grid w-full grid-cols-[auto_1fr] gap-2 sm:flex sm:w-auto">
          <Link href="/compras" className="rounded-md border px-3 py-2.5 text-sm hover:bg-neutral-50 sm:py-2">
            Volver
          </Link>
          <button
            type="button"
            onClick={runImport}
            disabled={running}
            className={
              running
                ? "rounded-md bg-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-500 sm:py-2"
                : "rounded-md bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white sm:py-2"
            }
          >
            {running ? "Leyendo tickets… (puede tardar)" : "Buscar tickets nuevos"}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {info ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{info}</div> : null}

      <div className="rounded-lg border bg-white p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-base font-semibold sm:text-sm">
            {showAll ? "Todos los tickets" : `Por revisar (${pendingCount})`}
          </div>
          <label className="flex items-center gap-2 py-1 text-sm text-neutral-700 sm:text-xs">
            <input type="checkbox" className="h-4 w-4" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Mostrar también cargados y descartados
          </label>
        </div>

        {/* Celular: tarjetas tocables */}
        <div className="mt-2 space-y-2 md:hidden">
          {visible.map((t) => (
            <Link key={t.id} href={`/compras/tickets/${t.id}`}
              className="block rounded-md border p-3 active:bg-neutral-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.supplier?.name ?? t.supplierNameRaw ?? "Proveedor sin leer"}</div>
                  <div className="text-sm text-neutral-500">
                    {t.purchasedAt ? new Date(t.purchasedAt).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "Sin fecha"}
                    {" · "}{t._count.lines} productos
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium">{t.totalCents != null ? formatArsFromCents(t.totalCents) : "—"}</div>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span className="truncate">{t.driveFileName}</span>
                <span className="shrink-0 font-medium text-neutral-900">
                  {t.status === "PENDING_REVIEW" ? "Revisar →" : "Ver →"}
                </span>
              </div>
            </Link>
          ))}
          {!visible.length ? (
            <div className="py-8 text-center text-sm text-neutral-600">
              {showAll ? "Todavía no se leyó ningún ticket." : "No hay tickets por revisar."}
            </div>
          ) : null}
        </div>

        <div className="mt-2 hidden overflow-auto rounded-md border md:block">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Archivo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    {t.reviewedByEmployee ? (
                      <div className="mt-1 text-xs text-neutral-500">por {t.reviewedByEmployee.displayName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.supplier?.name ?? t.supplierNameRaw ?? "—"}</div>
                    <div className="text-xs text-neutral-500">{t._count.lines} productos</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.purchasedAt ? new Date(t.purchasedAt).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.totalCents != null ? formatArsFromCents(t.totalCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{t.driveFileName}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/compras/tickets/${t.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 whitespace-nowrap"
                    >
                      {t.status === "PENDING_REVIEW" ? "Revisar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
              {!visible.length ? (
                <tr>
                  <td className="px-3 py-8 text-sm text-neutral-600" colSpan={6}>
                    {showAll ? "Todavía no se leyó ningún ticket." : "No hay tickets por revisar."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
