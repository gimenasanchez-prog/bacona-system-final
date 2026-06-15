"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StockNav() {
  const path = usePathname();

  const link = (href: string, label: string) => {
    const active = path === href;
    return active ? (
      <span className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-800 cursor-default">
        {label}
      </span>
    ) : (
      <Link href={href} className="rounded-md border px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
        {label}
      </Link>
    );
  };

  return (
    <div className="mb-4 flex items-center gap-2 border-b pb-3">
      {link("/stock", "Dashboard")}
      {link("/stock/admin", "Auditoría de Recetas")}
    </div>
  );
}
