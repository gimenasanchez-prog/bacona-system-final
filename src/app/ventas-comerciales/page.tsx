import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ComercialSaleService } from "@/modules/ventas_comerciales/services/comercialSaleService";
import VentasComercialesClient from "./VentasComercialesClient";

export const dynamic = "force-dynamic";

export default async function VentasComercialesPage() {
  const role = (await cookies()).get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "COMERCIAL" && role !== "ADMINISTRATIVO") redirect("/");

  const batches = await ComercialSaleService.listBatches();
  return <VentasComercialesClient initialBatches={batches} role={role} />;
}
