import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { PreciosService } from "@/modules/precios/services/preciosService";
import { PreciosClient } from "./PreciosClient";

export default async function PreciosPage() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") redirect("/");

  const products = await PreciosService.listGroupedByCategory();

  return (
    <main className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Precios</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Volver
        </Link>
      </div>
      <PreciosClient initial={products} />
    </main>
  );
}
