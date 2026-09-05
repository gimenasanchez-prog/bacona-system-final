import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EgresosNav } from "../EgresosNav";
import { TarjetasClient } from "./TarjetasClient";

export default async function TarjetasPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div>
        <div className="text-lg font-semibold">Egresos y estado de pago a proveedores</div>
        <div className="mt-1 text-sm text-neutral-600">
          Tarjetas de crédito — cuotas acumuladas por período de resumen.
        </div>
      </div>
      <EgresosNav isGerencia={role === "GERENCIA"} />
      <TarjetasClient isGerencia={role === "GERENCIA"} />
    </div>
  );
}
