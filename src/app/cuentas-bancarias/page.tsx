import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CuentasClient } from "./CuentasClient";

export default async function CuentasBancariasPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  return (
    <div className="mx-auto w-full max-w-6xl p-4 space-y-4">
      <div>
        <div className="text-lg font-semibold">Cuentas Bancarias</div>
        <div className="mt-1 text-sm text-neutral-600">
          Brubank, Galicia, BBVA — saldo, esperado según ventas, y conciliación.
        </div>
      </div>
      <CuentasClient isGerencia={role === "GERENCIA"} />
    </div>
  );
}
