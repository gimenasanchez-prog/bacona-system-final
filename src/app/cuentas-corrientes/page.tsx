import { CuentaCorrienteService } from "@/modules/cuentas_corrientes/services/cuentaCorrienteService";
import CuentasCorrientesClient from "./CuentasCorrientesClient";

export const dynamic = "force-dynamic";

export default async function CuentasCorrientesPage() {
  const accounts = await CuentaCorrienteService.getAccountsWithBillingState();
  return <CuentasCorrientesClient initialAccounts={accounts} />;
}
