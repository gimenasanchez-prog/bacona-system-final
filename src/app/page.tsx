import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { IdentifyForm } from "./IdentifyForm";
import { clearIdentityAction } from "@/modules/caja/actions/identifyAction";

function NavCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-700">
        {title}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </div>
  );
}

function NavRow({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "block rounded-md border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          : "block rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      }
    >
      {label}
    </Link>
  );
}

export default async function HomePage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const hasSession = !!jar.get("bcn_cashSessionId")?.value;

  if (!role) {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, role: true },
      orderBy: { displayName: "asc" },
    });
    return (
      <main className="mx-auto max-w-lg space-y-3 pt-8">
        <h1 className="text-xl font-semibold">¿Quién sos?</h1>
        <p className="text-sm text-neutral-600">Tocá tu nombre para entrar.</p>
        <IdentifyForm employees={employees} />
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">BACOÑA</h1>
        <form action={clearIdentityAction}>
          <button type="submit" className="rounded-md border px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
            Cambiar usuario
          </button>
        </form>
      </div>

      {role === "GERENCIA" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NavCard title="Gestión">
            <NavRow href="/caja/local" label="Caja BCÑ" />
            <NavRow href="/caja/gerencia" label="Caja Gerencia" />
            <NavRow href="/caja/consolidado" label="Consolidado de Caja" />
            <NavRow href="/cuentas-bancarias" label="Cuentas Bancarias" />
            <NavRow href="/cuentas-corrientes" label="Cuentas Corrientes" />
            <NavRow href="/egresos" label="Egresos" />
            <NavRow href="/gerencia/empleados" label="Empleados" />
            <NavRow href="/gerencia/precios" label="Precios" />
            <NavRow href="/rentabilidad" label="Rentabilidad" />
            <NavRow href="/reportes" label="Reportes" />
          </NavCard>
          <NavCard title="Operación">
            {hasSession ? (
              <NavRow href="/pos" label="Ventas" primary />
            ) : (
              <NavRow href="/caja/abrir" label="Abrir turno para vender" primary />
            )}
            <NavRow href="/compras" label="Compras" />
            <NavRow href="/mermas" label="Mermas" />
            {hasSession && <NavRow href="/caja/turno" label="Mi turno" />}
            <NavRow href="/produccion" label="Producción" />
            <NavRow href="/stock" label="Stock" />
          </NavCard>
        </div>
      )}

      {role === "CAJA_LOCAL" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NavCard title="Ventas">
            {hasSession ? (
              <NavRow href="/pos" label="Ir a Ventas" primary />
            ) : (
              <NavRow href="/caja/abrir" label="Abrir turno" primary />
            )}
            <NavRow href="/caja/local" label="Caja BCÑ" />
            {hasSession && <NavRow href="/caja/turno" label="Mi turno" />}
            <NavRow href="/horas" label="Mi Horario" />
          </NavCard>
          <NavCard title="Operación">
            <NavRow href="/mermas" label="Mermas" />
            <NavRow href="/produccion" label="Producción" />
            <NavRow href="/stock" label="Stock" />
          </NavCard>
        </div>
      )}

      {role === "ADMINISTRATIVO" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NavCard title="Administración">
            <NavRow href="/caja/consolidado" label="Consolidado de Caja" />
            <NavRow href="/cuentas-bancarias" label="Cuentas Bancarias" />
            <NavRow href="/cuentas-corrientes" label="Cuentas Corrientes" />
            <NavRow href="/egresos" label="Egresos" />
            <NavRow href="/rentabilidad" label="Rentabilidad" />
            <NavRow href="/reportes" label="Reportes" />
          </NavCard>
          <NavCard title="Operación">
            <NavRow href="/stock" label="Stock" />
          </NavCard>
        </div>
      )}

      {role === "ASOCIADO" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NavCard title="Ventas">
            {hasSession ? (
              <NavRow href="/pos" label="Ir a Ventas" primary />
            ) : (
              <NavRow href="/caja/abrir" label="Abrir turno" primary />
            )}
            {hasSession && <NavRow href="/caja/turno" label="Mi turno" />}
            <NavRow href="/horas" label="Mi Horario" />
          </NavCard>
          <NavCard title="Operación">
            <NavRow href="/mermas" label="Mermas" />
            <NavRow href="/produccion" label="Producción" />
            <NavRow href="/stock" label="Stock" />
          </NavCard>
        </div>
      )}
    </main>
  );
}
