import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function EgresosPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");
  redirect("/egresos/proveedores");
}
