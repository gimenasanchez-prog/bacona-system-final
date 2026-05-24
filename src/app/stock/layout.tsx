import { cookies } from "next/headers";
import Link from "next/link";

export default async function StockLayout({ children }: { children: React.ReactNode }) {
  const role = (await cookies()).get("bcn_role")?.value;
  return (
    <div>
      {role === "GERENCIA" && (
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <Link
            href="/stock"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Dashboard
          </Link>
          <Link
            href="/stock/admin"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Auditoría de Recetas
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}
