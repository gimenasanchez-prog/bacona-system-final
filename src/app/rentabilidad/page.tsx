import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RentabilidadClient } from "./RentabilidadClient";

export default async function RentabilidadPage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") redirect("/");
  return <RentabilidadClient isGerencia={role === "GERENCIA"} />;
}
