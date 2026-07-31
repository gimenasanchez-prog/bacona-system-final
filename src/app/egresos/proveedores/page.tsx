import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EgresosNav } from "../EgresosNav";
import { ProveedoresClient } from "./ProveedoresClient";

export default async function ProveedoresPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div>
        <div className="text-lg font-semibold">Egresos y estado de pago a proveedores</div>
        <div className="mt-1 text-sm text-neutral-600">
          Quién nos debe plata, cuánto, y cómo se le paga.
        </div>
      </div>
      <EgresosNav />
      <ProveedoresClient isGerencia={role === "GERENCIA"} />
    </div>
  );
}
