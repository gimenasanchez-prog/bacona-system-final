"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/egresos/proveedores", label: "Proveedores" },
  { href: "/egresos/tarjetas", label: "Tarjetas de crédito" },
  { href: "/egresos/costos-fijos", label: "Costos fijos" },
];

const GERENCIA_ONLY_TABS = [{ href: "/egresos/sierra-delta", label: "Deuda SierraDelta" }];

export function EgresosNav({ isGerencia = false }: { isGerencia?: boolean }) {
  const pathname = usePathname();
  const tabs = isGerencia ? [...TABS, ...GERENCIA_ONLY_TABS] : TABS;
  return (
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
