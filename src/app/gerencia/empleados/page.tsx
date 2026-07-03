import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { EmpleadosClient } from "./EmpleadosClient";

export default async function EmpleadosPage() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") redirect("/");

  const employees = await prisma.employee.findMany({
    select: { id: true, displayName: true, role: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empleados</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Volver
        </Link>
      </div>
      <EmpleadosClient initial={employees} />
    </main>
  );
}
