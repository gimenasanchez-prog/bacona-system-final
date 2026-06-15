import { cookies } from "next/headers";
import { StockNav } from "./StockNav";

export default async function StockLayout({ children }: { children: React.ReactNode }) {
  const role = (await cookies()).get("bcn_role")?.value;
  return (
    <div>
      {role === "GERENCIA" && <StockNav />}
      {children}
    </div>
  );
}
