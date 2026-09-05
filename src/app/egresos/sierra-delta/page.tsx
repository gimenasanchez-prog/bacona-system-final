import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EgresosNav } from "../EgresosNav";
import { SierraDeltaClient } from "./SierraDeltaClient";

export default async function SierraDeltaPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") redirect("/");

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div>
        <div className="text-lg font-semibold">Deuda de BCÑ con SierraDelta</div>
        <div className="mt-1 text-sm text-neutral-600">
          Retorno de inversión y sueldos gerenciales adeudados — visible solo para Gerencia.
        </div>
      </div>
      <EgresosNav isGerencia />
      <SierraDeltaClient />
    </div>
  );
}
