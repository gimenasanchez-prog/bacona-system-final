import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import CuentasCorrientesClient from "./CuentasCorrientesClient";

export const dynamic = "force-dynamic";

export default async function CuentasCorrientesPage() {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  const accounts = await CuentaCorrienteService.getAccountsWithBillingState();
  return <CuentasCorrientesClient initialAccounts={accounts} role={role} />;
}
