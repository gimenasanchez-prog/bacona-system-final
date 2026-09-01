import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import { ChequeService } from "@/modules/cheques/services/chequeService";
import CuentasCorrientesTabs from "./CuentasCorrientesTabs";

export const dynamic = "force-dynamic";

export default async function CuentasCorrientesPage() {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");

  const [accounts, lastPaymentAt, cheques] = await Promise.all([
    CuentaCorrienteService.getAccountsWithBillingState(),
    CuentaCorrienteService.getLastPaymentDate(),
    ChequeService.listCheques(),
  ]);
  return (
    <CuentasCorrientesTabs
      initialAccounts={accounts}
      initialLastPaymentAt={lastPaymentAt ? lastPaymentAt.toISOString() : null}
      initialCheques={cheques}
      role={role}
    />
  );
}
